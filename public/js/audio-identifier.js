/**
 * @file js/audio-identifier.js
 * @description Servicio de reconocimiento acústico y metadatos en tiempo real (estilo AHA Music y Shazam).
 * Combina captura acústica mejorada (6 segundos, audio estéreo sin filtros destructivos de voz),
 * consulta inteligente a APIs de huella sonora, y fallback dinámico inteligente
 * a metadatos de emisión y enriquecimiento por catálogo (iTunes / MusicBrainz / Spotify).
 */

class AhaShazamIdentifierService {
  constructor() {
    this.apiEndpoint = 'https://api.audd.io/';
    this.defaultApiToken = 'test'; // Token público de evaluación para reconocimiento en vivo
    this.isRecording = false;
    this.currentRecorder = null;
    this.currentStream = null;
  }

  /**
   * Verifica si el navegador soporta captura de audio mediante MediaDevices y MediaRecorder.
   * @returns {boolean}
   */
  isSupported() {
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      typeof window.MediaRecorder !== 'undefined'
    );
  }

  /**
   * Captura una muestra de audio optimizada de 6 segundos.
   * Prioridad 1: Intenta capturar directamente el audio del elemento <audio> (captureStream) sin solicitar micrófono.
   * Prioridad 2: Si el origen de streaming tiene restricciones CORS en el stream DOM, solicita el micrófono
   * con configuración musical de alta fidelidad (sin supresión de ruido ni cancelación de eco que destruyan instrumentos).
   * @param {number} durationMs Duración de la grabación en milisegundos (por defecto 6000 ms)
   * @param {Function} onTick Callback de cuenta regresiva por segundo
   * @param {HTMLAudioElement|null} audioElement Elemento de audio en reproducción
   * @returns {Promise<Blob>}
   */
  async recordAudioSnippet(durationMs = 6000, onTick = null, audioElement = null) {
    let audioStream = null;

    // 1. Intentar capturar directamente el flujo de audio del elemento HTML5 Audio
    if (audioElement) {
      try {
        if (typeof audioElement.captureStream === 'function') {
          audioStream = audioElement.captureStream();
        } else if (typeof audioElement.mozCaptureStream === 'function') {
          audioStream = audioElement.mozCaptureStream();
        }
      } catch (streamErr) {
        console.warn('[AudioIdentifier] captureStream restringido por política CORS del navegador:', streamErr.message);
        audioStream = null;
      }
    }

    // 2. Si no se pudo capturar directamente el elemento de audio, recurrir a entrada de micrófono
    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      if (!this.isSupported()) {
        throw new Error('Tu navegador no soporta captura de audio para reconocimiento acústico.');
      }

      try {
        // Configuración para música: Desactivar cancelación de eco y supresión de ruido para capturar frecuencias orquestales
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
            channelCount: 2
          }
        });
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('Permiso de micrófono denegado. Permite el acceso al micrófono para identificar lo que suena por tus altavoces.');
        }
        throw new Error(`Error accediendo a la entrada de audio: ${err.message}`);
      }
    }

    this.currentStream = audioStream;

    // Determinar el mejor formato soportado por el navegador (WebM Opus, OGG Opus, MP4)
    let mimeType = 'audio/webm';
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }
    }

    // Configurar bitrate alto (128 kbps) para máxima definición de la huella espectral
    try {
      this.currentRecorder = new MediaRecorder(this.currentStream, {
        mimeType,
        audioBitsPerSecond: 128000
      });
    } catch {
      this.currentRecorder = new MediaRecorder(this.currentStream);
    }

    const chunks = [];
    this.isRecording = true;

    return new Promise((resolve, reject) => {
      let secondsLeft = Math.ceil(durationMs / 1000);
      if (typeof onTick === 'function') onTick(secondsLeft);

      const countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft >= 0 && typeof onTick === 'function') {
          onTick(secondsLeft);
        }
      }, 1000);

      this.currentRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      this.currentRecorder.onstop = () => {
        clearInterval(countdownInterval);
        this.isRecording = false;

        // Detener inmediatamente las pistas de audio para liberar el hardware y apagar el icono de micro
        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop());
          this.currentStream = null;
        }

        const audioBlob = new Blob(chunks, { type: mimeType });
        resolve(audioBlob);
      };

      this.currentRecorder.onerror = (event) => {
        clearInterval(countdownInterval);
        this.isRecording = false;
        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop());
          this.currentStream = null;
        }
        reject(event.error || new Error('Error en la grabación de la muestra acústica.'));
      };

      // Iniciar captura
      this.currentRecorder.start(250);

      // Detener automáticamente al cumplirse la duración
      setTimeout(() => {
        if (this.currentRecorder && this.currentRecorder.state === 'recording') {
          this.currentRecorder.stop();
        }
      }, durationMs);
    });
  }

  /**
   * Envía la muestra de audio a nuestra función serverless /api/identify
   * que utiliza el motor nativo de Shazam de forma 100% gratuita y sin límites de cuota.
   * @param {Blob} audioBlob
   * @returns {Promise<Object|null>}
   */
  async recognizeWithShazamServerless(audioBlob) {
    try {
      // Convertir audioBlob a Base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64Audio }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[ShazamServerless] Status HTTP: ${response.status}`);
        return null;
      }

      const data = await response.json();
      if (data && data.success && data.match && data.song) {
        return {
          song: data.song,
          composer: data.composer,
          album: data.album || 'Banda Sonora / Álbum Oficial',
          artwork: data.artwork || '',
          songLink: data.url || '',
          recognizedBy: 'Shazam Official Engine (100% Free & Unlimited)'
        };
      }
      return null;
    } catch (err) {
      console.warn('[ShazamServerless] Fallo o timeout en reconocimiento:', err.message);
      return null;
    }
  }

  /**
   * Envía la muestra acústica grabada a la API de reconocimiento de AudD
   * con control estricto de timeout y extracción de carátula en alta definición.
   * @param {Blob} audioBlob 
   * @returns {Promise<Object|null>}
   */
  async recognizeWithAudD(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'sample.webm');
    formData.append('api_token', this.defaultApiToken);
    formData.append('return', 'apple_music,spotify');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[AudD] HTTP Error ${response.status}`);
        return null;
      }

      const data = await response.json();

      if (data.status === 'success' && data.result) {
        const res = data.result;
        let artwork = '';

        if (res.apple_music && res.apple_music.artwork && res.apple_music.artwork.url) {
          artwork = res.apple_music.artwork.url.replace('{w}x{h}', '600x600');
        } else if (res.spotify && res.spotify.album && res.spotify.album.images && res.spotify.album.images.length > 0) {
          artwork = res.spotify.album.images[0].url;
        }

        return {
          song: res.title || 'Tema Identificado',
          composer: res.artist || 'Artista / Compositor',
          album: res.album || 'Banda Sonora / Álbum Oficial',
          releaseDate: res.release_date || '',
          artwork: artwork,
          songLink: res.song_link || (res.spotify ? res.spotify.external_urls?.spotify : ''),
          recognizedBy: 'AHA Music / AudD Acoustic Engine'
        };
      }

      return null;
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[AudD] Petición abortada o fallida:', err.message);
      return null;
    }
  }

  /**
   * Fallback Inteligente: Si el motor acústico no encuentra coincidencia directa (o el token está saturado),
   * consulta el catálogo musical de Apple Music / iTunes utilizando los datos contextuales de la emisora o EPG.
   * @param {Object} contextDatos { query, title, presenter, station }
   * @returns {Promise<Object|null>}
   */
  async queryContextualCatalog(contextDatos = {}) {
    const { query, title, station } = contextDatos;
    const searchTerm = query || title;
    if (!searchTerm || searchTerm.length < 3) return null;

    try {
      const cleanTerm = searchTerm
        .replace(/(\(\d+.*?\)|\[.*?\]|en directo|directo|emisión|rne|radio \d)/gi, '')
        .trim();

      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanTerm)}&entity=song&limit=1`;
      const resp = await fetch(itunesUrl);
      if (!resp.ok) return null;

      const data = await resp.json();
      if (data.resultCount > 0 && data.results && data.results.length > 0) {
        const item = data.results[0];
        const hdArt = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');

        return {
          song: item.trackName || cleanTerm,
          composer: item.artistName || (station ? station.name : 'Varios Artistas'),
          album: item.collectionName || 'Banda Sonora Original',
          artwork: hdArt,
          recognizedBy: 'Apple Music Database Fallback'
        };
      }
    } catch (e) {
      console.warn('[ContextualFallback] Error consultando catálogo:', e.message);
    }
    return null;
  }

  /**
   * Método principal: orquesta la captura acústica en vivo (6 segundos),
   * notifica los cambios de estado a la interfaz de usuario y devuelve el resultado.
   * Soporta tanto invocación manual por el usuario como ejecución automática en segundo plano.
   * @param {Function|Object} optionsOrCallback Callback o { isAutomatic, audioElement, context, onProgress }
   * @returns {Promise<Object|null>}
   */
  async identifyPlayingMusic(optionsOrCallback) {
    let stateCallback = () => {};
    let isAutomatic = false;
    let audioElement = null;
    let context = {};

    if (typeof optionsOrCallback === 'function') {
      stateCallback = optionsOrCallback;
    } else if (optionsOrCallback && typeof optionsOrCallback === 'object') {
      if (typeof optionsOrCallback.onProgress === 'function') stateCallback = optionsOrCallback.onProgress;
      isAutomatic = !!optionsOrCallback.isAutomatic;
      audioElement = optionsOrCallback.audioElement || null;
      context = optionsOrCallback.context || {};
    }

    try {
      // 1. Estado de escucha acústica
      stateCallback({
        state: 'LISTENING',
        message: isAutomatic 
          ? '⚡ Reconociendo música automáticamente en emisión...' 
          : '🎧 Escuchando audio de la emisora en vivo...',
        progress: 6,
        isAutomatic
      });

      const audioBlob = await this.recordAudioSnippet(6000, (secondsLeft) => {
        stateCallback({
          state: 'LISTENING',
          message: isAutomatic
            ? `⚡ Identificando canción automáticamente (${secondsLeft}s)...`
            : `🎧 Escuchando audio... (${secondsLeft}s restantes)`,
          progress: secondsLeft,
          isAutomatic
        });
      }, audioElement);

      // 2. Estado de análisis de huella acústica
      stateCallback({
        state: 'ANALYZING',
        message: '🧠 Analizando huella acústica con el motor espectral...',
        progress: 0,
        isAutomatic
      });

      // Intento 1 (Principal): Shazam Serverless Engine (100% Gratuito, Sin Cuota)
      let identified = await this.recognizeWithShazamServerless(audioBlob);

      // Intento 2 (Alternativa acústica): AudD
      if (!identified) {
        identified = await this.recognizeWithAudD(audioBlob);
      }

      // Intento 3 (Fallback inteligente por catálogo): Contexto de emisora / EPG
      if (!identified && context && (context.title || context.query)) {
        identified = await this.queryContextualCatalog(context);
      }

      if (identified) {
        stateCallback({
          state: 'SUCCESS',
          message: isAutomatic
            ? `✨ Canción reconocida: ${identified.song}`
            : `✨ ¡Canción identificada con éxito!`,
          result: identified,
          isAutomatic
        });
        return identified;
      } else {
        stateCallback({
          state: 'NOT_FOUND',
          message: isAutomatic
            ? 'Emisión sin música identificable en este fragmento (voz/publicidad).'
            : 'No se detectó una huella acústica clara en este instante. Prueba con el buscador de canciones.',
          result: null,
          isAutomatic
        });
        return null;
      }
    } catch (err) {
      if (!isAutomatic) {
        console.warn('[AhaShazamIdentifier] Error:', err);
      }
      stateCallback({
        state: 'ERROR',
        message: err.message || 'Error durante la captura o identificación del audio.',
        error: err,
        isAutomatic
      });
      return null;
    }
  }

  /**
   * Cancela cualquier grabación en curso y apaga el micrófono o stream de audio.
   */
  cancel() {
    if (this.currentRecorder && this.currentRecorder.state === 'recording') {
      try { this.currentRecorder.stop(); } catch {}
    }
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
    this.isRecording = false;
  }
}

// Exportar instancia global
const ahaShazamIdentifier = new AhaShazamIdentifierService();
