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
} from './lib/drive.js';
import { listRules, saveRule, deleteRule, appendHistory, getHistory } from './lib/mail-store.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(cors());
app.use(express.json());
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

// ─── Initialize Gemini ───
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey === 'tu_clave_aqui') {
  console.error('');
  console.error('╔══════════════════════════════════════════════╗');
  console.error('║  ⚠️  FALTA LA API KEY DE GEMINI              ║');
  console.error('║                                              ║');
  console.error('║  1. Copia .env.example a .env                ║');
  console.error('║  2. Pega tu API Key de AI Studio             ║');
  console.error('║  3. Reinicia el servidor                     ║');
  console.error('╚══════════════════════════════════════════════╝');
  console.error('');
  process.exit(1);
}
initGemini(apiKey);
initClassifier(apiKey);
console.log('✅ Gemini API inicializada');
console.log(`📧 Yahoo IMAP: ${hasYahooCredentials() ? 'configurado' : 'MODO MOCK (sin credenciales)'}`);
console.log(`☁️  Google Drive: ${isDriveConnected() ? 'conectado' : 'sin conectar (usa /api/auth/google)'}`);

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
// EMAIL CLASSIFIER (Yahoo → Gemini → Drive)
// ═══════════════════════════════════════════════

// GET /api/mail/setup-status — qué falta por configurar, con guía paso a paso
app.get('/api/mail/setup-status', (req, res) => {
  res.json({
    yahoo: {
      configured: hasYahooCredentials(),
      account: process.env.YAHOO_EMAIL || null,
      steps: [
        {
          n: 1,
          title: 'Entra a tu cuenta de Yahoo',
          detail: 'Abre https://login.yahoo.com con tu email yahoo.com.au y haz login.',
        },
        {
          n: 2,
          title: 'Ve a Seguridad de la cuenta',
          detail: 'En el menú superior derecho → Información de la cuenta → Seguridad de la cuenta. URL directa: https://login.yahoo.com/account/security',
        },
        {
          n: 3,
          title: 'Activa la verificación en dos pasos (si no la tienes)',
          detail: 'Yahoo solo permite generar App Passwords con 2FA activado.',
        },
        {
          n: 4,
          title: 'Crea una "Contraseña de aplicación"',
          detail: 'Pulsa "Generar y administrar contraseñas de aplicación" → Escribe un nombre (ej. "TechValidator AI") → Generar.',
        },
        {
          n: 5,
          title: 'Copia la contraseña (16 caracteres)',
          detail: 'Yahoo te muestra la contraseña UNA SOLA VEZ. Cópiala entera con los guiones (ej. abcd-efgh-ijkl-mnop).',
        },
        {
          n: 6,
          title: 'Pégala en tu archivo .env',
          detail: 'En la raíz del proyecto: YAHOO_EMAIL=tucuenta@yahoo.com.au y YAHOO_APP_PASSWORD=abcd-efgh-ijkl-mnop. Después reinicia el servidor.',
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
