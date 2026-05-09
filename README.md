# TechValidator AI

<p align="center">
  <img src="https://img.shields.io/badge/Gemini_2.5-Powered-blue?style=for-the-badge&logo=google" alt="Gemini Powered">
  <img src="https://img.shields.io/badge/Open_Source-MIT-green?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/Instagram-Reels-E4405F?style=for-the-badge&logo=instagram" alt="Instagram">
  <img src="https://img.shields.io/badge/YouTube-Shorts-FF0000?style=for-the-badge&logo=youtube" alt="YouTube">
</p>

<p align="center">
  <strong>Analiza lo que recomienda tu influencer favorito.<br>Descubre qué herramientas realmente valen la pena.</strong>
</p>

<p align="center">
  <a href="https://www.renderz-studio.com/es/techvalidator">Ver Demo</a> •
  <a href="#instalación">Instalación</a> •
  <a href="#api">API</a> •
  <a href="#contribuir">Contribuir</a>
</p>

---

## El Problema

Los influencers de tecnología recomiendan **decenas de herramientas cada semana**:
- "Esta extensión de VS Code te cambiará la vida"
- "Este repo de GitHub tiene 50k estrellas"  
- "Esta CLI tool acelera tu workflow 10x"

Tú las guardas... y nunca las revisas. O peor: instalas algo que está abandonado, tiene vulnerabilidades, o simplemente no sirve para tu caso.

## La Solución

**TechValidator AI** analiza videos de Instagram Reels, YouTube Shorts y TikTok con inteligencia artificial para:

1. **Extraer** todas las herramientas, repos y tecnologías mencionadas
2. **Investigar** cada una: mantenimiento, seguridad, pros/contras, alternativas
3. **Recomendar** con un veredicto claro: ✅ INSTALAR / 🟡 EVALUAR / ❌ SALTAR
4. **Facilitar** la instalación con comandos verificados

---

## Cómo Funciona

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Pega URL de    │────▶│  Gemini 2.5     │────▶│  Veredicto +    │
│  Instagram/YT   │     │  analiza video  │     │  Recomendación  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Input:** URL de un Reel o video subido  
**Output:** Lista de herramientas con análisis completo

---

## Características

| Feature | Descripción |
|---------|-------------|
| 🎬 **Análisis Multimodal** | Gemini 2.5 Flash procesa el video completo |
| 🔍 **Investigación Automática** | Evalúa GitHub stars, mantenimiento, seguridad |
| ✅ **Veredictos Claros** | INSTALAR / EVALUAR / SALTAR para cada tool |
| 📋 **Comandos Verificados** | Copia y ejecuta directamente |
| 🌐 **Multi-plataforma** | Instagram, YouTube, TikTok, archivos locales |
| ⚡ **Quick Wins** | Herramientas que se instalan en < 5 minutos |

---

## Demo en Vivo

**[→ Probar TechValidator AI](https://www.renderz-studio.com/es/techvalidator)**

---

## Instalación

### Requisitos

- Node.js 18+
- [API Key de Gemini](https://aistudio.google.com/app/apikey) (gratis)
- [API Key de RapidAPI](https://rapidapi.com) para Instagram (opcional, gratis)

### Setup Local

```bash
# Clonar
git clone https://github.com/takekaraka/techvalidator-ai.git
cd techvalidator-ai

# Instalar
npm install

# Configurar
cp .env.example .env
# Edita .env con tus API keys

# Ejecutar
npm start
```

Abre `http://localhost:3000`

### Deploy en Render (Producción)

1. Fork este repo
2. Conecta en [Render](https://render.com)
3. Configura variables de entorno:
   - `GEMINI_API_KEY`
   - `RAPIDAPI_KEY`
4. Deploy automático con Docker

---

## API

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/stats` | Estadísticas generales |
| `GET` | `/api/analyses` | Lista de análisis |
| `POST` | `/api/analyze/upload` | Subir video para análisis |
| `POST` | `/api/analyze/url` | Analizar desde URL |
| `DELETE` | `/api/analyses/:id` | Eliminar análisis |

### Ejemplo

```bash
curl -X POST https://tu-servidor.com/api/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.instagram.com/reel/ABC123/"}'
```

---

## Estructura

```
techvalidator-ai/
├── server.js          # API Express
├── lib/
│   ├── analyzer.js    # Pipeline de análisis
│   ├── downloader.js  # Descarga de videos
│   ├── gemini.js      # Integración Gemini AI
│   └── config.js      # Configuración
├── public/            # Frontend standalone
├── Dockerfile         # Para Render/Docker
└── render.yaml        # Config de Render
```

---

## Personalización

### Cambiar modelo de IA

```javascript
// lib/gemini.js línea 17
model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
```

### Agregar plataformas

Extiende `lib/downloader.js` con nuevas funciones de descarga.

### Modificar UI

El frontend en `public/` es vanilla HTML/CSS/JS. Personaliza libremente.

---

## Contribuir

```bash
# Fork → Clone → Branch
git checkout -b feature/mi-mejora

# Desarrolla y commitea
git commit -m "Agregar nueva característica"

# Push → Pull Request
git push origin feature/mi-mejora
```

---

## Tech Stack

- **Backend:** Node.js, Express
- **AI:** Google Gemini 2.5 Flash
- **Video:** yt-dlp, RapidAPI
- **Frontend:** Vanilla JS, CSS Custom Properties
- **Deploy:** Docker, Render

---

## Créditos

Creado por **[Renderz Studio](https://www.renderz-studio.com)**

Powered by:
- [Google Gemini](https://ai.google.dev/)
- [RapidAPI](https://rapidapi.com)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)

---

## Licencia

MIT License — Usa, modifica y distribuye libremente.

---

## Apoya el Proyecto

Si TechValidator te ahorra horas de investigación:

<p align="center">
  <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=takekaraka@yahoo.com&currency_code=EUR">
    <img src="https://img.shields.io/badge/PayPal-Invitar_un_café_☕-00457C?style=for-the-badge&logo=paypal" alt="Donar">
  </a>
</p>

---

<p align="center">
  <strong>¿Preguntas?</strong> → <a href="mailto:hola@renderz-studio.com">hola@renderz-studio.com</a>
</p>
