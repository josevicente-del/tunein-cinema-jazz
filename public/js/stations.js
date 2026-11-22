/**
 * @file js/stations.js
 * @description Catálogo oficial de emisoras de radio especializadas en Bandas Sonoras y Jazz.
 * Distribución optimizada en torno a Bandas Sonoras (encabezada por 0N Movies on Radio) y Jazz,
 * con programación horaria dinámica de Bandas Sonoras para Radio Klara.
 */

/**
 * Función que evalúa en tiempo real si Radio Klara está emitiendo su franja de Bandas Sonoras.
 * Horario de Bandas Sonoras en Radio Klara:
 * - Jueves de 22:00 a 24:00
 * - Domingos de 22:00 a 24:00
 * - Martes de 02:00 a 04:00
 * - Resto de la semana: Jazz & Blues
 * @returns {{ isSoundtrack: boolean, currentGenre: string, badgeText: string, scheduleText: string }}
 */
function getRadioKlaraScheduleState() {
  const now = new Date();
  // Obtener fecha y hora en el huso horario peninsular español
  const spainStr = now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
  const spainDate = new Date(spainStr);
  const day = spainDate.getDay(); // 0: Domingo, 1: Lunes, 2: Martes, 3: Miércoles, 4: Jueves, 5: Viernes, 6: Sábado
  const hour = spainDate.getHours();

  // Comprobar las franjas horarias solicitadas:
  const isSoundtrack = (
    (day === 4 && hour >= 22 && hour < 24) || // Jueves 22:00 - 24:00
    (day === 0 && hour >= 22 && hour < 24) || // Domingo 22:00 - 24:00
    (day === 2 && hour >= 2 && hour < 4)      // Martes 02:00 - 04:00 (madrugada)
  );

  return {
    isSoundtrack,
    currentGenre: isSoundtrack ? 'Bandas Sonoras & Cine (En Emisión Directa)' : 'Jazz & Blues (En Emisión)',
    badgeText: isSoundtrack ? '🔴 AHORA: BANDAS SONORAS' : '🎷 AHORA: JAZZ & BLUES',
    scheduleText: 'BSO: Jue 22-24h · Dom 22-24h · Mar 02-04h (resto Jazz)'
  };
}

const STATION_GROUPS = [
  {
    id: 'soundtrack',
    title: '🎬 Bandas Sonoras & Música de Cine',
    subtitle: 'Partituras cinematográficas, Hollywood, compositores sinfónicos y sesiones de autor'
  },
  {
    id: 'jazz',
    title: '🎷 Jazz, Bebop, Swing & Lounge',
    subtitle: 'Grandes maestros del jazz acústico, swing cosmopolita, smooth jazz y rare groove'
  }
];

