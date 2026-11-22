/**
 * @file js/player.js
 * @description Motor de reproducción de audio híbrido (HTML5 Audio + HLS.js).
 * Gestiona de forma transparente flujos MP3/AAC de Shoutcast/Icecast y flujos HLS (.m3u8 de RTVE),
 * resolviendo incompatibilidades entre navegadores y políticas CORS.
 */

class AudioPlayerService {
  constructor() {
    // Instancia central del elemento HTML5 Audio
    this.audio = new Audio();
    this.audio.preload = 'none';

    // Instancia de Hls.js para reproducción de transmisiones HLS (.m3u8)
    this.hls = null;

    // Emisora actualmente seleccionada
    this.currentStation = null;

    // Estados de reproducción posibles: 'IDLE', 'BUFFERING', 'PLAYING', 'PAUSED', 'ERROR'
    this.state = 'IDLE';

    // Control de reintentos automáticos en caso de desconexión momentánea de stream
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryTimer = null;

    // Callbacks de suscripción a eventos
    this.listeners = {
      stateChange: [],
      error: [],
      stationChange: [],
      volumeChange: []
    };

    // Restaurar volumen guardado o usar 80% por defecto
    const savedVolume = parseFloat(localStorage.getItem('tunein_volume'));
    this.audio.volume = isNaN(savedVolume) ? 0.8 : Math.max(0, Math.min(1, savedVolume));

    this._bindAudioEvents();
  }

  /**
   * Suscribe escuchadores a los eventos nativos del elemento de audio.
   * @private
   */
  _bindAudioEvents() {
    this.audio.addEventListener('loadstart', () => this._setState('BUFFERING'));
    this.audio.addEventListener('waiting', () => this._setState('BUFFERING'));
    this.audio.addEventListener('playing', () => {
      this.retryCount = 0; // Reiniciar contador de reintentos al reproducir con éxito
      this._setState('PLAYING');
    });
    this.audio.addEventListener('pause', () => {
      if (this.state !== 'BUFFERING' && this.state !== 'ERROR') {
        this._setState('PAUSED');
      }
    });
    this.audio.addEventListener('error', (e) => {
      console.warn('[AudioPlayer] Error en elemento HTML5 Audio:', e);
      this._handleStreamError('Error al decodificar la señal de audio de la emisora.');
    });
  }

