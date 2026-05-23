import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cors from 'cors';
import { exec } from 'child_process';
import { initGemini } from './lib/gemini.js';
import {
  analyzeFullPipeline,
  analyzeFromURL,
  loadAnalyses,
  getAnalysis,
  deleteAnalysis,
  getStats,
} from './lib/analyzer.js';
import { searchYahoo, hasYahooCredentials } from './lib/yahoo.js';
import { initClassifier, classifyEmails } from './lib/classifier.js';
import {
  getAuthUrl,
  handleOAuthCallback,
  isDriveConnected,
  uploadClassifiedEmails,
  getRootFolderInfo,
  exportTokensForEnv,
  shareRootFolder,
} from './lib/drive.js';
import { listRules, saveRule, deleteRule, appendHistory, getHistory } from './lib/mail-store.js';
import { testYahooLogin } from './lib/yahoo.js';
import {
  applyRuntimeConfigToEnv,
  getRuntimeConfig,
  setRuntimeConfig,
  clearRuntimeKey,
  configSummary,
} from './lib/runtime-config.js';
import { basicAuth } from './lib/auth.js';

dotenv.config();
applyRuntimeConfigToEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Healthcheck SIEMPRE libre (para Render y para que el iPad pruebe conectividad).
app.get('/healthz', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Basic Auth opcional (si BASIC_AUTH_USER + BASIC_AUTH_PASS están definidos).
app.use(basicAuth);

app.use(express.static(path.join(__dirname, 'public')));

// ─── File Upload Config ───
const uploadDir = path.join(__dirname, 'data', 'videos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `upload_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp4|webm|mov|avi|mkv)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de video (mp4, webm, mov, avi, mkv)'));
    }
  },
});

// ─── Initialize Gemini (opcional al arranque; se puede configurar después desde la UI) ───
function bootGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'tu_clave_aqui') {
    console.warn('⚠️  Gemini sin configurar. Arrancando igual; configurá desde la PWA o .env y reiniciá.');
    return false;
  }
  initGemini(apiKey);
  initClassifier(apiKey);
  console.log('✅ Gemini API inicializada');
  return true;
}
bootGemini();
console.log(`📧 Yahoo IMAP: ${hasYahooCredentials() ? 'configurado (' + process.env.YAHOO_EMAIL + ')' : 'MODO MOCK (sin credenciales)'}`);
console.log(`☁️  Google Drive: ${isDriveConnected() ? 'conectado' : 'sin conectar (usa /api/auth/google)'}`);
if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS) {
  console.log(`🔒 Basic Auth activo (usuario: ${process.env.BASIC_AUTH_USER})`);
} else {
  console.log('🔓 Sin Basic Auth — definí BASIC_AUTH_USER y BASIC_AUTH_PASS antes de exponer a internet.');
}

// ─── Active analyses tracking (for SSE progress) ───
const activeAnalyses = new Map();

// ═══════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════

// GET /api/stats — Dashboard statistics
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// GET /api/analyses — All analyses
app.get('/api/analyses', (req, res) => {
  const analyses = loadAnalyses();
  // Return newest first
  res.json(analyses.reverse());
});

// GET /api/analyses/:id — Single analysis
app.get('/api/analyses/:id', (req, res) => {
  const analysis = getAnalysis(req.params.id);
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' });
  res.json(analysis);
});

// DELETE /api/analyses/:id — Delete an analysis
app.delete('/api/analyses/:id', (req, res) => {
  deleteAnalysis(req.params.id);
  res.json({ ok: true });
});

// POST /api/analyze/upload — Analyze uploaded video
app.post('/api/analyze/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const videoPath = req.file.path;
  const analysisId = `analysis_${Date.now()}`;

  // Start analysis in background
  res.json({ 
    message: 'Análisis iniciado', 
    analysisId, 
    videoFile: req.file.filename 
  });

  try {
    await analyzeFullPipeline(videoPath, '', (progress) => {
      activeAnalyses.set(analysisId, progress);
    });
  } catch (err) {
    console.error('Analysis error:', err);
  } finally {
    activeAnalyses.delete(analysisId);
  }
});

