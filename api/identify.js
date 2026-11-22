/**
 * @file api/identify.js
 * @description Función Serverless de Vercel para reconocimiento de audio 100% gratuito e ilimitado.
 * Utiliza el protocolo nativo de Shazam mediante shazamio-api para decodificar
 * la muestra de audio y devolver metadatos precisos (canción, compositor, álbum y carátula HD).
 */

const { Shazam } = require('shazamio-api');

// Instancia configurada para España / Europa
const shazam = new Shazam({
  language: 'es-ES',
  endpointCountry: 'ES',
  timezone: 'Europe/Madrid'
});

// Aumentar el límite de tamaño de la petición para permitir recibir muestras de audio (hasta 10MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

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

    if (req.body && req.body.audioBase64) {
      // Recibido como JSON { audioBase64: '...' }
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
    } else if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
    } else if (typeof req.body === 'string') {
      audioBuffer = Buffer.from(req.body, 'base64');
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No se recibió ninguna muestra de audio' });
    }

    // Ejecutar reconocimiento con el motor nativo de Shazam
    const result = await shazam.recognize(audioBuffer);

    if (result && result.track) {
      const track = result.track;
      
      // Obtener la mejor carátula disponible
      let artwork = '';
      if (track.images && track.images.coverarthq) {
        artwork = track.images.coverarthq;
      } else if (track.images && track.images.coverart) {
        artwork = track.images.coverart;
      }

      // Encontrar álbum en las secciones
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
    if (err.name === 'NoMatchesFoundError') {
      return res.status(200).json({
        success: true,
        match: false,
        message: 'No se encontró coincidencia en la base de datos de Shazam.'
      });
    }

    console.error('[API Identify Error]:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
};
