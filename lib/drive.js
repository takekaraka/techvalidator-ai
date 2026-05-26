// Google Drive uploader (OAuth2 web flow + refresh token persistido en disco).
// Si faltan credenciales, devuelve un resultado mock para que el front pueda mostrar el flujo end-to-end.

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { setRuntimeConfig } from './runtime-config.js';

const TOKEN_FILE = path.join(process.cwd(), 'data', 'google-token.json');

function hasGoogleCredentials() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function ensureDataDir() {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  );
}

export function getAuthUrl() {
  if (!hasGoogleCredentials()) return null;
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export async function handleOAuthCallback(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  ensureDataDir();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  return tokens;
}

function loadTokens() {
  // Prioridad: env var (Render-friendly, sobrevive reboots) → archivo en disco.
  if (process.env.GOOGLE_TOKENS_JSON) {
    try {
      return JSON.parse(
        Buffer.from(process.env.GOOGLE_TOKENS_JSON, 'base64').toString('utf8')
      );
    } catch (_) {
      try { return JSON.parse(process.env.GOOGLE_TOKENS_JSON); } catch (_) { return null; }
    }
  }
  if (fs.existsSync(TOKEN_FILE)) return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  return null;
}

export function isDriveConnected() {
  return hasGoogleCredentials() && loadTokens() !== null;
}

export function exportTokensForEnv() {
  const t = loadTokens();
  if (!t) return null;
  const base64 = Buffer.from(JSON.stringify(t)).toString('base64');
  return { json: t, base64, envLine: `GOOGLE_TOKENS_JSON=${base64}` };
}

function authorisedClient() {
  if (!isDriveConnected()) return null;
  const client = oauthClient();
  const tokens = loadTokens();
  client.setCredentials(tokens);
  return client;
}

export async function shareRootFolder(email, { role = 'writer', notify = true, message = '' } = {}) {
  if (!isDriveConnected()) {
    return { ok: false, error: 'Drive no está conectado' };
  }
  const auth = authorisedClient();
  const drive = google.drive({ version: 'v3', auth });
  const name = process.env.DRIVE_ROOT_FOLDER || 'Inbox-Classified';
  const root = await ensureFolder(drive, name);
  try {
    const perm = await drive.permissions.create({
      fileId: root.id,
      sendNotificationEmail: notify,
      emailMessage: message || `Te comparto la carpeta donde van los emails clasificados por la IA. Podés ver y editar.`,
      requestBody: { type: 'user', role, emailAddress: email },
      fields: 'id, emailAddress, role',
    });
    return { ok: true, folder: root, permission: perm.data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function readCachedRoot() {
  if (!process.env.DRIVE_ROOT_FOLDER_INFO) return null;
  try {
    return JSON.parse(process.env.DRIVE_ROOT_FOLDER_INFO);
  } catch (_) {
    return null;
  }
}

export async function getRootFolderInfo() {
  const name = process.env.DRIVE_ROOT_FOLDER || 'Inbox-Classified';
  const cached = readCachedRoot();
  if (!isDriveConnected()) {
    if (cached?.url) return { connected: false, cached: true, ...cached };
    return { connected: false, name, url: null };
  }
  try {
    const auth = authorisedClient();
    const drive = google.drive({ version: 'v3', auth });
    const folder = await ensureFolder(drive, name);
    return { connected: true, ...folder };
  } catch (e) {
    if (cached?.url) return { connected: true, cached: true, ...cached, error: e.message };
    return { connected: true, name, url: null, error: e.message };
  }
}

function cacheRootFolderInfo(folder) {
  try {
    setRuntimeConfig({
      DRIVE_ROOT_FOLDER_INFO: JSON.stringify({ ...folder, saved_at: new Date().toISOString() }),
    });
  } catch (_) { /* no-op si no se puede persistir */ }
}

async function ensureFolder(drive, name, parentId = null) {
  const safeName = name.replace(/'/g, "\\'");
  const q = [
    `name='${safeName}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ');
  const list = await drive.files.list({ q, fields: 'files(id,name,webViewLink)' });
  let folder;
  if (list.data.files?.length) {
    const f = list.data.files[0];
    folder = { id: f.id, url: f.webViewLink || `https://drive.google.com/drive/folders/${f.id}`, name };
  } else {
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
      },
      fields: 'id, webViewLink',
    });
    folder = {
      id: res.data.id,
      url: res.data.webViewLink || `https://drive.google.com/drive/folders/${res.data.id}`,
      name,
    };
  }
  // Cachear sólo la carpeta raíz (sin parent), para fallback offline.
  if (!parentId) cacheRootFolderInfo(folder);
  return folder;
}

function sanitizeFilename(s) {
  return String(s || 'untitled').replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 120);
}

function buildEmlFilename(email) {
  const d = new Date(email.date || Date.now());
  const ymd = d.toISOString().slice(0, 10);
  const from = (email.from?.name || email.from?.address || 'unknown').split('@')[0];
  return `${ymd}__${sanitizeFilename(from)}__${sanitizeFilename(email.subject)}.eml`;
}

async function uploadBuffer(drive, { name, mimeType, buffer, parentId }) {
  const res = await drive.files.create({
    requestBody: { name, parents: [parentId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink, name',
  });
  return res.data;
}

// Estructura: /<DRIVE_ROOT_FOLDER>/<topic>/YYYY-MM-DD__sender__subject.eml + adjuntos sueltos.
export async function uploadClassifiedEmails(items, { rootName } = {}) {
  const root = rootName || process.env.DRIVE_ROOT_FOLDER || 'Inbox-Classified';

  if (!isDriveConnected()) {
    const folderMap = new Map();
    for (const it of items) {
      const topic = it.email.semantic?.suggested_folder || it.email.semantic?.topic || 'otros';
      folderMap.set(topic, `/${root}/${topic}/`);
    }
    return {
      mock: true,
      root: { name: root, url: `/${root}/`, id: null },
      folders: [...folderMap].map(([topic, url]) => ({ topic, url, id: null })),
      uploaded: items.map((it) => ({
        uid: it.email.uid,
        topic: it.email.semantic?.suggested_folder || it.email.semantic?.topic || 'otros',
        folderUrl: `/${root}/${it.email.semantic?.suggested_folder || 'otros'}/`,
        emlPath: `/${root}/${it.email.semantic?.suggested_folder || 'otros'}/${buildEmlFilename(it.email)}`,
        attachments: (it.email.attachments_meta || []).map((a) => a.filename),
      })),
    };
  }

  const auth = authorisedClient();
  const drive = google.drive({ version: 'v3', auth });

  const rootFolder = await ensureFolder(drive, root);
  const folderCache = new Map();
  const uploaded = [];

  for (const item of items) {
    const { email, rawEml, attachments } = item;
    const topicName = email.semantic?.suggested_folder || email.semantic?.topic || 'otros';
    let topicFolder = folderCache.get(topicName);
    if (!topicFolder) {
      topicFolder = await ensureFolder(drive, topicName, rootFolder.id);
      folderCache.set(topicName, topicFolder);
    }

    const emlName = buildEmlFilename(email);
    const emlRes = await uploadBuffer(drive, {
      name: emlName,
      mimeType: 'message/rfc822',
      buffer: Buffer.isBuffer(rawEml) ? rawEml : Buffer.from(rawEml || '', 'utf8'),
      parentId: topicFolder.id,
    });

    const attUploads = [];
    for (const att of attachments || []) {
      if (!att.content) continue;
      const r = await uploadBuffer(drive, {
        name: sanitizeFilename(att.filename),
        mimeType: att.contentType || 'application/octet-stream',
        buffer: att.content,
        parentId: topicFolder.id,
      });
      attUploads.push(r);
    }

    uploaded.push({
      uid: email.uid,
      topic: topicName,
      folderUrl: topicFolder.url,
      folderId: topicFolder.id,
      eml: emlRes,
      attachments: attUploads,
    });
  }

  return {
    mock: false,
    root: rootFolder,
    folders: [...folderCache.values()].map((f) => ({ topic: f.name, url: f.url, id: f.id })),
    uploaded,
  };
}