// POST /api/analyze/url — Analyze from URL
app.post('/api/analyze/url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  // Start analysis in background, return immediately
  res.json({ 
    message: 'Descargando y analizando...', 
    url 
  });

  try {
    await analyzeFromURL(url, (progress) => {
      console.log('Progress:', progress);
    });
  } catch (err) {
    console.error('URL analysis error:', err);
  }
});

// GET /api/progress — SSE endpoint for real-time progress
app.get('/api/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const interval = setInterval(() => {
    const analyses = loadAnalyses();
    const running = analyses.filter(a => !['complete', 'error'].includes(a.status));
    res.write(`data: ${JSON.stringify({ running, total: analyses.length })}\n\n`);
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

// ═══════════════════════════════════════════════
// RUNTIME CONFIG (credenciales desde la PWA, sin tocar .env)
// ═══════════════════════════════════════════════

// GET /api/config — resumen masked de qué está configurado
app.get('/api/config', (req, res) => res.json(configSummary()));

// POST /api/config/gemini — guarda y reinicia Gemini en caliente
app.post('/api/config/gemini', (req, res) => {
  const apiKey = (req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ ok: false, error: 'apiKey requerida' });
  setRuntimeConfig({ GEMINI_API_KEY: apiKey });
  try {
    initGemini(apiKey);
    initClassifier(apiKey);
    res.json({ ok: true, masked: `${apiKey.slice(0,3)}…${apiKey.slice(-3)}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/config/yahoo — guarda credenciales y prueba conexión IMAP
app.post('/api/config/yahoo', async (req, res) => {
  const { email, appPassword, host, port } = req.body || {};
  if (!email || !appPassword) {
    return res.status(400).json({ ok: false, error: 'email y appPassword requeridos' });
  }
  const patch = {
    YAHOO_EMAIL: email.trim(),
    YAHOO_APP_PASSWORD: appPassword.replace(/\s+/g, ''),
  };
  if (host) patch.YAHOO_IMAP_HOST = host.trim();
  if (port) patch.YAHOO_IMAP_PORT = String(port).trim();
  setRuntimeConfig(patch);
  // Probar conexión real.
  const test = await testYahooLogin();
  if (!test.ok) {
    // No revertimos: el usuario puede haber escrito algo y querer corregir luego sin re-tipear.
    return res.status(400).json({ ok: false, error: test.reason });
  }
  res.json({ ok: true, account: test.account, total_in_inbox: test.total });
});

// DELETE /api/config/yahoo — limpiar credenciales
app.delete('/api/config/yahoo', (req, res) => {
  clearRuntimeKey('YAHOO_EMAIL');
  clearRuntimeKey('YAHOO_APP_PASSWORD');
  res.json({ ok: true });
});

// POST /api/config/google — guarda Client ID + Secret + redirect URI
app.post('/api/config/google', (req, res) => {
  const { clientId, clientSecret, redirectUri, rootFolder } = req.body || {};
  if (!clientId || !clientSecret) {
    return res.status(400).json({ ok: false, error: 'clientId y clientSecret requeridos' });
  }
  const patch = {
    GOOGLE_CLIENT_ID: clientId.trim(),
    GOOGLE_CLIENT_SECRET: clientSecret.trim(),
  };
  if (redirectUri) patch.GOOGLE_REDIRECT_URI = redirectUri.trim();
  if (rootFolder) patch.DRIVE_ROOT_FOLDER = rootFolder.trim();
  setRuntimeConfig(patch);
  res.json({ ok: true });
});

// POST /api/config/yahoo/test — prueba conexión actual sin guardar
app.post('/api/config/yahoo/test', async (req, res) => {
  const r = await testYahooLogin();
  res.status(r.ok ? 200 : 400).json(r);
});

// ═══════════════════════════════════════════════
// EMAIL CLASSIFIER (Yahoo → Gemini → Drive)
// ═══════════════════════════════════════════════

// GET /api/mail/setup-status — qué falta por configurar, con guía paso a paso
app.get('/api/mail/setup-status', (req, res) => {
  res.json({
    yahoo: {
      configured: hasYahooCredentials(),
      account: process.env.YAHOO_EMAIL || null,
      direct_url: 'https://login.yahoo.com/account/security/app-passwords',
      steps: [
        {
          n: 1,
          title: 'Atajo directo (recomendado en iPhone)',
          detail: 'Abre Safari y ve a https://login.yahoo.com/account/security/app-passwords — esta URL te lleva DIRECTO a la pantalla de contraseñas de aplicación, saltando todo el menú. Inicia sesión si te lo pide.',
        },
        {
          n: 2,
          title: 'Si el atajo te muestra "no disponible": activa la verificación en dos pasos',
          detail: 'Yahoo sólo deja generar App Passwords con 2FA activado. Ve a https://login.yahoo.com/account/security → sección "Verificación en dos pasos" → Activar. Te pedirá un número de móvil para SMS o una app autenticadora. Cuando termines, vuelve al paso 1.',
        },
        {
          n: 3,
          title: 'Camino largo si preferís navegar a mano',
          detail: 'En login.yahoo.com → icono de tu perfil arriba a la derecha → "Información de la cuenta" → menú lateral "Seguridad de la cuenta" → desplázate hasta "Otras formas de iniciar sesión" → "Generar y administrar contraseñas de aplicación". En la app móvil de Yahoo Mail es: foto de perfil → "Administrar cuentas" → tu cuenta → "Información de la cuenta" → "Seguridad".',
        },
        {
          n: 4,
          title: 'Genera la contraseña de aplicación',
          detail: 'Pulsa "Generar contraseña de aplicación" (a veces aparece como "Get app password" / "Add app password"). Yahoo te pide un nombre descriptivo: escribe "TechValidator AI" → Generar / Create.',
        },
        {
          n: 5,
          title: 'Copia la contraseña de 16 caracteres',
          detail: 'Yahoo te muestra la contraseña UNA SOLA VEZ en formato xxxx-xxxx-xxxx-xxxx (con guiones). Pulsa el icono de copiar o selecciónala manualmente. Si la cierras sin copiarla, tendrás que borrarla y generar otra.',
        },
        {
          n: 6,
          title: 'Pégala en .env y reinicia',
          detail: 'En la raíz del proyecto edita .env: YAHOO_EMAIL=tucuenta@yahoo.com.au y YAHOO_APP_PASSWORD=abcd-efgh-ijkl-mnop (con los guiones). Después: detené el servidor (Ctrl+C) y npm start de nuevo. Esta página detecta el cambio y el pill "Yahoo" se pondrá verde.',
        },
        {
          n: 7,
          title: 'Cómo revocarla si querés cortarle el acceso',
          detail: 'Volvé a la misma pantalla (paso 1) → al lado del nombre "TechValidator AI" pulsá "Eliminar". Quedará invalidada al instante; ningún App Password puede iniciar sesión interactiva, sólo IMAP/SMTP, así que es seguro.',
        },
      ],
    },
    google: {
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      connected: isDriveConnected(),
      authUrl: getAuthUrl(),
      steps: [
        {
          n: 1,
          title: 'Abre Google Cloud Console',
          detail: 'https://console.cloud.google.com/ — entra con tu cuenta de Google.',
        },
        {
          n: 2,
          title: 'Crea (o elige) un proyecto',
          detail: 'Arriba a la izquierda, selector de proyecto → "Nuevo proyecto" → nómbralo "TechValidator AI".',
        },
        {
          n: 3,
          title: 'Activa la API de Google Drive',
          detail: 'Menú ☰ → APIs y servicios → Biblioteca → busca "Google Drive API" → Habilitar.',
        },
        {
          n: 4,
          title: 'Crea pantalla de consentimiento OAuth',
          detail: 'APIs y servicios → Pantalla de consentimiento → tipo Externo → completa nombre, email de soporte y tu email. Scope: drive.file.',
        },
        {
          n: 5,
          title: 'Crea credenciales OAuth 2.0',
          detail: 'Credenciales → Crear credenciales → ID de cliente de OAuth → Tipo: Aplicación web. URI de redirección autorizado: http://localhost:3000/api/auth/google/callback',
        },
        {
          n: 6,
          title: 'Copia Client ID y Client Secret a .env',
          detail: 'GOOGLE_CLIENT_ID=... y GOOGLE_CLIENT_SECRET=... Reinicia el servidor.',
        },
        {
          n: 7,
          title: 'Conecta tu cuenta',
          detail: 'Vuelve a la app y pulsa "Conectar Google Drive". Se abrirá el consentimiento. Acepta y volverás aquí.',
        },
      ],
    },
    gemini: {
      configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'tu_clave_aqui'),
      steps: [
        {
          n: 1,
          title: 'Abre Google AI Studio',
          detail: 'https://aistudio.google.com/app/apikey — inicia sesión.',
        },
        {
          n: 2,
          title: 'Crea API Key',
          detail: 'Pulsa "Create API key" → cópiala.',
        },
        {
          n: 3,
          title: 'Pégala en .env',
          detail: 'GEMINI_API_KEY=tu_clave. Reinicia el servidor.',
        },
      ],
    },
  });
});

// POST /api/mail/search — busca en Yahoo y clasifica
app.post('/api/mail/search', async (req, res) => {
  try {
    const { from, subject, keywords, topic, sinceDays, limit, useLLM } = req.body || {};
    const { mock, messages } = await searchYahoo(
      { from, subject, keywords, topic, sinceDays },
      { limit: Math.min(Number(limit) || 30, 100) }
    );
    const classified = await classifyEmails(messages, { from, subject, keywords, topic }, {
      useLLM: useLLM !== false,
    });
    appendHistory({ kind: 'search', query: { from, subject, keywords, topic }, count: classified.length, mock });
    res.json({ mock, count: classified.length, items: classified });
  } catch (err) {
    console.error('mail/search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mail/upload — sube items seleccionados a Drive
app.post('/api/mail/upload', async (req, res) => {
  try {
    const { items = [], rootFolder } = req.body || {};
    if (!items.length) return res.status(400).json({ error: 'No items provided' });

    // Para producción real necesitamos el raw .eml y attachments con su buffer.
    // Si llegan solo metadatos (caso típico desde la PWA), re-buscamos por uid en Yahoo.
    const enriched = [];
    if (hasYahooCredentials()) {
      // Re-fetch by uid for each requested item.
      const uids = items.map((i) => String(i.uid));
      const { messages } = await searchYahoo({ keywords: '' }, { limit: 200 });
      const byUid = new Map(messages.map((m) => [String(m.uid), m]));
      for (const it of items) {
        const m = byUid.get(String(it.uid));
        if (!m) continue;
        enriched.push({
          email: { ...m, semantic: it.semantic, axes: it.axes },
          rawEml: m.raw,
          attachments: m.attachments,
        });
      }
    } else {
      // Mock: items ya traen el snippet, no hay raw real.
      for (const it of items) {
        enriched.push({
          email: it,
          rawEml: `From: ${it.from?.name} <${it.from?.address}>\r\nSubject: ${it.subject}\r\n\r\n${it.snippet || ''}`,
          attachments: [],
        });
      }
    }

    const result = await uploadClassifiedEmails(enriched, { rootName: rootFolder });
    appendHistory({ kind: 'upload', count: result.uploaded.length, mock: result.mock });
    res.json(result);
  } catch (err) {
    console.error('mail/upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Rules CRUD
app.get('/api/mail/rules', (req, res) => res.json(listRules()));
app.post('/api/mail/rules', (req, res) => res.json(saveRule(req.body || {})));
app.delete('/api/mail/rules/:id', (req, res) => {
  deleteRule(req.params.id);
  res.json({ ok: true });
});

// History
app.get('/api/mail/history', (req, res) => res.json(getHistory()));

// GET /api/diagnostics — health detallado por componente
app.get('/api/diagnostics', async (req, res) => {
  const summary = configSummary();
  const checks = {
    gemini: { status: summary.gemini.set ? 'ok' : 'missing', detail: summary.gemini.set ? `clave ${summary.gemini.masked}` : 'sin API key — pegala en el wizard' },
    yahoo: { status: 'unknown', detail: 'no probado' },
    google_creds: { status: summary.google.client_id_set && summary.google.client_secret_set ? 'ok' : 'missing', detail: summary.google.redirect_uri },
    drive_oauth: { status: isDriveConnected() ? 'ok' : 'missing', detail: isDriveConnected() ? 'conectado' : 'falta el consentimiento' },
    basic_auth: { status: (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS) ? 'ok' : 'warn', detail: (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS) ? 'activo' : 'apagado (no exponer a internet sin esto)' },
  };
  if (summary.yahoo.set) {
    try {
      const t = await testYahooLogin();
      checks.yahoo = { status: t.ok ? 'ok' : 'err', detail: t.ok ? `${t.account} (${t.total} mails)` : t.reason };
    } catch (e) {
      checks.yahoo = { status: 'err', detail: e.message };
    }
  } else {
    checks.yahoo = { status: 'missing', detail: 'sin credenciales' };
  }
  res.json({ checks, summary });
});

// POST /api/classify/test — paste any email body, get classification (debug)
app.post('/api/classify/test', async (req, res) => {
  const { from = '', subject = '', text = '', useLLM = false } = req.body || {};
  const fake = [{
    uid: 'test-1',
    from: { name: from.split('<')[0].trim() || 'Test Sender', address: (from.match(/<(.+)>/) || [, from])[1] || from || 'test@example.com' },
    subject, text, raw: `From: ${from}\r\nSubject: ${subject}\r\n\r\n${text}`,
    attachments: [], snippet: text.slice(0, 200), date: new Date(),
  }];
  const out = await classifyEmails(fake, {}, { useLLM });
  res.json(out[0]);
});

// GET /api/share/qr — genera un QR del URL público del servidor para que Isa lo escanee
app.get('/api/share/qr', (req, res) => {
  // Calcula la URL que ve el cliente. Si está detrás de proxy (Render) usa x-forwarded-*.
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const target = `${proto}://${host}/inbox.html`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=12&data=${encodeURIComponent(target)}`;
  res.json({ target, qr: qrUrl });
});

// GET /api/auth/google/export — exporta tokens OAuth para pegar en Render como env var
app.get('/api/auth/google/export', (req, res) => {
  const exp = exportTokensForEnv();
  if (!exp) return res.status(404).json({ error: 'Drive no está conectado todavía.' });
  res.json(exp);
});

// POST /api/drive/share — comparte la carpeta raíz con un email (notification opcional)
app.post('/api/drive/share', async (req, res) => {
  const { email, role, notify, message } = req.body || {};
  if (!email) return res.status(400).json({ ok: false, error: 'email requerido' });
  const r = await shareRootFolder(email.trim(), { role, notify, message });
  res.status(r.ok ? 200 : 400).json(r);
});

// GET /api/drive/root — devuelve nombre + URL de la carpeta raíz de Drive
app.get('/api/drive/root', async (req, res) => {
  try {
    res.json(await getRootFolderInfo());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth flow
app.get('/api/auth/google', (req, res) => {
  const url = getAuthUrl();
  if (!url) {
    return res
      .status(400)
      .send('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Mira /api/mail/setup-status para la guía.');
  }
  res.redirect(url);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    await handleOAuthCallback(req.query.code);
    res.redirect('/inbox.html?connected=1');
  } catch (err) {
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

// POST /api/execute-command — Execute an install command locally
app.post('/api/execute-command', (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command required' });

  // Basic sanity check to avoid catastrophic commands
  if (command.includes('rm -rf /') || command.includes('sudo ')) {
    return res.status(400).json({ error: 'Comando no permitido por seguridad' });
  }

  exec(command, { cwd: process.cwd() }, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ error: error.message, stderr, stdout });
    }
    res.json({ output: stdout, stderr });
  });
});

// ─── Start Server ───
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🤖 TECHVALIDATOR AI — Running               ║');
  console.log(`║  📍 http://localhost:${PORT}                    ║`);
  console.log('║  📂 Upload videos or paste URLs              ║');
  console.log('║  🧠 Powered by Gemini 2.5 Flash              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
