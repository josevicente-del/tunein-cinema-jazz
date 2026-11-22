/**
 * @file js/audio-identifier.js
 * @description Servicio de reconocimiento acústico y metadatos en tiempo real (estilo AHA Music y Shazam).
 * Ofrece máxima fiabilidad combinando:
 * 1. Muestreo directo del Stream de la emisora en el servidor de Shazam (sin cortes, calidad HD sin compresión ni ruido ambiental).
 * 2. Captura acústica en vivo mediante micrófono con remuestreo PCM automático a 16000Hz (estándar Shazam).
 * 3. Fallback inteligente con catálogo musical (Apple Music / iTunes) y EPG.
 * 100% Gratuito, sin límites de peticiones ni suscripciones.
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
   * Realiza un remuestreo lineal de audio PCM a la tasa deseada (ej. 44.1k/48k -> 16kHz).
   * @param {Float32Array} sourceBuffer 
   * @param {number} sourceRate 
   * @param {number} targetRate 
   * @returns {Float32Array}
   */
  downsampleBuffer(sourceBuffer, sourceRate, targetRate = 16000) {
    if (sourceRate === targetRate || sourceRate <= 0) {
      return sourceBuffer;
    }
    const sampleRateRatio = sourceRate / targetRate;
    const newLength = Math.round(sourceBuffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetSource = 0;

    while (offsetResult < result.length) {
      const nextOffsetSource = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetSource; i < nextOffsetSource && i < sourceBuffer.length; i++) {
        accum += sourceBuffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? (accum / count) : 0;
      offsetResult++;
      offsetSource = nextOffsetSource;
    }
    return result;
  }

  /**
   * Convierte un Float32Array de muestras PCM a un contenedor WAV estándar (16-bit PCM, 16000Hz, Mono).
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
      const s = Math.max(-1, Math.min(1, pcmSamples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Captura una muestra acústica mediante micrófono con remuestreo exacto a 16000Hz.
   * @param {number} durationMs 
   * @param {Function} onTick 
   * @returns {Promise<Blob>}
   */
  async recordAudioSnippet(durationMs = 5000, onTick = null) {
    if (!this.isSupported()) {
      throw new Error('Tu navegador no soporta captura de audio mediante micrófono.');
    }

    let audioStream = null;
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

    this.currentStream = audioStream;
    this.isRecording = true;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    this.currentAudioContext = audioCtx;

    const source = audioCtx.createMediaStreamSource(audioStream);
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

    return new Promise((resolve) => {
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

        try {
          recorderNode.disconnect();
          source.disconnect();
          if (audioCtx.state !== 'closed') audioCtx.close();
        } catch {}

        if (this.currentStream) {
          this.currentStream.getTracks().forEach(track => track.stop());
          this.currentStream = null;
        }

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

        // Remuestrear de la frecuencia nativa del hardware (ej. 44.1k o 48k) a 16000Hz estándar
        const targetRate = 16000;
        const downsampled = this.downsampleBuffer(mergedSamples, audioCtx.sampleRate || 44100, targetRate);
        const wavBlob = this.encodeWav(downsampled, targetRate);
        resolve(wavBlob);
      };

      setTimeout(finishRecording, durationMs);
    });
  }

  /**
   * Envía una petición de reconocimiento al backend serverless de Shazam (/api/identify).
   * Acepta streamUrl (reconocimiento directo de servidor) o audioBase64 (micrófono).
   * @param {Object} payload { streamUrl, audioBase64 }
   * @returns {Promise<Object|null>}
   */
  async recognizeWithShazamServerless(payload = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      console.warn('[ShazamServerless] Error o timeout en reconocimiento:', err.message);
      return null;
    }
  }

  /**
   * Envía la muestra acústica grabada a la API de reconocimiento de AudD como respaldo.
   * @param {Blob} audioBlob 
   * @returns {Promise<Object|null>}
   */
  async recognizeWithAudD(audioBlob) {
    if (!audioBlob) return null;
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
   * consulta el catálogo musical de Apple Music / iTunes utilizando los datos contextuales.
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
   * Método principal: Orquesta el reconocimiento acústico con máxima fiabilidad:
   * 1. Prueba reconocimiento directo en servidor mediante la URL del stream de la emisora.
   * 2. Si la emisora no tiene stream muestreable (ej. HLS) o no hubo match, activa el micrófono WAV remuestreado a 16kHz.
   * 3. Aplica fallback con catálogo musical oficial.
   * @param {Object} options 
   * @returns {Promise<Object|null>}
   */
  async identifyPlayingMusic(options = {}) {
    let stateCallback = () => {};
    let isAutomatic = false;
    let station = null;
    let context = {};

    if (typeof options === 'function') {
      stateCallback = options;
    } else if (options && typeof options === 'object') {
      if (typeof options.onProgress === 'function') stateCallback = options.onProgress;
      isAutomatic = !!options.isAutomatic;
      station = options.station || null;
      context = options.context || {};
    }

    try {
      // 1. PRIMER INTENTO: Muestreo de stream directo en servidor de Shazam
      if (station && station.streamUrl && !station.streamUrl.includes('.m3u8')) {
        stateCallback({
          state: 'ANALYZING',
          message: isAutomatic 
            ? '⚡ Identificando canción directamente del stream digital...' 
            : '📡 Conectando con la señal en directo y analizando huella acústica...',
          progress: 0,
          isAutomatic
        });

        const directResult = await this.recognizeWithShazamServerless({ streamUrl: station.streamUrl });
        if (directResult) {
          stateCallback({
            state: 'SUCCESS',
            message: `✨ ¡Canción identificada! ${directResult.song}`,
            result: directResult,
            isAutomatic
          });
          return directResult;
        }
      }

      // 2. SEGUNDO INTENTO: Captura acústica en vivo (micrófono o altavoz)
      stateCallback({
        state: 'LISTENING',
        message: isAutomatic 
          ? '⚡ Escuchando audio en emisión...' 
          : '🎧 Escuchando audio en directo... Permanece escuchando unos segundos',
        progress: 5,
        isAutomatic
      });

      const audioBlob = await this.recordAudioSnippet(5000, (secondsLeft) => {
        stateCallback({
          state: 'LISTENING',
          message: isAutomatic
            ? `⚡ Identificando canción (${secondsLeft}s)...`
            : `🎧 Escuchando audio... (${secondsLeft}s restantes)`,
          progress: secondsLeft,
          isAutomatic
        });
      });

      stateCallback({
        state: 'ANALYZING',
        message: '🧠 Analizando huella acústica con el motor de Shazam...',
        progress: 0,
        isAutomatic
      });

      // Convertir Blob a Base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = btoa(binary);

      // Reconocimiento acústico por Shazam Serverless
      let identified = await this.recognizeWithShazamServerless({ audioBase64: base64Audio });

      // Respaldo AudD secundario
      if (!identified) {
        identified = await this.recognizeWithAudD(audioBlob);
      }

      // Fallback contextual en Apple Music
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
            : 'No se detectó una huella acústica clara en este instante. Prueba de nuevo en unos segundos.',
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

// Exportar instancia global única
const ahaShazamIdentifier = new AhaShazamIdentifierService();
