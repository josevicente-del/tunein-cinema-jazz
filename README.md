# 📻 TuneIn Cinema & Jazz — Radio Online & PWA

> Reproductor de streaming en vivo y PWA (**Progressive Web App**) especializado en emisoras de **Jazz, Cine y Bandas Sonoras**, con soporte integrado para transmisiones **HLS** (`.m3u8`), **MP3/AAC** (Icecast/Shoutcast), guía EPG, identificador de audio en vivo e integración con Vercel.

---

## 🌟 Características Principales

### 🎵 Motor de Audio Híbrido (HLS + MP3)
- **HLS (.m3u8)**: Decodificación mediante [Hls.js](https://github.com/video-dev/hls.js/) con respaldo nativo para dispositivos Apple Safari.
- **Icecast / Shoutcast (MP3/AAC)**: Reproducción directa de baja latencia mediante HTML5 Audio.
- **Visualizador de Audio Dinámico**: Animación de barras reactivas en tiempo real durante la reproducción.

### 📱 Experiencia PWA (Progressive Web App)
- **Instalable**: Compatible con instalación en escritorio y móviles (Android, iOS) mediante `manifest.webmanifest`.
- **Modo Offline & Caché**: Controlado mediante `sw.js` (Service Worker) para acceso instantáneo a la interfaz y recursos estáticos.

### 🎬 EPG y Metadatos en Vivo
- **Guía de Programación EPG**: Consulta dinámica de programas emitidos y próximos horarios.
- **Now Playing Banner**: Visualización de carátula, título de la pista, compositor y emisora actual.
- **Identificador de Audio**: Detección y búsqueda asistida de piezas musicales en emisión.

### 🌐 Interfaz y Usabilidad
- **Tema Oscuro & Glassmorphism**: Diseño moderno, responsivo y adaptado para sesiones prolongadas.
- **Barra de Reproducción Persistente**: Barra inferior con control de volumen, mute, saltos y estado en vivo.
- **Favoritos y Filtros**: Búsqueda en tiempo real, filtrado por categorías y almacenamiento persistente en `localStorage`.
- **Métricas & Contadores**: Indicadores de oyentes estimados y visitas.

---

## 📻 Catálogo de Emisoras

### 🇪🇸 Emisoras Españolas Destacadas
- **Radio Klara (104.4 FM · València)**: Emisora libre histórica (1982) con jazz, blues, cine y debate social.
- **Radio 3 (RNE · RTVE)**: Emisión cultural de referencia con programas como *"El Séptimo Vicio"* y jazz.
- **Radio 5 (RNE · RTVE)**: Información continua con microespacios de cine (*"De Película"*).
- **Radio Clásica (RNE · RTVE)**: Obras orquestales y bandas sonoras maestras.

### 🎷 Jazz, Bebop, Fusion & Acid Jazz
- **Instrumental Jazz**: Sesiones acústicas puras (piano de cola, contrabajo, saxofón).
- **Smooth Jazz Lounge**: Sonido relajante y ambiente chillout.
- **JazzRadio 106.8 Berlin**: Directo desde la capital alemana.
- **100% ACID JAZZ**: Rare groove, funk, soul y jazz fusión.
- **TSF Jazz (89.9 FM · París)**: La mítica radio parisina del jazz.
- **Jazz Radio Classic**: Obras de Miles Davis, John Coltrane, Chet Baker, etc.
- **Adroit Jazz Underground**: Jazz modal y de vanguardia.

### 🎬 Cine & Bandas Sonoras Internacionales
- **CINEMUSIC Radio (Francia)**: Emisora francesa dedicada a grandes compositores de cine.
- **Cinemix Radio**: Clásicos y novedades de John Williams, Ennio Morricone, Hans Zimmer, etc.
- **0N Movies on Radio (Berlín)**: Hollywood, ciencia ficción y cine de culto 24/7.

---

## 🛠️ Estructura del Proyecto

```text
├── assets/                 # Iconos PWA, logotipos de emisoras e imágenes
├── js/
│   ├── app.js              # Controlador principal de la UI, eventos y contadores
│   ├── audio-identifier.js  # Lógica de identificación y metadatos de audio
│   ├── epg-service.js      # Servicio de guía de programación electrónica (EPG)
│   ├── player.js           # Motor de streaming dual (HTML5 Audio + Hls.js)
│   └── stations.js         # Catálogo de emisoras, streams y metadatos
├── index.html              # Estructura principal y maquetación web
├── manifest.webmanifest    # Manifiesto de configuración de la PWA
├── package.json            # Metadatos del proyecto y dependencias
├── server.js               # Servidor estático Node.js para desarrollo local
├── style.css               # Estilos globales, diseño responsive y temas
├── sw.js                   # Service Worker para caché y PWA
└── vercel.json             # Configuración de despliegue para Vercel
```

---

## 🚀 Puesta en Marcha Local

### Prerrequisitos
- [Node.js](https://nodejs.org/) (versión 16 o superior).

### Instalación y Ejecución

1. **Instalar dependencias**:
   ```bash
   npm install
   ```

2. **Iniciar el servidor local**:
   ```bash
   npm start
   # o bien:
   node server.js
   ```

3. **Abrir en el navegador**:
   Visita [http://localhost:4173](http://localhost:4173) en tu navegador preferido.

---

## ☁️ Despliegue en Vercel

El proyecto está configurado para desplegarse fácilmente en Vercel:

1. Conecta tu repositorio a [Vercel](https://vercel.com).
2. La configuración incluida en `vercel.json` gestiona el enrutamiento y la caché de los archivos estáticos.
3. Para la monitorización y métricas de tráfico, cuenta con la integración de `@vercel/analytics`.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo `package.json` para más detalles.
