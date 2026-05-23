# Renderz Studio — AI Tools

Suite de dos herramientas IA bajo el mismo servidor:

- **TechValidator AI** (`/validator.html`) — Analiza videos de creadores (Reels / Shorts / TikTok) y te dice qué herramientas mencionan, cuáles vale la pena instalar y cuáles no.
- **Inbox Classifier** (`/inbox.html`) — Busca en `yahoo.com.au` por remitente / asunto / tema / keywords, clasifica los emails en 17 ejes con Gemini, y los sube a Google Drive en carpetas por tema.

Página de inicio (`/`) es un hub con tarjetas para entrar a cada una.

---

## TechValidator AI (legacy)

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

## Arranque rápido en Mac (un solo comando)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/takekaraka/techvalidator-ai/claude/iphone-email-classifier-drive-zfQ6j/scripts/dev-mac.sh)
```

Clona o actualiza el repo, instala dependencias, crea `.env` si falta, te imprime la IP de la Mac (para conectar desde el iPad/iPhone en la misma WiFi) y arranca el servidor. Para evitar que la Mac se duerma mientras corre:

```bash
caffeinate -dimsu &
```

Una vez arriba, **toda la configuración de credenciales se hace desde la propia PWA**: abrís `http://<IP-de-la-Mac>:3000/inbox.html` en Safari y pegás Gemini key, email de Yahoo + App Password, y Google OAuth Client ID/Secret en los formularios de la sección "Guía de configuración". El servidor las persiste en `data/runtime-config.json` (gitignored) y las reinyecta como variables de entorno en caliente.

### Proteger acceso (recomendado si lo exponés a internet)

Añadí en `.env`:
```
BASIC_AUTH_USER=isa
BASIC_AUTH_PASS=algo-largo-y-único
```
Reinicia. Toda la app queda detrás de Basic Auth excepto `/healthz`.

---

## Inbox Classifier (Yahoo → Google Drive) — para iPhone 17

Una segunda app dentro del mismo servidor: una **PWA instalable en la pantalla de inicio del iPhone 17** que busca emails en `yahoo.com.au` por *nombre, asunto, tema o palabras clave*, los clasifica en **17 ejes** con Gemini y, si se lo pides, **los sube organizados a Google Drive** (carpeta por tema + `.eml` + adjuntos).

### Cómo abrirla en el iPhone 17

1. En Safari, abre `https://tu-servidor/inbox.html`
2. Compartir → **Añadir a pantalla de inicio**
3. Listo: queda como app standalone.

### Setup paso a paso (te lo guía la propia app, sección «Guía de configuración»)

#### A) Crear App Password de Yahoo

Yahoo **no permite IMAP con tu contraseña normal**. Necesitas una "Contraseña de aplicación".

1. Login en https://login.yahoo.com con tu cuenta `@yahoo.com.au`.
2. Entra a https://login.yahoo.com/account/security
3. Activa la **verificación en dos pasos** (obligatorio para generar App Passwords).
4. Click en **"Generar y administrar contraseñas de aplicación"**.
5. Escribe un nombre (ej. `TechValidator AI`) → **Generar**.
6. Yahoo te mostrará la clave de **16 caracteres** (formato `abcd-efgh-ijkl-mnop`) una sola vez. Cópiala.
7. Pégala en `.env`:
   ```
   YAHOO_EMAIL=tucuenta@yahoo.com.au
   YAHOO_APP_PASSWORD=abcd-efgh-ijkl-mnop
   ```
8. Reinicia el servidor.

#### B) Crear credenciales OAuth para Google Drive

1. Abre https://console.cloud.google.com/
2. **Crear proyecto** → nómbralo `TechValidator AI`.
3. **APIs y servicios → Biblioteca** → busca *Google Drive API* → **Habilitar**.
4. **APIs y servicios → Pantalla de consentimiento** → tipo **Externo** → completa nombre, email de soporte y email del desarrollador. Scope: `drive.file`.
5. **Credenciales → Crear credenciales → ID de cliente OAuth 2.0** → Tipo *Aplicación web*. URI de redirección autorizado:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
   (en producción, sustituye por tu dominio).
6. Copia **Client ID** y **Client Secret** al `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   ```
7. Reinicia. En la PWA, pulsa **"Conectar Google Drive"** → consentimiento → vuelves a la app conectado.

#### C) Estructura que crea en Drive

```
/Inbox-Classified/
  ├── impuestos-au/
  │   ├── 2026-04-02__Origin Energy__Your electricity bill.eml
  │   └── invoice-march.pdf
  ├── viajes/
  │   └── 2026-05-10__Qantas__Booking SYD-BCN.eml
  └── personal/
      └── 2026-05-18__Maria Lopez__Cumpleaños de Lucas.eml
```

### Los 17 ejes de clasificación

| Eje | Para qué sirve |
|-----|----------------|
| **Remitente / contacto** | Match exacto, dominio, autoridad (`ato.gov.au` ≠ `linkedin.com`) |
| **Asunto literal** | Substring case-insensitive |
| **Keywords full-text** | IMAP BODY search en servidor de Yahoo (no descarga todo) |
| **Tema semántico** | Gemini infiere el topic aunque no esté en el texto |
| **Intención** | `informativo` / `acción-requerida` / `confirmación` / `promocional` / `personal` / `factura` / `viaje` / `seguridad` |
| **Urgencia** | Heurística + LLM |
| **Sentimiento** | positivo / neutro / negativo |
| **Idioma** | ES / EN / … (para responder con plantilla correcta) |
| **Entidades NER** | Personas, organizaciones, fechas, importes |
| **Adjuntos** | Tipo + tamaño |
| **Entidades AU** | ABN, GST, BSB, TFN — pensado para `yahoo.com.au` |
| **Importes A$** | Para deducciones / cierres de mes |
| **Newsletter detect** | Header `List-Unsubscribe` |
| **Acciones sugeridas** | responder / archivar / pagar / calendario / guardar-adjunto |
| **Match score** | Combina remitente (+3) + asunto (+3) + tema (+2) + cada keyword (+1) |
| **Confianza** | `0–1` del modelo, permite modo conservador |
| **Carpeta sugerida** | Nombre auto-derivado para Drive |

### Modo mock

Si te falta configurar Yahoo o Drive, la app funciona igual con **datos de ejemplo** para que veas el flujo end-to-end. Los pills del header te dicen qué está conectado y qué no.

### API añadida

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/mail/setup-status` | Estado de configuración + pasos guiados |
| `POST` | `/api/mail/search` | Busca y clasifica emails |
| `POST` | `/api/mail/upload` | Sube a Drive los emails seleccionados |
| `GET` / `POST` / `DELETE` | `/api/mail/rules[/:id]` | Reglas guardadas |
| `GET` | `/api/mail/history` | Historial de búsquedas y subidas |
| `GET` | `/api/auth/google` | Inicia OAuth de Drive |
| `GET` | `/api/auth/google/callback` | Callback OAuth |

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