const STATIONS = [
  // =========================================================================
  // SECCIÓN 1: BANDAS SONORAS & CINE (ENCABEZADA POR 0N MOVIES ON RADIO)
  // =========================================================================
  {
    id: 'movies-on-radio',
    name: '0N Movies on Radio',
    dial: 'Film Soundtracks · Berlín',
    genre: 'Música de Cine & Hollywood',
    category: 'soundtrack',
    categories: ['soundtrack'],
    group: 'soundtrack',
    country: 'Alemania',
    city: 'Berlín',
    logo: 'assets/logos/0n-movies.svg',
    streamUrl: 'https://0n-movies.radionetz.de/0n-movies.mp3',
    nowPlayingApi: 'https://0n-movies.radionetz.de/status-json.xsl',
    website: 'https://0n-movies.radionetz.de/',
    metadataType: 'icecast_0n',
    hasLiveMetadata: true,
    protocol: 'mp3',
    description: 'Emisora líder mundial en bandas sonoras cinematográficas las 24 horas: Hollywood, ciencia ficción, cine negro, superproducciones y temas inolvidables sin cortes.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'streaming-soundtracks',
    name: 'StreamingSoundtracks.com (Red 24seven.FM)',
    dial: 'Film, TV & Game Scores · USA',
    genre: 'Música de Cine, Series & Videojuegos',
    category: 'soundtrack',
    categories: ['soundtrack'],
    group: 'soundtrack',
    country: 'EE.UU.',
    city: 'Global',
    logo: 'assets/logos/streaming-soundtracks.svg',
    streamUrl: 'https://streamingsoundtracks.com/live',
    nowPlayingApi: 'https://streamingsoundtracks.com/now-playing.php?details=1',
    website: 'https://streamingsoundtracks.com/',
    metadataType: 'sst',
    hasLiveMetadata: true,
    protocol: 'mp3',
    description: 'La emisora insignia de la red 24seven.FM dedicada exclusivamente a bandas sonoras de películas, series y videojuegos (John Williams, Ennio Morricone, Hans Zimmer) con sistema de peticiones de la comunidad 24/7.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'cinemusic-radio-france',
    name: 'CINEMUSIC Radio Francia',
    dial: 'Musique de Film · París',
    genre: 'Música de Cine & Soundtracks',
    category: 'soundtrack',
    categories: ['soundtrack'],
    group: 'soundtrack',
    country: 'Francia',
    city: 'París',
    logo: 'assets/logos/cinemusic.svg',
    streamUrl: 'https://listen.radioking.com/radio/422/stream/62785',
    nowPlayingApi: 'https://www.radioking.com/widgets/api/v1/radio/422/track/current',
    website: 'https://cinemusicradio.com/',
    metadataType: 'radioking',
    hasLiveMetadata: true,
    protocol: 'mp3',
    description: 'La gran radio francesa de música de cine. Grandes bandas sonoras francesas e internacionales, temas orquestales y compositores legendarios (Morricone, Delerue, Williams).',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'cinemix',
    name: 'Cinemix Radio',
    dial: 'Original Scores · Global',
    genre: 'Bandas Sonoras Originales',
    category: 'soundtrack',
    categories: ['soundtrack'],
    group: 'soundtrack',
    country: 'Internacional',
    city: 'Global',
    logo: 'assets/logos/cinemix.svg',
    streamUrl: 'https://kathy.torontocast.com:1825/stream',
    nowPlayingApi: 'https://kathy.torontocast.com:1825/status-json.xsl',
    website: 'https://www.cinemix.us/',
    metadataType: 'icecast_cinemix',
    hasLiveMetadata: true,
    protocol: 'mp3',
    description: 'La emisora de referencia internacional en bandas sonoras de películas: John Williams, Ennio Morricone, Hans Zimmer, Jerry Goldsmith, Howard Shore y partituras de culto.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'cinema-radio-spain',
    name: 'Cinema Radio',
    dial: '192 kbps · Madrid',
    genre: 'Bandas Sonoras & Música de Cine',
    category: 'soundtrack',
    categories: ['soundtrack', 'spanish'],
    group: 'soundtrack',
    country: 'España',
    city: 'Madrid',
    logo: 'assets/logos/cinema-radio.svg',
    streamUrl: 'https://stream.tunerplay.com/listen/hit24radio/cinemaradio',
    nowPlayingApi: 'https://stream.tunerplay.com/api/nowplaying/hit24radio',
    website: 'https://www.radio-espana.es/cinema-radio',
    metadataType: 'azuracast',
    hasLiveMetadata: true,
    protocol: 'mp3',
    description: 'Emisora temática española transmitiendo las 24 horas lo mejor de la música cinematográfica, bandas sonoras originales, partituras orquestales y clásicos de Hollywood.',
    isFeatured: true,
    isSpanish: true
  },
  {
    id: 'la-musica-y-el-cine-rne',
    name: 'La música y el cine (RNE)',
    dial: 'Radio 5 · RNE Audio',
    genre: 'Monográficos de Bandas Sonoras',
    category: 'soundtrack',
    categories: ['soundtrack', 'spanish'],
    group: 'soundtrack',
    country: 'España',
    city: 'Madrid / Nacional',
    logo: 'assets/logos/la-musica-y-el-cine.svg',
    streamUrl: 'https://ztnr.rtve.es/ztnr/17308671.mp3',
    website: 'https://www.rtve.es/play/audios/la-musica-y-el-cine/',
    protocol: 'mp3',
    description: 'Espacio monográfico de Radio 5 (RNE) dirigido por Daniel Gamboa dedicado en exclusiva a la historia de las bandas sonoras y sus grandes compositores.',
    isFeatured: true,
    isSpanish: true
  },
  {
    id: 'radio-clasica-cine',
    name: 'Radio Clásica (RNE)',
    dial: 'Cine & Sinfonía · RTVE',
    genre: 'Bandas Sonoras & Sinfónico',
    category: 'soundtrack',
    categories: ['soundtrack', 'spanish'],
    group: 'soundtrack',
    country: 'España',
    city: 'Madrid / Nacional',
    logo: 'assets/logos/radio-clasica.svg',
    streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r2_main.m3u8',
    website: 'https://www.rtve.es/play/radio/radio-clasica/',
    protocol: 'hls',
    description: 'Programas especializados en bandas sonoras cinematográficas, suites orquestales para cine y compositores clásicos del séptimo arte transmitidos en alta definición acústica.',
    isFeatured: true,
    isSpanish: true,
    isAnalog: true,
    hasEpgSchedule: true
  },
  {
    id: 'radio-3',
    name: 'Radio 3 (RNE)',
    dial: 'Nacional · RTVE Audio',
    genre: 'Cine, Bandas Sonoras & Jazz',
    category: 'soundtrack',
    categories: ['soundtrack', 'jazz', 'spanish'],
    group: 'soundtrack',
    country: 'España',
    city: 'Madrid / Nacional',
    logo: 'assets/logos/radio-3.svg',
    streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r3_main.m3u8',
    website: 'https://www.rtve.es/play/radio/radio3/',
    protocol: 'hls',
    description: 'La emisora de referencia cultural y musical de RNE. Hogar de emblemáticos programas dedicados al séptimo arte ("El Séptimo Vicio"), monográficos de bandas sonoras y sesiones de jazz.',
    isFeatured: true,
    isSpanish: true,
    isAnalog: true,
    hasEpgSchedule: true
  },
  {
    id: 'radio-klara',
    name: 'Radio Klara',
    dial: '104.4 FM · València',
    genre: 'Bandas Sonoras (Jue/Dom/Mar) & Jazz',
    category: 'soundtrack',
    categories: ['soundtrack', 'jazz', 'spanish'],
    group: 'soundtrack',
    country: 'España',
    city: 'Valencia',
    logo: 'assets/logos/radio-klara.svg',
    streamUrl: 'https://cervera.eldialdigital.com:21111/stream',
    website: 'https://www.radioklara.org/',
    protocol: 'mp3',
    description: 'Histórica emisora libre de Valencia (desde 1982). Programación especial de Bandas Sonoras: Jueves de 22:00 a 24:00, Domingos de 22:00 a 24:00 y Martes de 02:00 a 04:00. Resto de la semana: Jazz & Blues.',
    isFeatured: true,
    isSpanish: true,
    hasSoundtrackSchedule: true,
    isAnalog: true,
    hasEpgSchedule: true
  },
  {
    id: 'radio-5',
    name: 'Radio 5 (RNE)',
    dial: 'Todo Noticias · RTVE',
    genre: 'Cine, Cultura & Noticias',
    category: 'soundtrack',
    categories: ['soundtrack', 'spanish'],
    group: 'soundtrack',
    country: 'España',
    city: 'Madrid / Nacional',
    logo: 'assets/logos/radio-5.svg',
    streamUrl: 'https://rtvelivestream.rtve.es/rtvesec/rne/rne_r5_madrid_main.m3u8',
    website: 'https://www.rtve.es/play/radio/radio5/',
    protocol: 'hls',
    description: 'Canal de información continua de Radio Nacional de España. Incluye boletines culturales, espacios de crítica cinematográfica ("De película"), estrenos de cartelera y entrevistas de cine.',
    isFeatured: true,
    isSpanish: true,
    isAnalog: true,
    hasEpgSchedule: true
  },

  // =========================================================================
  // SECCIÓN 2: JAZZ, BEBOP, SWING & LOUNGE
  // =========================================================================
  {
    id: 'instrumental-jazz',
    name: 'Instrumental Jazz',
    dial: 'Acoustic Solo · Global',
    genre: 'Jazz Instrumental & Acústico',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'Internacional',
    city: 'Global',
    logo: 'assets/logos/instrumental-jazz.svg',
    streamUrl: 'https://jfm1.hostingradio.ru:14536/ijstream.mp3',
    protocol: 'mp3',
    description: 'Piezas instrumentales de jazz puro sin pistas vocales: contrabajo, piano acústico de cola, saxofón tenor y batería en grabaciones magistrales.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'tsf-jazz',
    name: 'TSF Jazz París',
    dial: '89.9 FM · París',
    genre: 'Jazz Tradicional, Swing & Bebop',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'Francia',
    city: 'París',
    logo: 'assets/logos/tsf-jazz.svg',
    streamUrl: 'https://tsfjazz.ice.infomaniak.ch/tsfjazz-high.mp3',
    protocol: 'mp3',
    description: 'La mítica emisora francesa de jazz. Sonido acústico impecable con los gigantes del swing, cool jazz, hard bop y vocalistas selectos de París.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'jazzradio-1068-berlin',
    name: 'JazzRadio 106.8 Berlin',
    dial: '106.8 FM · Berlín',
    genre: 'Cool Jazz & Swing Cosmopolita',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'Alemania',
    city: 'Berlín',
    logo: 'assets/logos/jazzradio-berlin.svg',
    streamUrl: 'https://streaming.radio.co/s774887f7b/listen',
    protocol: 'mp3',
    description: 'La emisora de jazz por excelencia de la capital alemana. Selección cosmopolita de swing, cool jazz y soul jazz en directo desde Berlín.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'smooth-jazz-lounge',
    name: 'Smooth Jazz Lounge',
    dial: 'Lounge & Chillout HD',
    genre: 'Smooth Jazz & Chill Lounge',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'Internacional',
    city: 'Global',
    logo: 'assets/logos/smooth-jazz.svg',
    streamUrl: 'https://radio4.vip-radios.fm:18060/stream-128kmp3-SmoothJazzLounge',
    protocol: 'mp3',
    description: 'Melodías aterciopeladas de smooth jazz, saxofón sensual, ritmos downtempo y la atmósfera relajante de los lounges más selectos del mundo.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'acid-jazz',
    name: '100% ACID JAZZ',
    dial: 'Groove & Funk Club · Londres',
    genre: 'Acid Jazz, Funk & Rare Groove',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'Reino Unido / Canadá',
    city: 'Londres / Global',
    logo: 'assets/logos/acid-jazz.svg',
    streamUrl: 'https://mpc1.mediacp.eu:8356/stream',
    protocol: 'mp3',
    description: 'Fusión enérgica de jazz, funk, soul, hip-hop instrumental y rare groove. Inspirado en la edad dorada de los clubes underground de Londres.',
    isFeatured: true,
    isSpanish: false
  },
  {
    id: 'jazz-radio-classic',
    name: 'Jazz Radio Classic',
    dial: 'Great Masters · Lyon',
    genre: 'Jazz Clásico & Bebop Histórico',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'Francia',
    city: 'Lyon',
    logo: 'assets/logos/jazz-classic.svg',
    streamUrl: 'https://jazz-wr01.ice.infomaniak.ch/jazz-wr01-128.mp3',
    protocol: 'mp3',
    description: 'Antología sonora permanente con Miles Davis, John Coltrane, Dave Brubeck, Duke Ellington, Thelonious Monk y Billie Holiday.',
    isFeatured: false,
    isSpanish: false
  },
  {
    id: 'adroit-jazz',
    name: 'Adroit Jazz Underground',
    dial: 'Live Stream HD · Nueva York',
    genre: 'Modern & Avant-Garde Jazz',
    category: 'jazz',
    categories: ['jazz'],
    group: 'jazz',
    country: 'EE.UU.',
    city: 'Nueva York',
    logo: 'assets/logos/adroit-jazz.svg',
    streamUrl: 'https://icecast.walmradio.com:8443/jazz',
    protocol: 'mp3',
    description: 'Jazz contemporáneo de alta fidelidad, jazz fusión, modal y directos desde los mejores clubes de Nueva York sin publicidad.',
    isFeatured: false,
    isSpanish: false
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STATIONS, STATION_GROUPS, getRadioKlaraScheduleState };
}
