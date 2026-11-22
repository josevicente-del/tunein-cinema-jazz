/**
 * @file js/app.js
 * @description Controlador principal de la interfaz de usuario para el clon de TuneIn Radio.
 * Incorpora registro de Service Worker PWA, instalación nativa en dispositivos,
 * y servicio dinámico de contadores de visitas totales y oyentes en línea.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Inicialización del motor de audio
  const player = new AudioPlayerService();

  // Gestión de favoritos en almacenamiento local
  let favorites = JSON.parse(localStorage.getItem('tunein_favs') || '[]');
  let currentCategory = 'all';
  let searchQuery = '';

  // Elementos principales de la interfaz
  const stationsGrid = document.getElementById('stations-grid');
  const featuredRow = document.getElementById('featured-row');
  const searchInput = document.getElementById('search-input');
  const filterButtons = document.querySelectorAll('.filter-btn');
  const currentStationTitle = document.getElementById('current-station-title');
  const currentStationDial = document.getElementById('current-station-dial');
  const currentStationLogo = document.getElementById('current-station-logo');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const spinnerIcon = document.getElementById('spinner-icon');
  const liveBadge = document.getElementById('live-badge');
  const volumeSlider = document.getElementById('volume-slider');
  const muteBtn = document.getElementById('mute-btn');
  const prevBtn = document.getElementById('prev-station-btn');
  const nextBtn = document.getElementById('next-station-btn');
  const visualizerContainer = document.getElementById('audio-visualizer');
  const activeStationPill = document.getElementById('active-station-genre');

  // Elementos de contadores en vivo y PWA
  const onlineCounterEl = document.getElementById('online-counter');
  const totalCounterEl = document.getElementById('total-counter');
  const installPwaBtn = document.getElementById('install-pwa-btn');

  // Elementos del Banner Now Playing (Canción, Carátula, Compositor, EPG y Buscador)
  const nowPlayingBanner = document.getElementById('now-playing-banner');
  const npAlbumArt = document.getElementById('np-album-art');
  const npLiveTag = document.getElementById('np-live-tag');
  const npSongTitle = document.getElementById('np-song-title');
  const npComposerName = document.getElementById('np-composer-name');
  const npAlbumName = document.getElementById('np-album-name');
  const npStationSource = document.getElementById('np-station-source');
  const npBadgeText = document.getElementById('np-badge-text');
  const npMetaRow = document.getElementById('np-meta-row');
  const npEpgDetails = document.getElementById('np-epg-details');
  const npEpgPresenter = document.getElementById('np-epg-presenter');
  const npEpgTimeslot = document.getElementById('np-epg-timeslot');
  const npEpgGenre = document.getElementById('np-epg-genre');
  const npEpgDesc = document.getElementById('np-epg-desc');
  const npEpgLink = document.getElementById('np-epg-link');
  const npEpgSourceTag = document.getElementById('np-epg-source-tag');
  const npRefreshWebBtn = document.getElementById('np-refresh-web-btn');

  // Elementos del Identificador Acústico Tipo AHA Music & Shazam
  const ahaShazamBox = document.getElementById('aha-shazam-box');
  const ahaListenBtn = document.getElementById('aha-listen-btn');
  const ahaBtnText = document.getElementById('aha-btn-text');
  const ahaStatusIndicator = document.getElementById('aha-status-indicator');
  const ahaStatusText = document.getElementById('aha-status-text');

  const npSearchContainer = document.getElementById('np-search-container');
  const npSearchForm = document.getElementById('np-search-form');
  const npSearchInput = document.getElementById('np-search-input');
  const npSearchBtn = document.getElementById('np-search-btn');
  const npSearchResults = document.getElementById('np-search-results');

  // Inicializar estado del volumen en el deslizador
  if (volumeSlider) {
    volumeSlider.value = player.audio.volume * 100;
  }

  /* ==========================================================================
     SISTEMA DE CONTADORES REALES: VISITAS GLOBALES Y PRESENCIA EN LÍNEA
     ========================================================================== */
  
  const onlineUnitEl = document.getElementById('online-unit');
  const totalUnitEl = document.getElementById('total-unit');

  // Limpiar cualquier residuo de contadores simulados previos (> 1000 visitas antiguas hardcodeadas)
  const legacyStored = localStorage.getItem('tunein_total_visits');
  if (legacyStored && parseInt(legacyStored, 10) > 1000) {
    localStorage.removeItem('tunein_total_visits');
  }

  /**
   * Formatea números con separador de miles en formato estándar español.
   * @param {number} num 
   * @returns {string}
   */
  function formatNumber(num) {
    return new Intl.NumberFormat('es-ES').format(num);
  }

  /**
   * Actualiza el valor visual del contador con una microanimación de pulso.
   * @param {HTMLElement} element 
   * @param {string|number} value 
   */
  function updateCounterWithPulse(element, value) {
    if (!element) return;
    element.textContent = value;
    element.classList.add('pulse-update');
    setTimeout(() => {
      element.classList.remove('pulse-update');
    }, 400);
  }

  // --- SERVICIO DE VISITAS REALES GLOBALES CON PERSISTENCIA EN LA NUBE ---
  const COUNT_KEY = 'tunein_cinema_jazz_visits';
  const API_COUNT_HIT = `https://countapi.mileshilliard.com/api/v1/hit/${COUNT_KEY}`;
  const API_COUNT_GET = `https://countapi.mileshilliard.com/api/v1/get/${COUNT_KEY}`;
  const FALLBACK_HIT = 'https://abacus.jasoncameron.dev/hit/tunein-cinema-jazz/visits';
  const FALLBACK_GET = 'https://abacus.jasoncameron.dev/get/tunein-cinema-jazz/visits';

  async function fetchRealVisits() {
    // Si esta sesión de navegador ya contó la visita, consultar el total sin inflar innecesariamente
    const alreadyCountedInSession = sessionStorage.getItem('tunein_visit_hit_done');
    const targetUrl = alreadyCountedInSession ? API_COUNT_GET : API_COUNT_HIT;

    try {
      const response = await fetch(targetUrl, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const val = parseInt(data.value, 10);
      if (!isNaN(val)) {
        sessionStorage.setItem('tunein_visit_hit_done', 'true');
        localStorage.setItem('tunein_total_visits', val);
        updateCounterWithPulse(totalCounterEl, formatNumber(val));
        if (totalUnitEl) totalUnitEl.textContent = val === 1 ? 'visita real' : 'visitas totales';
        return;
      }
    } catch (err) {
      console.warn('[Stats] Error al conectar con CountAPI, probando proveedor secundario:', err);
    }

    // Proveedor secundario de contingencia (Abacus Integer-as-a-Service)
    try {
      const fallbackUrl = alreadyCountedInSession ? FALLBACK_GET : FALLBACK_HIT;
      const response = await fetch(fallbackUrl, { method: 'GET' });
      if (!response.ok) throw new Error(`Fallback HTTP ${response.status}`);
      const data = await response.json();
      const val = parseInt(data.value, 10);
      if (!isNaN(val)) {
        sessionStorage.setItem('tunein_visit_hit_done', 'true');
        localStorage.setItem('tunein_total_visits', val);
        updateCounterWithPulse(totalCounterEl, formatNumber(val));
        if (totalUnitEl) totalUnitEl.textContent = val === 1 ? 'visita real' : 'visitas totales';
        return;
      }
    } catch (err) {
      console.warn('[Stats] Error en proveedor secundario, usando caché local real:', err);
    }

    // Si ambos proveedores fallan (ej. offline), usar el valor real almacenado localmente
    const cached = parseInt(localStorage.getItem('tunein_total_visits') || '1', 10);
    if (totalCounterEl) totalCounterEl.textContent = formatNumber(cached);
  }

  // Ejecutar petición de conteo real
  fetchRealVisits();

  // --- SERVICIO DE PRESENCIA EN LÍNEA REAL ---
  const myTabId = 'tab_' + Math.random().toString(36).substring(2, 9);
  const activeTabs = new Map();
  activeTabs.set(myTabId, Date.now());

  let isActivelyListening = false;

  function updateOnlineUI() {
    const now = Date.now();
    for (const [id, lastSeen] of activeTabs.entries()) {
      if (now - lastSeen > 6000) {
        activeTabs.delete(id);
      }
    }

    const onlineCount = Math.max(1, activeTabs.size);
    if (onlineCounterEl) {
      onlineCounterEl.textContent = onlineCount;
    }
    if (onlineUnitEl) {
      if (isActivelyListening) {
        onlineUnitEl.textContent = onlineCount === 1 ? 'oyente activo (escuchando)' : `${onlineCount} oyentes activos`;
      } else {
        onlineUnitEl.textContent = onlineCount === 1 ? 'visitante conectado' : `${onlineCount} visitantes conectados`;
      }
    }
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const presenceChannel = new BroadcastChannel('tunein_presence_channel');
    
    // Enviar latido cada 2.5 segundos
    setInterval(() => {
      presenceChannel.postMessage({ type: 'HEARTBEAT', tabId: myTabId, timestamp: Date.now() });
      activeTabs.set(myTabId, Date.now());
      updateOnlineUI();
    }, 2500);

    // Escuchar latidos de otras sesiones/pestañas
    presenceChannel.onmessage = (e) => {
      if (e.data && e.data.tabId) {
        activeTabs.set(e.data.tabId, Date.now());
        updateOnlineUI();
      }
    };

    window.addEventListener('beforeunload', () => {
      presenceChannel.postMessage({ type: 'BYE', tabId: myTabId });
    });
  }

  updateOnlineUI();

  /* ==========================================================================
     SOPORTE PROGRESSIVE WEB APP (PWA) Y SERVICE WORKER
     ========================================================================== */

  // Registro del Service Worker para soporte offline y cache
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registrado exitosamente con ámbito:', registration.scope);
        })
        .catch((error) => {
          console.warn('[PWA] Error en registro de Service Worker:', error);
        });
    });
  }

  // Gestión del banner nativo de instalación PWA
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir el diálogo nativo automático para gestionarlo con nuestro botón
    e.preventDefault();
    deferredPrompt = e;
    if (installPwaBtn) {
      installPwaBtn.style.display = 'inline-flex';
    }
  });

  if (installPwaBtn) {
    installPwaBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      // Mostrar el prompt nativo del navegador (Chrome, Edge, Android)
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] Respuesta del usuario a la instalación: ${outcome}`);
      deferredPrompt = null;
      installPwaBtn.style.display = 'none';
    });
  }

  window.addEventListener('appinstalled', () => {
    console.log('[PWA] La aplicación TuneIn Cinema & Jazz fue instalada correctamente.');
    if (installPwaBtn) {
      installPwaBtn.style.display = 'none';
    }
  });

  /* ==========================================================================
     GESTIÓN DE FAVORITOS Y RENDERIZADO DE EMISORAS
     ========================================================================== */

  function toggleFavorite(stationId) {
    if (favorites.includes(stationId)) {
      favorites = favorites.filter(id => id !== stationId);
    } else {
      favorites.push(stationId);
    }
    localStorage.setItem('tunein_favs', JSON.stringify(favorites));
    renderStations();
  }

  function createStationCardHtml(station, isCompact = false) {
    const isPlaying = player.currentStation && player.currentStation.id === station.id && player.state === 'PLAYING';
    const isBuffering = player.currentStation && player.currentStation.id === station.id && player.state === 'BUFFERING';
    const isFav = favorites.includes(station.id);

    // Evaluación horaria en tiempo real para Radio Klara (Jueves 22-24h, Domingos 22-24h, Martes 02-04h BSO / resto Jazz)
    let klaraScheduleHtml = '';
    let displayGenre = station.genre;
    if (station.id === 'radio-klara' && typeof getRadioKlaraScheduleState === 'function') {
      const scheduleState = getRadioKlaraScheduleState();
      displayGenre = scheduleState.currentGenre;
      klaraScheduleHtml = `
        <div class="klara-schedule-badge ${scheduleState.isSoundtrack ? 'is-live-bso' : 'is-scheduled'}" title="${scheduleState.scheduleText}">
          ${scheduleState.isSoundtrack ? '<span class="live-bso-dot"></span>' : '🕒'}
          <span>${scheduleState.badgeText}</span>
        </div>
      `;
    }

    // Insignia especial para 0N Movies on Radio (líder 24/7 BSO)
    const is0NMovies = station.id === 'movies-on-radio';

    return `
      <article class="station-card ${isPlaying ? 'is-playing' : ''} ${isBuffering ? 'is-buffering' : ''}" data-id="${station.id}">
        <div class="station-card-media">
          <img src="${station.logo}" alt="Logo de ${station.name}" class="station-logo" loading="lazy" />
          <div class="station-overlay">
            <button class="play-overlay-btn" aria-label="Reproducir ${station.name}" data-action="play" data-id="${station.id}">
              ${isBuffering ? '<span class="mini-spinner"></span>' : isPlaying ? '❚❚' : '▶'}
            </button>
          </div>
          <button class="fav-btn ${isFav ? 'active' : ''}" aria-label="Favorito" data-action="fav" data-id="${station.id}">
            ★
          </button>
          ${is0NMovies ? '<span class="soundtrack-lead-badge">★ 24/7 BSO CINE</span>' : ''}
          ${station.isSpanish ? '<span class="spain-badge">España</span>' : ''}
        </div>
        <div class="station-card-info">
          <div class="station-card-header">
            <h3 class="station-name">${station.name}</h3>
            ${isPlaying ? '<span class="equalizer-bars"><span class="bar"></span><span class="bar"></span><span class="bar"></span></span>' : ''}
          </div>
          <p class="station-dial">${station.dial}</p>
          <p class="station-genre-tag">${displayGenre}</p>
          ${klaraScheduleHtml}
          ${station.isAnalog ? `
            <button class="card-identify-btn" data-action="identify" data-id="${station.id}" title="Abrir identificador para esta emisora">
              🔍 Identificar qué suena
            </button>
          ` : ''}
          ${!isCompact ? `<p class="station-desc">${station.description}</p>` : ''}
        </div>
      </article>
    `;
  }

  function getFilteredStations() {
    return STATIONS.filter(st => {
      let matchesCat = true;
      if (currentCategory === 'jazz') {
        matchesCat = st.categories ? st.categories.includes('jazz') : st.category === 'jazz';
      } else if (currentCategory === 'soundtrack') {
        matchesCat = st.categories ? st.categories.includes('soundtrack') : st.category === 'soundtrack';
      } else if (currentCategory === 'spanish') {
        matchesCat = !!st.isSpanish;
      } else if (currentCategory === 'favorites') {
        matchesCat = favorites.includes(st.id);
      }

      let matchesSearch = true;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        matchesSearch = (
          st.name.toLowerCase().includes(q) ||
          st.genre.toLowerCase().includes(q) ||
          st.dial.toLowerCase().includes(q) ||
          st.city.toLowerCase().includes(q) ||
          (st.country && st.country.toLowerCase().includes(q)) ||
          st.description.toLowerCase().includes(q)
        );
      }

      return matchesCat && matchesSearch;
    });
  }

  function renderStations() {
    if (featuredRow) {
      const featuredList = STATIONS.filter(s => s.isFeatured);
      featuredRow.innerHTML = featuredList.map(s => createStationCardHtml(s, true)).join('');
    }

    if (stationsGrid) {
      const filtered = getFilteredStations();
      if (filtered.length === 0) {
        stationsGrid.innerHTML = `
          <div class="empty-state">
            <p class="empty-icon">📻</p>
            <h3>No se encontraron emisoras</h3>
            <p>Prueba a buscar otro término o selecciona una categoría diferente.</p>
          </div>
        `;
      } else if (currentCategory === 'all' && searchQuery.trim() === '') {
        // Modo catálogo completo: ordenado de manera impecable por grupos temáticos
        let groupsHtml = '';
        if (typeof STATION_GROUPS !== 'undefined') {
          STATION_GROUPS.forEach(grp => {
            const grpStations = STATIONS.filter(s => s.group === grp.id);
            if (grpStations.length > 0) {
              groupsHtml += `
                <div class="group-section-wrapper" id="group-${grp.id}">
                  <div class="group-header">
                    <div class="group-title-wrap">
                      <h3 class="group-title">${grp.title}</h3>
                      <p class="group-subtitle">${grp.subtitle}</p>
                    </div>
                    <span class="group-counter-pill">${grpStations.length} emisoras</span>
                  </div>
                  <div class="group-grid">
                    ${grpStations.map(s => createStationCardHtml(s, false)).join('')}
                  </div>
                </div>
              `;
            }
          });
        }
        stationsGrid.innerHTML = groupsHtml || `
          <div class="filtered-results-grid">
            ${filtered.map(s => createStationCardHtml(s, false)).join('')}
          </div>
        `;
      } else {
        stationsGrid.innerHTML = `
          <div class="filtered-results-grid">
            ${filtered.map(s => createStationCardHtml(s, false)).join('')}
          </div>
        `;
      }
    }
  }

  function updatePlayerUI(station) {
    if (!station) return;
    currentStationTitle.textContent = station.name;

    let dialText = `${station.dial} · ${station.country}`;
    let genreText = station.genre;

    if (station.id === 'radio-klara' && typeof getRadioKlaraScheduleState === 'function') {
      const schedule = getRadioKlaraScheduleState();
      dialText = `${station.dial} · ${schedule.scheduleText}`;
      genreText = schedule.currentGenre;
    }

    currentStationDial.textContent = dialText;
    currentStationLogo.src = station.logo;
    currentStationLogo.alt = `Logo de ${station.name}`;
    activeStationPill.textContent = genreText;

    // Actualizar inmediatamente la carátula y el título del banner superior al sintonizar la emisora
    if (npAlbumArt) {
      npAlbumArt.src = station.logo;
      npAlbumArt.alt = `Logo oficial de ${station.name}`;
    }
    if (npStationSource) {
      npStationSource.textContent = `${station.name} (${station.dial})`;
    }
    if (npSongTitle && (!player.state || player.state !== 'PLAYING')) {
      npSongTitle.textContent = `${station.name} · ${station.genre}`;
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.name,
        artist: genreText,
        album: `TuneIn Cinema & Jazz (${station.dial})`,
        artwork: [
          { src: station.logo, sizes: '320x180', type: 'image/svg+xml' },
          { src: 'assets/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }
        ]
      });
    }
  }

  /* ==========================================================================
     SISTEMA DE METADATOS EN TIEMPO REAL: BANNER DINÁMICO NOW PLAYING
     Canción que está sonando, carátula del disco en alta definición y compositor
     ========================================================================== */

  let metadataPollTimer = null;
  let autoAcousticTimer = null;
  let autoAcousticRescanTimer = null;
  let currentActiveTrackKey = '';
  const itunesMetadataCache = new Map();

  /**
   * Consulta el servicio gratuito de Apple iTunes Search API para enriquecer
   * canciones con su carátula oficial en alta resolución (600x600 px),
   * nombre del compositor y título del álbum cinematográfico.
   * @param {string} query Término de búsqueda (ej. "Hans Zimmer Inception Time")
   * @returns {Promise<{ song: string, artist: string, album: string, artwork: string } | null>}
   */
  async function fetchItunesEnrichment(query) {
    if (!query || query.trim().length < 3) return null;
    const cleanQuery = query.trim();
    if (itunesMetadataCache.has(cleanQuery)) {
      return itunesMetadataCache.get(cleanQuery);
    }

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=song&limit=1`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.json();
      if (data.resultCount > 0 && data.results && data.results[0]) {
        const item = data.results[0];
        let hdCover = item.artworkUrl100 || null;
        if (hdCover) {
          // Obtener la imagen en máxima definición (600x600 px)
          hdCover = hdCover.replace('100x100bb', '600x600bb');
        }
        const enriched = {
          song: item.trackName,
          artist: item.artistName,
          album: item.collectionName,
          artwork: hdCover
        };
        itunesMetadataCache.set(cleanQuery, enriched);
        return enriched;
      }
    } catch (err) {
      console.warn('[iTunes API] Error en enriquecimiento de metadatos:', err);
    }
    return null;
  }

  /**
   * Divide y normaliza las cadenas brutas emitidas por servidores Icecast / Shoutcast.
   * Ejemplos habituales:
   * "Hans Zimmer - Time - Inception" -> { artist: "Hans Zimmer", song: "Time", album: "Inception" }
   * "Ennio Morricone - The Mission"  -> { artist: "Ennio Morricone", song: "The Mission", album: "Banda Sonora Original" }
   * @param {string} rawString
   * @returns {{ artist: string, song: string, album: string }}
   */
  function parseIcecastTrackString(rawString) {
    if (!rawString) return { artist: 'Compositor Varios', song: 'Sintonía de Cine', album: 'Banda Sonora Original' };
    const cleaned = rawString.trim();

    // Separación por guiones delimitadores estándar
    const parts = cleaned.split(/\s*-\s*/);
    if (parts.length >= 3) {
      return {
        artist: parts[0].trim(),
        song: parts[1].trim(),
        album: parts.slice(2).join(' - ').trim()
      };
    } else if (parts.length === 2) {
      return {
        artist: parts[0].trim(),
        song: parts[1].trim(),
        album: 'Banda Sonora Original'
      };
    } else {
      return {
        artist: 'Compositor Varios',
        song: cleaned,
        album: 'Banda Sonora Original'
      };
    }
  }

  /**
   * Obtiene los metadatos de la pista en emisión directa desde las APIs en vivo de cada emisora.
   * @param {Object} station Objeto de la emisora
   * @returns {Promise<{ song: string, composer: string, album: string, artwork: string } | null>}
   */
  async function fetchStationMetadata(station) {
    if (!station || !station.nowPlayingApi) return null;

    try {
      // 1. StreamingSoundtracks.com (Red 24seven.FM)
      if (station.metadataType === 'sst') {
        const res = await fetch(station.nowPlayingApi, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.track) {
          const song = data.track.title || 'Música de Película, Serie o Videojuego';
          const composer = data.track.artist || 'Compositor de Banda Sonora';
          const album = data.track.album || 'Banda Sonora Original';
          let artwork = data.artwork_url || '';

          // Si la carátula viene vacía o no es válida, enriquecer vía iTunes
          if (!artwork || artwork.includes('default') || artwork.includes('generic')) {
            const itunesData = await fetchItunesEnrichment(`${composer} ${album || song}`);
            if (itunesData && itunesData.artwork) {
              artwork = itunesData.artwork;
            }
          }

          return { song, composer, album, artwork: artwork || station.logo };
        }
      }

      // 2. CINEMUSIC Radio Francia (RadioKing API)
      if (station.metadataType === 'radioking') {
        const res = await fetch(station.nowPlayingApi, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data) {
          const song = data.title || 'Musique de Film';
          const composer = data.artist || 'Grandes Compositores de Cine';
          const album = data.album || 'Bande Originale du Film';
          let artwork = data.cover || '';

          if (!artwork || data.default_cover) {
            const itunesData = await fetchItunesEnrichment(`${composer} ${album || song}`);
            if (itunesData && itunesData.artwork) {
              artwork = itunesData.artwork;
            }
          }

          return { song, composer, album, artwork: artwork || station.logo };
        }
      }

      // 3. 0N Movies on Radio (Icecast Status JSON)
      if (station.metadataType === 'icecast_0n') {
        const res = await fetch(station.nowPlayingApi, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.icestats && data.icestats.source) {
          const sources = Array.isArray(data.icestats.source) ? data.icestats.source : [data.icestats.source];
          const movieSource = sources.find(s => s.listenurl && (s.listenurl.includes('0n-movies') || s.listenurl.includes('movies'))) || sources[0];

          if (movieSource && movieSource.title) {
            const parsed = parseIcecastTrackString(movieSource.title);
            let song = parsed.song;
            let composer = parsed.artist;
            let album = parsed.album;
            let artwork = '';

            const itunesData = await fetchItunesEnrichment(`${composer} ${song}`);
            if (itunesData) {
              if (itunesData.artwork) artwork = itunesData.artwork;
              if (itunesData.album) album = itunesData.album;
              if (itunesData.artist) composer = itunesData.artist;
            }

            return { song, composer, album, artwork: artwork || station.logo };
          }
        }
      }

      // 4. Cinemix Radio (Torontocast Icecast)
      if (station.metadataType === 'icecast_cinemix') {
        const res = await fetch(station.nowPlayingApi, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.icestats && data.icestats.source) {
          const src = Array.isArray(data.icestats.source) ? data.icestats.source[0] : data.icestats.source;
          const raw = src.title || src.yp_currently_playing || '';
          if (raw) {
            const parsed = parseIcecastTrackString(raw);
            let song = parsed.song;
            let composer = parsed.artist;
            let album = parsed.album;
            let artwork = '';

            const itunesData = await fetchItunesEnrichment(`${composer} ${song}`);
            if (itunesData) {
              if (itunesData.artwork) artwork = itunesData.artwork;
              if (itunesData.album) album = itunesData.album;
              if (itunesData.artist) composer = itunesData.artist;
            }

            return { song, composer, album, artwork: artwork || station.logo };
          }
        }
      }

      // 5. AzuraCast (Cinema Radio Madrid)
      if (station.metadataType === 'azuracast') {
        const res = await fetch(station.nowPlayingApi, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.now_playing && data.now_playing.song) {
          const songInfo = data.now_playing.song;
          let song = songInfo.title || songInfo.text || 'Banda Sonora en Emisión';
          let composer = songInfo.artist || 'Compositor de Cine';
          let album = songInfo.album || 'Banda Sonora Original';
          let artwork = songInfo.art || '';

          // Si el artwork es el genérico o viene vacío, enriquecer con iTunes
          if (!artwork || artwork.includes('default') || artwork.includes('generic')) {
            const itunesData = await fetchItunesEnrichment(`${composer} ${song}`);
            if (itunesData && itunesData.artwork) {
              artwork = itunesData.artwork;
            }
          }

          return { song, composer, album, artwork: artwork || station.logo };
        }
      }
    } catch (error) {
      console.warn(`[Now Playing] Error consultando metadatos para ${station.name}:`, error);
    }
    return null;
  }

  /**
   * Actualiza el banner para emisoras con metadatos digitales automáticos.
   * @param {Object} meta Metadatos { song, composer, album, artwork }
   * @param {Object} station Emisora sintonizada
   */
  function displayNowPlayingMetadata(meta, station) {
    if (!nowPlayingBanner) return;

    if (!meta) {
      nowPlayingBanner.style.display = 'none';
      return;
    }

    const trackKey = `${station.id}-${meta.composer}-${meta.song}`;
    currentActiveTrackKey = trackKey;

    // Mostrar banner y configurar elementos
    nowPlayingBanner.style.display = 'block';

    if (npSongTitle) npSongTitle.textContent = meta.song;
    if (npComposerName) npComposerName.textContent = meta.composer;
    if (npAlbumName) npAlbumName.textContent = meta.album || 'Banda Sonora Original';
    if (npStationSource) npStationSource.textContent = station.name;
    if (npBadgeText) npBadgeText.textContent = 'SONANDO AHORA';
    if (npLiveTag) npLiveTag.textContent = 'EN VIVO';

    // Adaptar visibilidad entre bloques digital y analógico
    if (npMetaRow) npMetaRow.style.display = 'flex';
    if (npEpgDetails) npEpgDetails.style.display = 'none';
    // El buscador interactivo siempre permanece disponible para el usuario
    if (npSearchContainer) npSearchContainer.style.display = 'flex';

    if (npAlbumArt) {
      npAlbumArt.src = meta.artwork || station.logo;
      npAlbumArt.alt = `Carátula de ${meta.song} (${meta.composer})`;
      npAlbumArt.onerror = () => {
        npAlbumArt.src = station.logo;
      };
    }

    // Sincronizar en tiempo real el dial del reproductor inferior
    if (currentStationDial) {
      currentStationDial.textContent = `${meta.composer} · ${meta.song}`;
    }

    // Actualizar MediaSession del navegador para pantalla de bloqueo y controles del sistema
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: meta.song,
        artist: `${meta.composer} · ${station.name}`,
        album: meta.album || station.genre,
        artwork: [
          { src: meta.artwork || station.logo, sizes: '512x512', type: 'image/jpeg' },
          { src: station.logo, sizes: '320x180', type: 'image/svg+xml' }
        ]
      });
    }
  }

  /**
   * Actualiza el banner para emisoras de señal analógica (Radio 3, Radio Clásica, Radio 5 y Radio Klara)
   * mostrando el programa en antena, presentador, horario de España y activando el buscador interactivo.
   * @param {Object} epg Ficha de programación de la emisora
   * @param {Object} station Emisora sintonizada
   */
  function displayAnalogEpgSchedule(epg, station) {
    if (!nowPlayingBanner || !epg) return;

    nowPlayingBanner.style.display = 'block';

    if (npSongTitle) npSongTitle.textContent = epg.title;
    if (npStationSource) npStationSource.textContent = `${station.name} (${station.dial})`;
    if (npBadgeText) npBadgeText.textContent = '🔴 EN ANTENA AHORA';
    if (npLiveTag) npLiveTag.textContent = 'FM DIRECT';

    // Mostrar bloque de programación EPG y buscador interactivo permanente
    if (npMetaRow) npMetaRow.style.display = 'none';
    if (npEpgDetails) npEpgDetails.style.display = 'flex';
    if (npSearchContainer) npSearchContainer.style.display = 'flex';
    if (ahaShazamBox) ahaShazamBox.style.display = 'block';

    if (npEpgPresenter) npEpgPresenter.textContent = `🎙️ ${epg.presenter}`;
    if (npEpgTimeslot) npEpgTimeslot.textContent = `🕒 ${epg.timeSlot} (Hora de España)`;
    if (npEpgGenre) npEpgGenre.textContent = epg.genre;
    if (npEpgDesc) npEpgDesc.textContent = epg.description;

    // Etiqueta indicadora del origen de datos (Web Oficial vs EPG horaria)
    if (npEpgSourceTag) {
      if (epg.source === 'web') {
        npEpgSourceTag.textContent = epg.sourceLabel || '🌐 Web Oficial de la Emisora';
        npEpgSourceTag.className = 'np-epg-source-tag source-web';
      } else {
        npEpgSourceTag.textContent = epg.sourceLabel || '🕒 Programación EPG Oficial en Antena';
        npEpgSourceTag.className = 'np-epg-source-tag source-epg';
      }
    }

    if (npEpgLink) {
      npEpgLink.href = epg.playlistUrl || station.website || '#';
      npEpgLink.style.display = 'inline-flex';
    }

    if (npAlbumArt) {
      npAlbumArt.src = station.logo;
      npAlbumArt.alt = `Logo oficial de ${station.name}`;
    }

    // Sincronizar en el dial del reproductor inferior
    if (currentStationDial) {
      currentStationDial.textContent = `${station.name} · ${epg.title} (${epg.timeSlot})`;
    }

    // Sincronizar controles nativos del sistema
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: epg.title,
        artist: `${epg.presenter} · ${station.name}`,
        album: epg.genre,
        artwork: [
          { src: station.logo, sizes: '320x180', type: 'image/svg+xml' },
          { src: 'assets/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' }
        ]
      });
    }
  }

  /**
   * Ejecuta el reconocimiento acústico (AHA Music / Shazam) de forma 100% AUTOMÁTICA
   * cuando una emisora no dispone de metadatos digitales o emite en señal analógica (Radio 3, Klara, etc.).
   * No requiere ninguna acción ni interacción por parte del usuario.
   * @param {Object} station Emisora sintonizada
   */
  async function triggerAutoAcousticScan(station) {
    if (!station || !player || player.state !== 'PLAYING') return;
    if (!player.currentStation || player.currentStation.id !== station.id) return;
    if (typeof ahaShazamIdentifier === 'undefined' || ahaShazamIdentifier.isRecording) return;

    // Indicador visual de escaneo automático sin interrumpir al usuario
    if (ahaStatusIndicator) {
      ahaStatusIndicator.style.display = 'flex';
      if (ahaStatusText) {
        ahaStatusText.textContent = '⚡ Reconociendo música automáticamente en emisión...';
      }
    }
    if (ahaListenBtn) {
      ahaListenBtn.classList.add('is-listening');
      if (ahaBtnText) ahaBtnText.textContent = '⚡ Auto-Identificando...';
    }

    try {
      const currentEpg = (typeof analogEpgService !== 'undefined') ? analogEpgService.getScheduleForStation(station.id) : null;
      const context = {
        station,
        title: currentEpg ? currentEpg.title : '',
        query: currentEpg ? `${station.name} ${currentEpg.title}` : station.name
      };

      const result = await ahaShazamIdentifier.identifyPlayingMusic({
        isAutomatic: true,
        station,
        audioElement: player.audio,
        context,
        onProgress: (progress) => {
          const { state, message, progress: secs } = progress;
          if (ahaStatusText) ahaStatusText.textContent = message;
          if (state === 'LISTENING' && ahaBtnText) {
            ahaBtnText.textContent = `Auto-Escuchando (${secs}s)...`;
          } else if (state === 'ANALYZING' && ahaBtnText) {
            ahaBtnText.textContent = '🧠 Analizando huella...';
          }
        }
      });

      if (ahaListenBtn) {
        ahaListenBtn.classList.remove('is-listening');
        if (ahaBtnText) ahaBtnText.textContent = '⚡ Escuchar e Identificar Ahora';
      }

      // Si la emisora sigue siendo la misma y continúa reproduciéndose
      if (result && player.currentStation && player.currentStation.id === station.id) {
        // Enriquecer con carátula en alta resolución si es necesario
        let finalArtwork = result.artwork;
        if (!finalArtwork || finalArtwork.includes('default')) {
          const enrichment = await fetchItunesEnrichment(`${result.composer} ${result.song}`);
          if (enrichment && enrichment.artwork) finalArtwork = enrichment.artwork;
        }

        // Actualizar el banner Now Playing con la información identificada
        if (npSongTitle) npSongTitle.textContent = result.song;
        if (npComposerName) npComposerName.textContent = result.composer;
        if (npAlbumName) npAlbumName.textContent = result.album || 'Banda Sonora / Álbum Oficial';
        if (npBadgeText) npBadgeText.textContent = '⚡ IDENTIFICADO AUTOMÁTICAMENTE';
        if (npMetaRow) npMetaRow.style.display = 'flex';
        if (npEpgDetails) npEpgDetails.style.display = 'none';

        if (npAlbumArt) {
          npAlbumArt.src = finalArtwork || station.logo;
          npAlbumArt.alt = `Carátula oficial de ${result.song} - ${result.composer}`;
        }

        // Sincronizar en tiempo real el dial del reproductor inferior
        if (currentStationDial) {
          currentStationDial.textContent = `${result.composer} · ${result.song}`;
        }

        // Sincronizar MediaSession nativo del sistema operativo
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: result.song,
            artist: `${result.composer} · ${station.name}`,
            album: result.album,
            artwork: [
              { src: finalArtwork || station.logo, sizes: '512x512', type: 'image/jpeg' },
              { src: station.logo, sizes: '320x180', type: 'image/svg+xml' }
            ]
          });
        }

        if (ahaStatusIndicator) {
          ahaStatusIndicator.innerHTML = `<span>✨ ¡Canción detectada automáticamente! <strong>${result.song}</strong> (${result.composer})</span>`;
          setTimeout(() => {
            if (ahaStatusIndicator && !ahaShazamIdentifier.isRecording) {
              ahaStatusIndicator.style.display = 'none';
            }
          }, 7000);
        }

        // Guardar automáticamente en el historial de pistas identificadas
        if (typeof window.saveSongToHistory === 'function') {
          window.saveSongToHistory({
            song: result.song,
            composer: result.composer,
            album: result.album,
            artwork: finalArtwork || station.logo
          });
        }

        // Programar reescaneo automático en 2.5 minutos (para cuando finalice la canción y empiece otra)
        clearTimeout(autoAcousticRescanTimer);
        autoAcousticRescanTimer = setTimeout(() => {
          if (player.state === 'PLAYING' && player.currentStation && player.currentStation.id === station.id) {
            triggerAutoAcousticScan(station);
          }
        }, 150000);

      } else {
        // No se detectó música identificable en ese momento (ej. locutor hablando o cuña)
        if (ahaStatusIndicator) {
          setTimeout(() => {
            if (ahaStatusIndicator && !ahaShazamIdentifier.isRecording) {
              ahaStatusIndicator.style.display = 'none';
            }
          }, 3500);
        }

        // Reintentar automáticamente en 50 segundos por si ya comienza la música
        clearTimeout(autoAcousticRescanTimer);
        autoAcousticRescanTimer = setTimeout(() => {
          if (player.state === 'PLAYING' && player.currentStation && player.currentStation.id === station.id) {
            triggerAutoAcousticScan(station);
          }
        }, 50000);
      }
    } catch (e) {
      console.warn('[AutoAcoustic] Error en reconocimiento automático:', e);
      if (ahaListenBtn) {
        ahaListenBtn.classList.remove('is-listening');
        if (ahaBtnText) ahaBtnText.textContent = '⚡ Escuchar e Identificar Ahora';
      }
    }
  }

  /**
   * Inicia el ciclo de metadatos o EPG para la emisora activa.
   * Obtiene la programación directa desde la web de la emisora con fallback automático a EPG
   * y activa automáticamente el reconocedor acústico si la información no está disponible.
   * @param {Object} station 
   */
  async function startNowPlayingEngine(station) {
    stopNowPlayingEngine();

    if (!station) return;

    // Asegurar que el banner esté siempre visible y actualizado de inmediato con el logo oficial
    if (nowPlayingBanner) nowPlayingBanner.style.display = 'block';
    if (npAlbumArt) {
      npAlbumArt.src = station.logo;
      npAlbumArt.alt = `Logo oficial de ${station.name}`;
    }
    if (npStationSource) {
      npStationSource.textContent = `${station.name} (${station.dial})`;
    }

    // 1. Caso Señal Analógica Tradicional (Radio 3, Radio Clásica, Radio 5 y Radio Klara)
    if (station.isAnalog || station.hasEpgSchedule) {
      if (typeof analogEpgService !== 'undefined') {
        // Carga inmediata del horario EPG para cero latencia
        const immediateEpg = analogEpgService.getScheduleForStation(station.id);
        if (immediateEpg) {
          displayAnalogEpgSchedule(immediateEpg, station);
        }

        // Consultar la web oficial de la emisora en paralelo (con fallback garantizado a EPG)
        analogEpgService.fetchWebSchedule(station).then(webSchedule => {
          if (webSchedule && player.currentStation && player.currentStation.id === station.id) {
            displayAnalogEpgSchedule(webSchedule, station);
          }
        }).catch(err => {
          console.warn('[Web Schedule] Fallback automático a EPG:', err);
        });

        // Activar el reconocedor acústico AUTOMÁTICAMENTE a los 3.5 segundos de emisión
        clearTimeout(autoAcousticTimer);
        autoAcousticTimer = setTimeout(() => {
          triggerAutoAcousticScan(station);
        }, 3500);

        // Actualizar la parrilla cada minuto para reflejar cambios de programa
        metadataPollTimer = setInterval(async () => {
          if (player.state === 'PLAYING' && player.currentStation && player.currentStation.id === station.id) {
            const updatedSchedule = await analogEpgService.fetchWebSchedule(station);
            if (updatedSchedule) displayAnalogEpgSchedule(updatedSchedule, station);
          } else {
            stopNowPlayingEngine();
          }
        }, 60000);
        return;
      }
    }

    // 2. Caso Emisoras Digitales con API de metadatos en vivo
    if (station.hasLiveMetadata) {
      const meta = await fetchStationMetadata(station);
      if (meta && meta.song) {
        displayNowPlayingMetadata(meta, station);
      } else {
        // Si la API no devolvió pista, activar el reconocedor acústico automáticamente
        clearTimeout(autoAcousticTimer);
        autoAcousticTimer = setTimeout(() => {
          triggerAutoAcousticScan(station);
        }, 3500);
      }

      metadataPollTimer = setInterval(async () => {
        if (player.state === 'PLAYING' && player.currentStation && player.currentStation.id === station.id) {
          const updatedMeta = await fetchStationMetadata(station);
          if (updatedMeta && updatedMeta.song) {
            displayNowPlayingMetadata(updatedMeta, station);
          }
        } else {
          stopNowPlayingEngine();
        }
      }, 12000);
      return;
    }

    // 3. Emisoras sin metadatos automáticos: mantener banner visible y activar auto-identificación
    if (npSongTitle) npSongTitle.textContent = `${station.name} (${station.dial})`;
    if (npStationSource) npStationSource.textContent = station.name;
    if (npBadgeText) npBadgeText.textContent = '📻 SINTONÍA EN DIRECTO';
    if (npLiveTag) npLiveTag.textContent = 'LIVE';
    if (npMetaRow) npMetaRow.style.display = 'none';
    if (npEpgDetails) npEpgDetails.style.display = 'none';
    if (npAlbumArt) npAlbumArt.src = station.logo;
    if (ahaShazamBox) ahaShazamBox.style.display = 'block';
    if (npSearchContainer) npSearchContainer.style.display = 'flex';

    clearTimeout(autoAcousticTimer);
    autoAcousticTimer = setTimeout(() => {
      triggerAutoAcousticScan(station);
    }, 3500);
  }

  /**
   * Detiene los temporizadores de sondeo y de identificación acústica automática.
   */
  function stopNowPlayingEngine() {
    if (metadataPollTimer) {
      clearInterval(metadataPollTimer);
      metadataPollTimer = null;
    }
    if (autoAcousticTimer) {
      clearTimeout(autoAcousticTimer);
      autoAcousticTimer = null;
    }
    if (autoAcousticRescanTimer) {
      clearTimeout(autoAcousticRescanTimer);
      autoAcousticRescanTimer = null;
    }
    if (typeof ahaShazamIdentifier !== 'undefined' && ahaShazamIdentifier.isRecording) {
      ahaShazamIdentifier.cancel();
      if (ahaListenBtn) ahaListenBtn.classList.remove('is-listening');
    }
  }

  /* ==========================================================================
     CONTROLADOR DEL BUSCADOR INTERACTIVO DE CANCIONES PARA SEÑALES ANALÓGICAS
     ========================================================================== */

  if (npSearchForm) {
    npSearchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = npSearchInput.value.trim();
      if (!query || query.length < 2) return;

      if (npSearchBtn) {
        npSearchBtn.disabled = true;
        npSearchBtn.innerHTML = '<span>Identificando...</span>';
      }

      if (npSearchResults) {
        npSearchResults.style.display = 'grid';
        npSearchResults.innerHTML = '<div class="np-search-empty">🔍 Consultando base de datos musical en tiempo real...</div>';
      }

      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=6`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.resultCount > 0 && data.results && data.results.length > 0) {
          npSearchResults.innerHTML = data.results.map(item => {
            const hdArt = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');
            return `
              <div class="np-result-card" 
                   data-song="${encodeURIComponent(item.trackName)}" 
                   data-artist="${encodeURIComponent(item.artistName)}" 
                   data-album="${encodeURIComponent(item.collectionName || 'Banda Sonora')}" 
                   data-art="${encodeURIComponent(hdArt)}">
                <img src="${item.artworkUrl100 || 'assets/icons/icon-192.svg'}" alt="${item.trackName}" class="np-result-thumb" loading="lazy" />
                <div class="np-result-details">
                  <span class="np-result-song">${item.trackName}</span>
                  <span class="np-result-artist">🎼 ${item.artistName}</span>
                  <span class="np-result-album">🎬 ${item.collectionName || 'Banda Sonora'}</span>
                </div>
                <span class="np-result-select-tag">✓ Fijar</span>
              </div>
            `;
          }).join('');
        } else {
          npSearchResults.innerHTML = '<div class="np-search-empty">No se encontraron coincidencias exactas. Prueba con otro nombre de compositor, artista o título.</div>';
        }
      } catch (err) {
        console.warn('[Buscador Now Playing] Error:', err);
        if (npSearchResults) {
          npSearchResults.innerHTML = '<div class="np-search-empty">Error al conectar con el servicio de búsqueda musical.</div>';
        }
      } finally {
        if (npSearchBtn) {
          npSearchBtn.disabled = false;
          npSearchBtn.innerHTML = '<span>Identificar</span>';
        }
      }
    });

    // Delegación de clic para seleccionar y fijar una canción identificada
    if (npSearchResults) {
      npSearchResults.addEventListener('click', (e) => {
        const card = e.target.closest('.np-result-card');
        if (!card) return;

        const song = decodeURIComponent(card.getAttribute('data-song'));
        const artist = decodeURIComponent(card.getAttribute('data-artist'));
        const album = decodeURIComponent(card.getAttribute('data-album'));
        const art = decodeURIComponent(card.getAttribute('data-art'));

        // Transformar el banner a Canción Identificada
        if (npSongTitle) npSongTitle.textContent = song;
        if (npComposerName) npComposerName.textContent = artist;
        if (npAlbumName) npAlbumName.textContent = album;
        if (npBadgeText) npBadgeText.textContent = '✨ CANCIÓN IDENTIFICADA';
        if (npLiveTag) npLiveTag.textContent = 'EN DIRECTO';

        if (npMetaRow) npMetaRow.style.display = 'flex';
        if (npEpgDetails) npEpgDetails.style.display = 'none';

        if (npAlbumArt) {
          npAlbumArt.src = art;
          npAlbumArt.alt = `Carátula de ${song} (${artist})`;
        }

        // Sincronizar en tiempo real el dial del reproductor inferior
        if (currentStationDial) {
          currentStationDial.textContent = `${artist} · ${song}`;
        }

        // Sincronizar MediaSession nativo
        if ('mediaSession' in navigator && player.currentStation) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: song,
            artist: `${artist} · ${player.currentStation.name}`,
            album: album,
            artwork: [
              { src: art, sizes: '512x512', type: 'image/jpeg' },
              { src: player.currentStation.logo, sizes: '320x180', type: 'image/svg+xml' }
            ]
          });
        }

        // Ocultar resultados y limpiar input
        npSearchResults.style.display = 'none';
        if (npSearchInput) npSearchInput.value = '';
      });
    }

    // Manejo de chips de búsqueda rápida de compositores
    const quickTags = document.querySelectorAll('.np-quick-tag');
    quickTags.forEach(tag => {
      tag.addEventListener('click', (e) => {
        e.preventDefault();
        const q = tag.getAttribute('data-query');
        if (npSearchInput && q) {
          npSearchInput.value = q;
          if (npSearchForm) {
            npSearchForm.dispatchEvent(new Event('submit', { cancelable: true }));
          }
        }
      });
    });

    // Botón de acceso directo en cabecera
    const headerIdentifyBtn = document.getElementById('header-identify-btn');
    if (headerIdentifyBtn) {
      headerIdentifyBtn.addEventListener('click', () => {
        if (nowPlayingBanner) {
          nowPlayingBanner.style.display = 'block';
          nowPlayingBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (npSearchInput) {
          npSearchInput.focus();
          npSearchInput.classList.add('flash-highlight');
          setTimeout(() => npSearchInput.classList.remove('flash-highlight'), 1200);
        }
      });
    }
  }

  /* ==========================================================================
     RECONOCEDOR ACÚSTICO EN VIVO TIPO AHA MUSIC & SHAZAM
     ========================================================================== */

  if (ahaListenBtn) {
    ahaListenBtn.addEventListener('click', async () => {
      // Si el servicio no está disponible en la ventana
      if (typeof ahaShazamIdentifier === 'undefined') {
        alert('El servicio de identificación acústica no está disponible en este momento.');
        return;
      }

      // Si el usuario vuelve a hacer clic mientras graba, se cancela la captura
      if (ahaShazamIdentifier.isRecording) {
        ahaShazamIdentifier.cancel();
        ahaListenBtn.classList.remove('is-listening');
        if (ahaBtnText) ahaBtnText.textContent = '⚡ Escuchar e Identificar Ahora';
        if (ahaStatusIndicator) ahaStatusIndicator.style.display = 'none';
        return;
      }

      // Activar interfaz pulsante estilo Shazam
      ahaListenBtn.classList.add('is-listening');
      if (ahaStatusIndicator) ahaStatusIndicator.style.display = 'flex';

      const currentStation = player.currentStation;
      const currentEpg = (currentStation && typeof analogEpgService !== 'undefined') 
        ? analogEpgService.getScheduleForStation(currentStation.id) 
        : null;

      const context = {
        station: currentStation,
        title: currentEpg ? currentEpg.title : '',
        query: currentEpg ? `${currentStation.name} ${currentEpg.title}` : (currentStation ? currentStation.name : '')
      };

      await ahaShazamIdentifier.identifyPlayingMusic({
        isAutomatic: false,
        station: currentStation,
        audioElement: player.audio,
        context,
        onProgress: (progress) => {
        const { state, message, progress: secs, result, error } = progress;

        if (ahaStatusText) {
          ahaStatusText.textContent = message;
        }

        if (state === 'LISTENING') {
          if (ahaBtnText) ahaBtnText.textContent = `Escuchando... (${secs}s)`;
        } else if (state === 'ANALYZING') {
          if (ahaBtnText) ahaBtnText.textContent = '🧠 Analizando acústica...';
        } else if (state === 'SUCCESS' && result) {
          ahaListenBtn.classList.remove('is-listening');
          if (ahaBtnText) ahaBtnText.textContent = '⚡ Escuchar e Identificar Ahora';
          
          if (ahaStatusIndicator) {
            ahaStatusIndicator.innerHTML = `<span>✨ ¡Canción identificada! <strong>${result.song}</strong> (${result.composer})</span>`;
            setTimeout(() => {
              if (ahaStatusIndicator) ahaStatusIndicator.style.display = 'none';
            }, 7000);
          }

          // Transformar inmediatamente el banner con los datos identificados
          if (npSongTitle) npSongTitle.textContent = result.song;
          if (npComposerName) npComposerName.textContent = result.composer;
          if (npAlbumName) npAlbumName.textContent = result.album || 'Banda Sonora / Álbum Oficial';
          if (npBadgeText) npBadgeText.textContent = '⚡ IDENTIFICADO CON SHAZAM / AHA';
          if (npLiveTag) npLiveTag.textContent = 'ACÚSTICO';
          if (npMetaRow) npMetaRow.style.display = 'flex';
          if (npEpgDetails) npEpgDetails.style.display = 'none';

          if (result.artwork && npAlbumArt) {
            npAlbumArt.src = result.artwork;
            npAlbumArt.alt = `Carátula de ${result.song} - ${result.composer}`;
          }

          // Actualizar dial inferior del reproductor
          if (currentStationDial) {
            currentStationDial.textContent = `${result.composer} · ${result.song}`;
          }

          // Actualizar MediaSession nativo del sistema operativo
          if ('mediaSession' in navigator && player.currentStation) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: result.song,
              artist: `${result.composer} · ${player.currentStation.name}`,
              album: result.album,
              artwork: [
                { src: result.artwork || player.currentStation.logo, sizes: '512x512', type: 'image/jpeg' },
                { src: player.currentStation.logo, sizes: '320x180', type: 'image/svg+xml' }
              ]
            });
          }
        } else if (state === 'NOT_FOUND') {
          ahaListenBtn.classList.remove('is-listening');
          if (ahaBtnText) ahaBtnText.textContent = '⚡ Escuchar e Identificar Ahora';
          setTimeout(() => {
            if (ahaStatusIndicator && !ahaShazamIdentifier.isRecording) {
              ahaStatusIndicator.style.display = 'none';
            }
          }, 6000);
        } else if (state === 'ERROR') {
          ahaListenBtn.classList.remove('is-listening');
          if (ahaBtnText) ahaBtnText.textContent = '⚡ Escuchar e Identificar Ahora';
          setTimeout(() => {
            if (ahaStatusIndicator && !ahaShazamIdentifier.isRecording) {
              ahaStatusIndicator.style.display = 'none';
            }
          }, 6000);
        }
      });
    });
  }

  /* ==========================================================================
     BOTÓN PARA REFRESCAR PROGRAMACIÓN DIRECTA DESDE LA WEB DE LA EMISORA
     ========================================================================== */

  if (npRefreshWebBtn) {
    npRefreshWebBtn.addEventListener('click', async () => {
      const activeStation = player.currentStation;
      if (!activeStation) return;

      npRefreshWebBtn.classList.add('is-loading');
      npRefreshWebBtn.innerHTML = '<span>⏳ Consultando web oficial...</span>';

      try {
        if (typeof analogEpgService !== 'undefined') {
          const schedule = await analogEpgService.fetchWebSchedule(activeStation);
          if (schedule) {
            displayAnalogEpgSchedule(schedule, activeStation);
          }
        }
      } catch (err) {
        console.warn('[Web Refresh] Error actualizando desde la web:', err);
      } finally {
        npRefreshWebBtn.classList.remove('is-loading');
        npRefreshWebBtn.innerHTML = '<span>🔄 Consultar Web de la Emisora</span>';
      }
    });
  }

  /* ==========================================================================
     EVENTOS DEL MOTOR DE AUDIO Y CONTROLADOR DE REPRODUCCIÓN
     ========================================================================== */

  player.on('stateChange', ({ state, station }) => {
    if (station) {
      updatePlayerUI(station);
    }

    if (state === 'PLAYING') {
      isActivelyListening = true;
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'inline-block';
      spinnerIcon.style.display = 'none';
      liveBadge.textContent = 'EN DIRECTO';
      liveBadge.className = 'status-badge is-live';
      if (visualizerContainer) visualizerContainer.classList.add('animating');

      // Iniciar el motor de metadatos para la emisora activa
      startNowPlayingEngine(station);
    } else if (state === 'BUFFERING') {
      playIcon.style.display = 'none';
      pauseIcon.style.display = 'none';
      spinnerIcon.style.display = 'inline-block';
      liveBadge.textContent = 'CONECTANDO...';
      liveBadge.className = 'status-badge is-buffering';
      if (visualizerContainer) visualizerContainer.classList.remove('animating');
    } else if (state === 'PAUSED' || state === 'IDLE') {
      isActivelyListening = false;
      playIcon.style.display = 'inline-block';
      pauseIcon.style.display = 'none';
      spinnerIcon.style.display = 'none';
      liveBadge.textContent = 'EN PAUSA';
      liveBadge.className = 'status-badge is-paused';
      if (visualizerContainer) visualizerContainer.classList.remove('animating');

      // Detener polling pero mantener el banner visible
      stopNowPlayingEngine();
    } else if (state === 'ERROR') {
      isActivelyListening = false;
      playIcon.style.display = 'inline-block';
      pauseIcon.style.display = 'none';
      spinnerIcon.style.display = 'none';
      liveBadge.textContent = 'ERROR DE CONEXIÓN';
      liveBadge.className = 'status-badge is-error';
      if (visualizerContainer) visualizerContainer.classList.remove('animating');

      stopNowPlayingEngine();
    }

    updateOnlineUI();
    renderStations();
  });

  player.on('error', ({ message }) => {
    console.error('[TuneIn App] Error de streaming:', message);
  });

  // Delegación de eventos en las tarjetas de emisoras
  document.body.addEventListener('click', (e) => {
    const playBtn = e.target.closest('[data-action="play"]');
    const favBtn = e.target.closest('[data-action="fav"]');
    const identifyBtn = e.target.closest('[data-action="identify"]');
    const card = e.target.closest('.station-card');

    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.getAttribute('data-id');
      toggleFavorite(id);
      return;
    }

    // Clic en Identificar qué suena en la tarjeta
    if (identifyBtn) {
      e.stopPropagation();
      const id = identifyBtn.getAttribute('data-id');
      const station = STATIONS.find(s => s.id === id);
      if (station) {
        player.playStation(station);
        if (nowPlayingBanner) {
          nowPlayingBanner.style.display = 'block';
          nowPlayingBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (npSearchInput) {
          npSearchInput.focus();
          npSearchInput.classList.add('flash-highlight');
          setTimeout(() => npSearchInput.classList.remove('flash-highlight'), 1200);
        }
      }
      return;
    }

    if (playBtn || card) {
      const targetId = (playBtn ? playBtn.getAttribute('data-id') : null) || (card ? card.getAttribute('data-id') : null);
      if (targetId) {
        const station = STATIONS.find(s => s.id === targetId);
        if (station) {
          if (player.currentStation && player.currentStation.id === station.id) {
            player.togglePlay();
          } else {
            player.playStation(station);
          }
        }
      }
    }
  });

  // Controles del reproductor inferior
  playPauseBtn.addEventListener('click', () => {
    if (!player.currentStation) {
      player.playStation(STATIONS[0]);
    } else {
      player.togglePlay();
    }
  });

  prevBtn.addEventListener('click', () => {
    const currentId = player.currentStation ? player.currentStation.id : STATIONS[0].id;
    const currentIndex = STATIONS.findIndex(s => s.id === currentId);
    const prevIndex = (currentIndex - 1 + STATIONS.length) % STATIONS.length;
    player.playStation(STATIONS[prevIndex]);
  });

  nextBtn.addEventListener('click', () => {
    const currentId = player.currentStation ? player.currentStation.id : STATIONS[0].id;
    const currentIndex = STATIONS.findIndex(s => s.id === currentId);
    const nextIndex = (currentIndex + 1) % STATIONS.length;
    player.playStation(STATIONS[nextIndex]);
  });

  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value) / 100;
    player.setVolume(val);
  });

  muteBtn.addEventListener('click', () => {
    const isMuted = player.toggleMute();
    muteBtn.textContent = isMuted ? '🔇' : '🔊';
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderStations();
  });

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-category');
      renderStations();
    });
  });

  // Atajos de teclado
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      player.togglePlay();
    } else if (e.key === 'm' || e.key === 'M') {
      muteBtn.click();
    }
  });

  // Sincronización con hash de URL si se seleccionó un acceso directo PWA
  const initialHash = window.location.hash.replace('#', '');
  const matchedStation = STATIONS.find(s => s.id === initialHash);

  // =========================================================================
  // GESTIÓN DEL HISTORIAL DE CANCIONES IDENTIFICADAS
  // =========================================================================
  const npHistoryList = document.getElementById('np-history-list');
  const npHistoryClearBtn = document.getElementById('np-history-clear-btn');
  let identifiedHistory = JSON.parse(localStorage.getItem('tunein_identified_history') || '[]');

  function saveSongToHistory(songData) {
    if (!songData || !songData.song || !songData.composer) return;
    
    // Evitar duplicar consecutivamente la misma canción
    if (identifiedHistory.length > 0 && identifiedHistory[0].song.toLowerCase() === songData.song.toLowerCase()) {
      return;
    }

    const item = {
      song: songData.song,
      composer: songData.composer,
      album: songData.album || 'Banda Sonora Original',
      artwork: songData.artwork || 'assets/logos/cinema-radio.svg',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      spotifyQuery: encodeURIComponent(`${songData.composer} ${songData.song}`),
      ytQuery: encodeURIComponent(`${songData.composer} ${songData.song} soundtrack`)
    };

    identifiedHistory.unshift(item);
    if (identifiedHistory.length > 15) {
      identifiedHistory = identifiedHistory.slice(0, 15);
    }

    localStorage.setItem('tunein_identified_history', JSON.stringify(identifiedHistory));
    renderSongHistory();
  }

  function renderSongHistory() {
    if (!npHistoryList) return;
    if (identifiedHistory.length === 0) {
      npHistoryList.innerHTML = '<span class="np-history-empty">Aún no se ha identificado ninguna canción en esta sesión.</span>';
      return;
    }

    npHistoryList.innerHTML = identifiedHistory.map(item => `
      <div class="np-history-item">
        <div class="np-history-item-left">
          <img src="${item.artwork}" alt="${item.song}" class="np-history-art" onerror="this.src='assets/icons/icon-192.svg'" />
          <div class="np-history-text">
            <span class="np-history-song" title="${item.song}">${item.song}</span>
            <span class="np-history-artist" title="${item.composer}">${item.composer} · <small>${item.timestamp}</small></span>
          </div>
        </div>
        <div class="np-history-actions">
          <a href="https://open.spotify.com/search/${item.spotifyQuery}" target="_blank" rel="noopener noreferrer" class="np-history-btn np-history-spotify" title="Buscar en Spotify">
            Spotify
          </a>
          <a href="https://www.youtube.com/results?search_query=${item.ytQuery}" target="_blank" rel="noopener noreferrer" class="np-history-btn np-history-yt" title="Buscar en YouTube">
            YouTube
          </a>
        </div>
      </div>
    `).join('');
  }

  if (npHistoryClearBtn) {
    npHistoryClearBtn.addEventListener('click', () => {
      identifiedHistory = [];
      localStorage.removeItem('tunein_identified_history');
      renderSongHistory();
    });
  }

  renderSongHistory();
  window.saveSongToHistory = saveSongToHistory;

  // =========================================================================
  // GESTIÓN DEL TEMPORIZADOR DE APAGADO (SLEEP TIMER)
  // =========================================================================
  const sleepTimerBtn = document.getElementById('sleep-timer-btn');
  const sleepTimerDropdown = document.getElementById('sleep-timer-dropdown');
  const sleepTimerText = document.getElementById('sleep-timer-text');
  let sleepTimerId = null;
  let sleepCountdownInterval = null;
  let sleepRemainingSeconds = 0;

  if (sleepTimerBtn && sleepTimerDropdown) {
    sleepTimerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = sleepTimerDropdown.style.display === 'flex';
      sleepTimerDropdown.style.display = isVisible ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      if (sleepTimerDropdown) sleepTimerDropdown.style.display = 'none';
    });

    const sleepOptions = sleepTimerDropdown.querySelectorAll('.sleep-opt-btn');
    sleepOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        const minutes = parseInt(opt.getAttribute('data-minutes'), 10);
        clearTimeout(sleepTimerId);
        clearInterval(sleepCountdownInterval);

        if (minutes === 0) {
          // Desactivar
          sleepRemainingSeconds = 0;
          sleepTimerText.textContent = 'Temporizador';
          sleepTimerBtn.classList.remove('is-active');
        } else {
          // Activar temporizador
          sleepRemainingSeconds = minutes * 60;
          sleepTimerBtn.classList.add('is-active');

          const updateTimerText = () => {
            const m = Math.floor(sleepRemainingSeconds / 60);
            const s = sleepRemainingSeconds % 60;
            sleepTimerText.textContent = `Apagado en ${m}:${s < 10 ? '0' : ''}${s}`;
          };

          updateTimerText();

          sleepCountdownInterval = setInterval(() => {
            sleepRemainingSeconds--;
            if (sleepRemainingSeconds <= 0) {
              clearInterval(sleepCountdownInterval);
              player.pause();
              sleepTimerText.textContent = 'Temporizador';
              sleepTimerBtn.classList.remove('is-active');
            } else {
              updateTimerText();
            }
          }, 1000);
        }

        sleepTimerDropdown.style.display = 'none';
      });
    });
  }

  renderStations();
  const initialStation = matchedStation || STATIONS[0];
  updatePlayerUI(initialStation);
  // Arrancar inmediatamente el banner con la emisora inicial para que el buscador esté siempre disponible
  startNowPlayingEngine(initialStation);
});
