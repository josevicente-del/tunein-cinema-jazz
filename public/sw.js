/**
 * @file sw.js
 * @description Service Worker de la PWA TuneIn Cinema & Jazz.
 * Implementa almacenamiento en caché para la shell de la aplicación (modo offline)
 * y exclusión estricta de transmisiones de audio en directo para prevenir bloqueos de memoria.
 */

const CACHE_NAME = 'tunein-cinema-jazz-v2.0';

// Recursos estáticos esenciales que componen la shell de la aplicación
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.webmanifest',
  '/js/stations.js',
  '/js/player.js',
  '/js/app.js',
  '/js/audio-identifier.js',
  '/js/epg-service.js',
  '/assets/icons/icon-192.svg',
  '/assets/icons/icon-512.svg',
  '/assets/logos/radio-klara.svg',
  '/assets/logos/radio-3.svg',
  '/assets/logos/radio-5.svg',
  '/assets/logos/radio-clasica.svg',
  '/assets/logos/cinemusic.svg',
  '/assets/logos/cinemix.svg',
  '/assets/logos/0n-movies.svg',
  '/assets/logos/cinema-radio.svg',
  '/assets/logos/la-musica-y-el-cine.svg',
  '/assets/logos/instrumental-jazz.svg',
  '/assets/logos/smooth-jazz.svg',
  '/assets/logos/jazzradio-berlin.svg',
  '/assets/logos/acid-jazz.svg',
  '/assets/logos/tsf-jazz.svg',
  '/assets/logos/jazz-classic.svg',
  '/assets/logos/adroit-jazz.svg',
  '/assets/logos/streaming-soundtracks.svg'
];

// Instalación: Precargar recursos estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precargando shell estática de la aplicación...');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza de versiones anteriores de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Eliminando caché obsoleta:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de solicitudes de red
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // REGLA CRÍTICA DE STREAMING:
  // Nunca interceptar ni almacenar en caché emisiones de audio en directo (HLS, MP3, AAC o CDNs de radio)
  const isAudioStream = (
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.aac') ||
    url.pathname.includes('/stream') ||
    url.pathname.includes('/listen') ||
    url.hostname.includes('rtve.es') ||
    url.hostname.includes('eldialdigital.com') ||
    url.hostname.includes('radioking.com') ||
    url.hostname.includes('torontocast.com') ||
    url.hostname.includes('infomaniak.ch') ||
    url.hostname.includes('radionetz.de') ||
    url.hostname.includes('vip-radios.fm') ||
    url.hostname.includes('radio.co') ||
    url.hostname.includes('mediacp.eu') ||
    url.hostname.includes('walmradio.com') ||
    url.hostname.includes('hostingradio.ru') ||
    url.hostname.includes('tunerplay.com') ||
    url.hostname.includes('mediasector.es') ||
    url.hostname.includes('ztnr.rtve.es') ||
    req.headers.get('accept')?.includes('audio')
  );

  // Excluir endpoints de analytics
  const isAnalytics = url.pathname.includes('/_vercel/insights');

  if (isAudioStream || isAnalytics || req.method !== 'GET') {
    // Pasar directamente a la red sin intervenir
    event.respondWith(fetch(req));
    return;
  }

  // Estrategia Stale-While-Revalidate para recursos estáticos
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // En caso de fallo de red y sin caché, retornar fallback para navegación
        if (req.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
