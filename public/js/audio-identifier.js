/**
 * @file js/audio-identifier.js
 * @description Servicio de reconocimiento acústico en tiempo real (estilo AHA Music y Shazam).
 * Captura un fragmento de audio de la emisión en reproducción o a través del micrófono del dispositivo,
 * genera la huella digital y consulta el motor de reconocimiento acústico (AudD / ACRCloud)
 * para identificar el título de la canción, compositor, álbum y carátula oficial.
 */

class AhaShazamIdentifierService {
  constructor() {
    this.apiEndpoint = 'https://api.audd.io/';
    this.defaultApiToken = 'test'; // Token de evaluación para reconocimiento en vivo
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
   * Captura una muestra de audio de 5 segundos.
   * Intenta capturar directamente el audio del reproductor (captureStream) para no molestar al usuario,
   * o recurre de forma transparente al micrófono si el stream tiene restricciones de origen.
   * @param {number} durationMs Duración de la grabación en milisegundos (por defecto 5000 ms)
   * @param {Function} onTick Callback de cuenta regresiva por segundo
   * @param {HTMLAudioElement|null} audioElement Elemento de audio en reproducción
   * @returns {Promise<Blob>}
   */
  async recordAudioSnippet(durationMs = 5000, onTick = null, audioElement = null) {
    let audioStream = null;

    // 1. Intentar capturar directamente el flujo de audio de la pestaña sin solicitar permisos
    if (audioElement) {
      try {
        if (typeof audioElement.captureStream === 'function') {
          audioStream = audioElement.captureStream();
        } else if (typeof audioElement.mozCaptureStream === 'function') {
          audioStream = audioElement.mozCaptureStream();
        }
      } catch (streamErr) {
        console.warn('[AudioIdentifier] captureStream no permitido por política CORS:', streamErr.message);
        audioStream = null;
      }
    }

    // 2. Si no se pudo capturar directamente el elemento de audio, recurrir a entrada de micrófono
    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      if (!this.isSupported()) {
        throw new Error('Tu navegador no soporta captura de audio para reconocimiento acústico.');
      }

      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true
          }
        });
      } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error('Permiso de micrófono no concedido para el reconocimiento acústico.');
        }
        throw new Error(`Error accediendo al audio: ${err.message}`);
      }
    }

    this.currentStream = audioStream;

    // Determinar el mejor formato soportado por el navegador (WebM Opus, Ogg Opus o MP4)
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

    this.currentRecorder = new MediaRecorder(this.currentStream, { mimeType });
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

        // Detener inmediatamente las pistas de audio para liberar el hardware y no mantener el micro abierto
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
   * Envía la muestra acústica grabada a la API de reconocimiento de AudD
   * para obtener los metadatos oficiales de la canción.
   * @param {Blob} audioBlob 
   * @returns {Promise<Object|null>}
   */
  async recognizeWithAudD(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'sample.webm');
    formData.append('api_token', this.defaultApiToken);
    formData.append('return', 'apple_music,spotify');

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Servidor de reconocimiento no disponible (HTTP ${response.status})`);
    }

    const data = await response.json();

    if (data.status === 'success' && data.result) {
      const res = data.result;
      let artwork = '';

      // Extraer carátula en alta definición si viene de Apple Music o Spotify
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
  }

  /**
   * Método principal: orquesta la captura acústica en vivo (5 segundos),
   * notifica los cambios de estado a la interfaz de usuario y devuelve el resultado.
   * Soporta tanto invocación manual por el usuario como ejecución 100% AUTOMÁTICA en segundo plano.
   * @param {Function|Object} optionsOrCallback Callback o { isAutomatic, audioElement, onProgress }
   * @returns {Promise<Object|null>}
   */
  async identifyPlayingMusic(optionsOrCallback) {
    let stateCallback = () => {};
    let isAutomatic = false;
    let audioElement = null;

    if (typeof optionsOrCallback === 'function') {
      stateCallback = optionsOrCallback;
    } else if (optionsOrCallback && typeof optionsOrCallback === 'object') {
      if (typeof optionsOrCallback.onProgress === 'function') stateCallback = optionsOrCallback.onProgress;
      isAutomatic = !!optionsOrCallback.isAutomatic;
      audioElement = optionsOrCallback.audioElement || null;
    }

    try {
      // 1. Estado de escucha acústica
      stateCallback({
        state: 'LISTENING',
        message: isAutomatic 
          ? '⚡ Reconociendo música automáticamente en emisión...' 
          : '🎧 Escuchando audio de la emisora en vivo...',
        progress: 5,
        isAutomatic
      });

      const audioBlob = await this.recordAudioSnippet(5000, (secondsLeft) => {
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
        message: '🧠 Analizando huella acústica con el motor de Shazam & AHA Music...',
        progress: 0,
        isAutomatic
      });

      const identified = await this.recognizeWithAudD(audioBlob);

      if (identified) {
        stateCallback({
          state: 'SUCCESS',
          message: isAutomatic
            ? `✨ Canción reconocida automáticamente: ${identified.song}`
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
            : 'No se encontró coincidencia acústica exacta. Prueba con el buscador de canciones.',
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
      this.currentRecorder.stop();
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

