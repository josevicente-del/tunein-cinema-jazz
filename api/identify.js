/**
 * @file api/identify.js
 * @description Función Serverless de Vercel para reconocimiento acústico de música 100% gratuito e ilimitado.
 * Implementa dos modalidades de reconocimiento directo con el motor nativo de Shazam:
 * 1. Muestreo directo del Stream URL en servidor (sin depender de CORS ni micrófono, calidad de audio perfecta).
 * 2. Reconocimiento de muestra de audio Base64 (WAV PCM) capturada por el navegador / micrófono.
 */

const http = require('http');
const https = require('https');
const { Shazam } = require('shazamio-api');

// Instancia configurada para España / Europa
const shazam = new Shazam({
  language: 'es-ES',
  endpointCountry: 'ES',
  timezone: 'Europe/Madrid'
});

// Aumentar el límite de tamaño de la petición para permitir recibir muestras de audio (hasta 10MB)
const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

/**
 * Descarga una muestra de audio (buffer de ~180KB, equivale a 6-10 segundos de audio MP3/AAC)
 * directamente desde la URL de la emisora de radio en curso.
 * Es tolerante a redirecciones HTTP 301/302 y certificados SSL auto-firmados de emisoras de radio.
 * @param {string} streamUrl 
 * @param {number} maxBytes 
 * @param {number} timeoutMs 
 * @returns {Promise<Buffer>}
 */
function downloadStreamSample(streamUrl, maxBytes = 180000, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(streamUrl);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const requestOptions = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        },
        rejectUnauthorized: false
      };

      const req = client.get(streamUrl, requestOptions, (res) => {
        // Manejar redirecciones de servidores Icecast / Shoutcast
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(downloadStreamSample(res.headers.location, maxBytes, timeoutMs));
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          req.destroy();
          return reject(new Error(`Servidor de radio respondió con código HTTP ${res.statusCode}`));
        }

        const chunks = [];
        let totalBytes = 0;

        res.on('data', (chunk) => {
          chunks.push(chunk);
          totalBytes += chunk.length;
          if (totalBytes >= maxBytes) {
            req.destroy();
            resolve(Buffer.concat(chunks));
          }
        });

        res.on('end', () => {
          if (totalBytes > 0) {
            resolve(Buffer.concat(chunks));
          } else {
            reject(new Error('La emisora no entregó datos de audio.'));
          }
        });

        res.on('error', (err) => {
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`Tiempo de espera agotado al conectar con el stream (${timeoutMs}ms)`));
      });

    } catch (err) {
      reject(err);
    }
  });
}

module.exports = async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let audioBuffer = null;
    const body = req.body || {};

    // 1. Prioridad: Si se envía streamUrl, capturar directamente el audio puro de la emisora en el servidor
    if (body.streamUrl && typeof body.streamUrl === 'string' && body.streamUrl.startsWith('http')) {
      // Ignorar listas m3u8 (HLS) complejas para muestreo directo mp3/aac
      if (!body.streamUrl.includes('.m3u8')) {
        try {
          audioBuffer = await downloadStreamSample(body.streamUrl);
        } catch (streamErr) {
          console.warn('[Identify] No se pudo muestrear stream directo:', streamErr.message);
        }
      }
    }

    // 2. Si no se obtuvo del stream o vino audioBase64 (captura del micrófono / navegador)
    if (!audioBuffer) {
      if (body.audioBase64) {
        audioBuffer = Buffer.from(body.audioBase64, 'base64');
      } else if (Buffer.isBuffer(req.body)) {
        audioBuffer = req.body;
      } else if (typeof req.body === 'string') {
        audioBuffer = Buffer.from(req.body, 'base64');
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No se recibió ninguna muestra de audio ni streamUrl válida' });
    }

    // Ejecutar reconocimiento con el motor nativo de Shazam
    const result = await shazam.recognize(audioBuffer);

    if (result && result.track) {
      const track = result.track;
      
      // Obtener la mejor carátula en alta definición disponible
      let artwork = '';
      if (track.images && track.images.coverarthq) {
        artwork = track.images.coverarthq;
      } else if (track.images && track.images.coverart) {
        artwork = track.images.coverart;
      }

      // Encontrar álbum oficial en las secciones de metadatos de Shazam
      let album = 'Banda Sonora / Álbum Oficial';
      if (Array.isArray(track.sections)) {
        const songSection = track.sections.find(s => s.type === 'SONG');
        if (songSection && Array.isArray(songSection.metadata)) {
          const albumMeta = songSection.metadata.find(m => m.title && m.title.toLowerCase().includes('album'));
          if (albumMeta && albumMeta.text) {
            album = albumMeta.text;
          }
        }
      }

      return res.status(200).json({
        success: true,
        match: true,
        song: track.title || 'Tema Identificado',
        composer: track.subtitle || 'Artista / Compositor',
        album: album,
        artwork: artwork,
        genres: track.genres ? track.genres.primary : '',
        url: track.url || '',
        recognizedBy: 'Shazam Official Engine (Unlimited Free)'
      });
    }

    return res.status(200).json({
      success: true,
      match: false,
      message: 'No se detectó ninguna coincidencia acústica en esta muestra.'
    });

  } catch (err) {
    if (err.name === 'NoMatchesFoundError' || (err.message && err.message.includes('No song matched'))) {
      return res.status(200).json({
        success: true,
        match: false,
        message: 'No se encontró coincidencia en la base de datos de Shazam.'
      });
    }

    console.error('[API Identify Error]:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