  /**
   * Registra un callback para eventos específicos del reproductor.
   * @param {'stateChange'|'error'|'stationChange'|'volumeChange'} event 
   * @param {Function} callback 
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Emite un evento a todos los escuchadores registrados.
   * @private
   */
  _emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[AudioPlayer] Error en callback de evento ${event}:`, err);
        }
      });
    }
  }

  /**
   * Actualiza el estado de reproducción y notifica a la interfaz de usuario.
   * @private
   */
  _setState(newState) {
    this.state = newState;
    this._emit('stateChange', { state: this.state, station: this.currentStation });
  }

  /**
   * Carga y reproduce la emisora especificada.
   * Determina automáticamente si debe emplear el motor HLS.js o el decodificador nativo MP3.
   * @param {Object} station Objeto con metadatos y URL de la emisora
   */
  playStation(station) {
    if (!station || !station.streamUrl) {
      console.error('[AudioPlayer] Emisora inválida o sin URL de transmisión.');
      return;
    }

    // Cancelar cualquier temporizador de reintento previo
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Si ya estamos reproduciendo la misma emisora y está pausada, reanudar
    if (this.currentStation && this.currentStation.id === station.id && this.audio.src) {
      if (this.state === 'PAUSED') {
        this.resume();
        return;
      }
    }

    this.currentStation = station;
    this._emit('stationChange', this.currentStation);
    this._setState('BUFFERING');

    // Desmontar instancia previa de HLS si existía
    this._cleanupHls();

    const isHlsUrl = station.streamUrl.includes('.m3u8') || station.protocol === 'hls';

    if (isHlsUrl) {
      this._playHlsStream(station.streamUrl);
    } else {
      this._playDirectStream(station.streamUrl);
    }
  }

  /**
   * Reproduce una señal HLS (.m3u8) empleando Hls.js o soporte nativo (Safari).
   * @private
   */
  _playHlsStream(url) {
    // Caso 1: Navegadores con soporte Hls.js (Chrome, Firefox, Edge, etc.)
    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30
      });

      this.hls.loadSource(url);
      this.hls.attachMedia(this.audio);

      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        this.audio.play().catch(err => {
          console.warn('[AudioPlayer] Autoplay bloqueado por el navegador o error:', err);
          this._setState('PAUSED');
        });
      });

      this.hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('[AudioPlayer] Error HLS.js reportado:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('[AudioPlayer] Error fatal de red en HLS, intentando recuperar...');
              this.hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('[AudioPlayer] Error fatal de medios en HLS, intentando recuperar...');
              this.hls.recoverMediaError();
              break;
            default:
              this._cleanupHls();
              this._handleStreamError('Fallo irrecuperable en la transmisión HLS.');
              break;
          }
        }
      });
    }
    // Caso 2: Soporte nativo de HLS (Safari en macOS / iOS)
    else if (this.audio.canPlayType('application/vnd.apple.mpegurl')) {
      this.audio.src = url;
      this.audio.play().catch(err => {
        console.warn('[AudioPlayer] Error al iniciar reproducción nativa HLS:', err);
        this._setState('PAUSED');
      });
    } else {
      this._handleStreamError('Tu navegador no admite reproducción de transmisiones HLS.');
    }
  }

  /**
   * Reproduce una señal de audio directa (MP3 / AAC / Icecast / Shoutcast).
   * Al no requerir CORS en la etiqueta audio directa, asegura compatibilidad con cualquier servidor.
   * @private
   */
  _playDirectStream(url) {
    // Añadir parámetro timestamp para evitar respuestas cacheadas en servidores proxy
    const cacheBuster = (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    this.audio.src = url + cacheBuster;
    this.audio.play().catch(err => {
      console.warn('[AudioPlayer] Autoplay bloqueado o error al reproducir MP3 directo:', err);
      this._setState('PAUSED');
    });
  }

  /**
   * Limpia y destruye recursos asociados a Hls.js
   * @private
   */
  _cleanupHls() {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
  }

  /**
   * Gestiona errores de emisión implementando reintentos exponenciales.
   * @private
   */
  _handleStreamError(message) {
    if (this.retryCount < this.maxRetries && this.currentStation) {
      this.retryCount++;
      const delay = this.retryCount * 2000;
      console.log(`[AudioPlayer] Reintentando conexión (${this.retryCount}/${this.maxRetries}) en ${delay}ms...`);
      this._setState('BUFFERING');
      this.retryTimer = setTimeout(() => {
        this.playStation(this.currentStation);
      }, delay);
    } else {
      this._setState('ERROR');
      this._emit('error', {
        message: message || 'No se pudo conectar con la emisora.',
        station: this.currentStation
      });
    }
  }

  /**
   * Pausa la transmisión en directo.
   */
  pause() {
    this.audio.pause();
    this._setState('PAUSED');
  }

  /**
   * Reanuda la reproducción.
   */
  resume() {
    if (this.currentStation) {
      this.audio.play().catch(err => {
        console.error('[AudioPlayer] Error al reanudar reproducción:', err);
        this._setState('PAUSED');
      });
    }
  }

  /**
   * Alterna entre reproducir y pausar.
   */
  togglePlay() {
    if (this.state === 'PLAYING') {
      this.pause();
    } else if (this.state === 'PAUSED' || this.state === 'IDLE') {
      if (this.currentStation) {
        this.resume();
      }
    }
  }

  /**
   * Establece el volumen de salida (0.0 a 1.0) y lo almacena localmente.
   * @param {number} val 
   */
  setVolume(val) {
    const clamped = Math.max(0, Math.min(1, val));
    this.audio.volume = clamped;
    localStorage.setItem('tunein_volume', clamped);
    this._emit('volumeChange', clamped);
  }

  /**
   * Silencia o restablece el audio.
   */
  toggleMute() {
    this.audio.muted = !this.audio.muted;
    this._emit('volumeChange', this.audio.muted ? 0 : this.audio.volume);
    return this.audio.muted;
  }
}

// Exportación modular para navegador y tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AudioPlayerService };
}
