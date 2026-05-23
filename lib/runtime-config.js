// Runtime config: credenciales que el usuario pega desde la PWA y se persisten en disco.
// Tiene prioridad sobre las variables .env: lo que el usuario configure via UI gana.

import fs from 'fs';
import path from 'path';

const FILE = path.join(process.cwd(), 'data', 'runtime-config.json');

const KEYS = [
  'GEMINI_API_KEY',
  'YAHOO_EMAIL',
  'YAHOO_APP_PASSWORD',
  'YAHOO_IMAP_HOST',
  'YAHOO_IMAP_PORT',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'DRIVE_ROOT_FOLDER',
];

function ensure() {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '{}');
}

function read() {
  try {
    ensure();
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function write(cfg) {
  ensure();
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

// Al arranque: cargar archivo y aplicar a process.env (sobrescribe).
export function applyRuntimeConfigToEnv() {
  const cfg = read();
  for (const k of KEYS) {
    if (cfg[k]) process.env[k] = cfg[k];
  }
  return cfg;
}

export function getRuntimeConfig() {
  return read();
}

export function setRuntimeConfig(patch) {
  const cfg = read();
  for (const [k, v] of Object.entries(patch)) {
    if (!KEYS.includes(k)) continue;
    if (v === null || v === '') delete cfg[k];
    else cfg[k] = String(v);
  }
  write(cfg);
  // Reflejar a process.env.
  for (const k of KEYS) {
    if (cfg[k]) process.env[k] = cfg[k];
    else delete process.env[k];
  }
  return cfg;
}

export function clearRuntimeKey(key) {
  setRuntimeConfig({ [key]: null });
}

function mask(v) {
  if (!v) return null;
  const s = String(v);
  if (s.length < 8) return '••••';
  return `${s.slice(0, 3)}…${s.slice(-3)}`;
}

export function configSummary() {
  return {
    gemini: {
      set: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'tu_clave_aqui'),
      masked: mask(process.env.GEMINI_API_KEY),
    },
    yahoo: {
      set: Boolean(process.env.YAHOO_EMAIL && process.env.YAHOO_APP_PASSWORD),
      email: process.env.YAHOO_EMAIL || null,
      masked_password: mask(process.env.YAHOO_APP_PASSWORD),
      host: process.env.YAHOO_IMAP_HOST || 'imap.mail.yahoo.com',
      port: process.env.YAHOO_IMAP_PORT || '993',
    },
    google: {
      client_id_set: Boolean(process.env.GOOGLE_CLIENT_ID),
      client_secret_set: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback',
      root_folder: process.env.DRIVE_ROOT_FOLDER || 'Inbox-Classified',
    },
  };
}
