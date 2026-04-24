import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
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
console.log('✅ Gemini API inicializada');

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
  console.log('║  🤖 IG AI ADVISOR — Running                  ║');
  console.log(`║  📍 http://localhost:${PORT}                    ║`);
  console.log('║  📂 Upload videos or paste URLs              ║');
  console.log('║  🧠 Powered by Gemini 2.0 Flash              ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
