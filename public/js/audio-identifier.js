/**
 * @file js/audio-identifier.js
 * @description Servicio de reconocimiento acústico y metadatos en tiempo real (estilo AHA Music y Shazam).
 * Captura audio nativo en formato WAV PCM (16-bit 16000Hz) en el navegador mediante AudioContext,
 * lo envía a la función serverless /api/identify de Shazam (100% gratuita y sin cuota),
 * y aplica fallback dinámico con metadatos digitales y catálogo oficial.
 */

class AhaShazamIdentifierService {
  constructor() {
    this.apiEndpoint = 'https://api.audd.io/';
    this.defaultApiToken = 'test';
    this.isRecording = false;
    this.currentAudioContext = null;
    this.currentStream = null;
  }

  /**
   * Verifica si el navegador soporta captura de audio mediante MediaDevices y Web Audio API.
   * @returns {boolean}
   */
  isSupported() {
    return !!(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (window.AudioContext || window.webkitAudioContext)
    );
  }

  /**
   * Convierte un Float32Array de muestras PCM a un contenedor WAV estándar (16-bit PCM, 16000Hz, Mono).
   * Este contenedor es universalmente compatible con todos los decodificadores de Shazam y servidores de audio.
   * @param {Float32Array} pcmSamples 
   * @param {number} sampleRate 
   * @returns {Blob}
   */
  encodeWav(pcmSamples, sampleRate = 16000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmSamples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // Escribir cabecera RIFF WAV
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 para PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 = PCM lineal)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Escribir muestras PCM de 16 bits
    let offset = 44;
    for (let i = 0; i < pcmSamples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, pcmSamples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Captura una muestra de audio limpia de 5 segundos directamente en formato WAV
   * utilizando la Web Audio API (compatible con todos los navegadores).
   * @param {number} durationMs 
   * @param {Function} onTick 
   * @param {HTMLAudioElement|null} audioElement 
   * @returns {Promise<Blob>}
   */
  async recordAudioSnippet(durationMs = 5000, onTick = null, audioElement = null) {
    let audioStream = null;

    // 1. Intentar capturar directamente el audio del reproductor
    if (audioElement) {
      try {
        if (typeof audioElement.captureStream === 'function') {
          audioStream = audioElement.captureStream();
        } else if (typeof audioElement.mozCaptureStream === 'function') {
          audioStream = audioElement.mozCaptureStream();
        }
      } catch (e) {
        console.warn('[AudioIdentifier] captureStream no permitido por CORS:', e.message);
        audioStream = null;
      }
    }

    // 2. Si no se pudo capturar directamente el elemento, solicitar entrada de audio/micrófono
    if (!audioStream || audioStream.getAudioTracks().length === 0) {
      if (!this.isSupported()) {
        throw new Error('Tu navegador no soporta captura de audio.');
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
          throw new Error('Permiso de micrófono no concedido para escuchar.');
        }
        throw new Error(`Error accediendo al audio: ${err.message}`);
      }
    }

    this.currentStream = audioStream;
    this.isRecording = true;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const targetSampleRate = 16000;
    const audioCtx = new AudioContextClass({ sampleRate: targetSampleRate });
    this.currentAudioContext = audioCtx;

    const source = audioCtx.createMediaStreamSource(audioStream);
    // Tamaño de buffer estándar para captura
    const bufferSize = 4096;
    const recorderNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    const audioData = [];

    recorderNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);
      audioData.push(new Float32Array(inputData));
    };

    source.connect(recorderNode);
    recorderNode.connect(audioCtx.destination);

    return new Promise((resolve, reject) => {
      let secondsLeft = Math.ceil(durationMs / 1000);
      if (typeof onTick === 'function') onTick(secondsLeft);

      const countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft >= 0 && typeof onTick === 'function') {
          onTick(secondsLeft);
        }
      }, 1000);

      const finishRecording = () => {
        clearInterval(countdownInterval);
        this.isRecording = false;

        // Desconectar nodos de audio y cerrar contexto
        try {
          recorderNode.disconnect();
          source.disconnect();
          if (audioCtx.state !== 'closed') audioCtx.close();
        } catch {}

        // Apagar tracks de micrófono para apagar el icono rojo de grabación del navegador
        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop());
          this.currentStream = null;
        }

        // Combinar todos los fragmentos Float32Array
        let totalLength = 0;
        for (let i = 0; i < audioData.length; i++) {
          totalLength += audioData[i].length;
        }

        const mergedSamples = new Float32Array(totalLength);
        let offset = 0;
        for (let i = 0; i < audioData.length; i++) {
          mergedSamples.set(audioData[i], offset);
          offset += audioData[i].length;
        }

        // Generar archivo WAV estándar
        const wavBlob = this.encodeWav(mergedSamples, audioCtx.sampleRate || targetSampleRate);
        resolve(wavBlob);
      };

      setTimeout(finishRecording, durationMs);
    });
  }

  /**
   * Envía la muestra de audio WAV a nuestra función serverless /api/identify
   * @param {Blob} audioBlob 
   * @returns {Promise<Object|null>}
   */
  async recognizeWithShazamServerless(audioBlob) {
    try {
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
        console.warn(`[ShazamServerless] Status HTTP ${response.status}`);
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
   * Envía la muestra acústica grabada a la API de reconocimiento de AudD como respaldo.
   * @param {Blob} audioBlob 
   * @returns {Promise<Object|null>}
   */
  async recognizeWithAudD(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'sample.wav');
    formData.append('api_token', this.defaultApiToken);
    formData.append('return', 'apple_music,spotify');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) return null;
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
          songLink: res.song_link || '',
          recognizedBy: 'AHA Music / AudD Acoustic Engine'
        };
      }
      return null;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  }

  /**
   * Fallback Inteligente: Si el motor acústico no encuentra coincidencia directa,
   * consulta el catálogo musical de Apple Music / iTunes utilizando los datos contextuales de la emisora o EPG.
   * @param {Object} contextDatos 
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
   * Método principal: orquesta la captura acústica en vivo (WAV 5s),
   * notifica los cambios de estado a la interfaz de usuario y devuelve el resultado.
   * @param {Function|Object} optionsOrCallback 
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

      stateCallback({
        state: 'ANALYZING',
        message: '🧠 Analizando huella acústica con el motor de Shazam...',
        progress: 0,
        isAutomatic
      });

      // 1. Shazam Serverless (Ilimitado y gratuito)
      let identified = await this.recognizeWithShazamServerless(audioBlob);

      // 2. Respaldo secundario AudD
      if (!identified) {
        identified = await this.recognizeWithAudD(audioBlob);
      }

      // 3. Fallback inteligente contextual
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
    this.isRecording = false;
    if (this.currentAudioContext && this.currentAudioContext.state !== 'closed') {
      try { this.currentAudioContext.close(); } catch {}
    }
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
  }
}

// Exportar instancia global
const ahaShazamIdentifier = new AhaShazamIdentifierService();
