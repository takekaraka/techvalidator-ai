// Google Drive uploader (OAuth2 web flow + refresh token persistido en disco).
// Si faltan credenciales, devuelve un resultado mock para que el front pueda mostrar el flujo end-to-end.

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

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

export function isDriveConnected() {
  return hasGoogleCredentials() && fs.existsSync(TOKEN_FILE);
}

function authorisedClient() {
  if (!isDriveConnected()) return null;
  const client = oauthClient();
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  client.setCredentials(tokens);
  return client;
}

async function ensureFolder(drive, name, parentId = null) {
  const safeName = name.replace(/'/g, "\\'");
  const q = [
    `name='${safeName}'`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ');
  const list = await drive.files.list({ q, fields: 'files(id,name)' });
  if (list.data.files?.length) return list.data.files[0].id;
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  return res.data.id;
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
  if (!isDriveConnected()) {
    return {
      mock: true,
      uploaded: items.map((it) => ({
        uid: it.email.uid,
        topic: it.email.semantic?.suggested_folder || it.email.semantic?.topic,
        emlPath: `/${rootName || process.env.DRIVE_ROOT_FOLDER || 'Inbox-Classified'}/${
          it.email.semantic?.suggested_folder || 'otros'
        }/${buildEmlFilename(it.email)}`,
        attachments: (it.email.attachments_meta || []).map((a) => a.filename),
      })),
    };
  }

  const auth = authorisedClient();
  const drive = google.drive({ version: 'v3', auth });

  const root = rootName || process.env.DRIVE_ROOT_FOLDER || 'Inbox-Classified';
  const rootId = await ensureFolder(drive, root);
  const folderCache = new Map();
  const uploaded = [];

  for (const item of items) {
    const { email, rawEml, attachments } = item;
    const topicFolder = email.semantic?.suggested_folder || email.semantic?.topic || 'otros';
    let topicId = folderCache.get(topicFolder);
    if (!topicId) {
      topicId = await ensureFolder(drive, topicFolder, rootId);
      folderCache.set(topicFolder, topicId);
    }

    const emlName = buildEmlFilename(email);
    const emlRes = await uploadBuffer(drive, {
      name: emlName,
      mimeType: 'message/rfc822',
      buffer: Buffer.isBuffer(rawEml) ? rawEml : Buffer.from(rawEml || '', 'utf8'),
      parentId: topicId,
    });

    const attUploads = [];
    for (const att of attachments || []) {
      if (!att.content) continue;
      const r = await uploadBuffer(drive, {
        name: sanitizeFilename(att.filename),
        mimeType: att.contentType || 'application/octet-stream',
        buffer: att.content,
        parentId: topicId,
      });
      attUploads.push(r);
    }

    uploaded.push({
      uid: email.uid,
      topic: topicFolder,
      eml: emlRes,
      attachments: attUploads,
    });
  }

  return { mock: false, uploaded };
}
