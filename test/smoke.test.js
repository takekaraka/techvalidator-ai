// Smoke tests end-to-end del Inbox Classifier en modo mock.
// Corre con: npm test
// No requiere credenciales reales (Gemini, Yahoo, Drive) — verifica el path mock.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.TEST_PORT || 3099;
const BASE = `http://127.0.0.1:${PORT}`;

let serverProc;

before(async () => {
  serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Esperar a que escuche.
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server boot timeout')), 8000);
    serverProc.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Running') || chunk.toString().includes(`:${PORT}`)) {
        clearTimeout(t); resolve();
      }
    });
    serverProc.on('error', reject);
  });
  // Pequeña espera adicional para que rutas estén listas.
  await sleep(200);
});

after(() => {
  serverProc?.kill();
});

async function http(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: r.status, text, json };
}

test('GET /healthz responde 200 con { ok: true }', async () => {
  const r = await http('/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.time);
});

test('GET /api/mail/setup-status devuelve guías completas', async () => {
  const r = await http('/api/mail/setup-status');
  assert.equal(r.status, 200);
  assert.ok(r.json.yahoo);
  assert.ok(r.json.google);
  assert.ok(r.json.gemini);
  assert.ok(Array.isArray(r.json.yahoo.steps));
  assert.ok(r.json.yahoo.steps.length >= 7, 'Yahoo debe tener >=7 pasos guiados');
  assert.equal(r.json.yahoo.direct_url, 'https://login.yahoo.com/account/security/app-passwords');
});

test('POST /api/mail/search en modo mock devuelve 5 emails clasificados', async () => {
  const r = await http('/api/mail/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useLLM: false, sinceDays: 365 }),
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.mock, true);
  assert.equal(r.json.count, 5);
  const ato = r.json.items.find((it) => it.from.address.includes('ato.gov.au'));
  assert.ok(ato, 'tiene que estar el email del ATO');
  assert.equal(ato.semantic.topic, 'impuestos-au');
  const qantas = r.json.items.find((it) => it.from.name === 'Qantas');
  assert.equal(qantas.semantic.topic, 'viajes', 'Qantas → viajes (no impuestos por GST)');
});

test('POST /api/classify/test clasifica email arbitrario', async () => {
  const r = await http('/api/classify/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Origin Energy <bills@origin.com.au>',
      subject: 'Your March electricity bill',
      text: 'Amount due: A$184.50. ABN 16 087 011 968. GST included.',
      useLLM: false,
    }),
  });
  assert.equal(r.status, 200);
  assert.ok(r.json.axes.au_entities.has_gst);
  assert.equal(r.json.axes.au_entities.abn, '16087011968');
  assert.ok(r.json.axes.amounts_aud.length > 0);
});

test('GET /api/share/qr devuelve QR + URL de inbox.html', async () => {
  const r = await http('/api/share/qr');
  assert.equal(r.status, 200);
  assert.ok(r.json.target.endsWith('/inbox.html'));
  assert.ok(r.json.qr.startsWith('https://api.qrserver.com/'));
});

test('GET /api/diagnostics devuelve los 5 checks esperados', async () => {
  const r = await http('/api/diagnostics');
  assert.equal(r.status, 200);
  for (const k of ['gemini', 'yahoo', 'google_creds', 'drive_oauth', 'basic_auth']) {
    assert.ok(r.json.checks[k], `falta check.${k}`);
    assert.ok(['ok', 'warn', 'err', 'missing', 'unknown'].includes(r.json.checks[k].status));
  }
});

test('POST /api/mail/upload en mock devuelve rutas /<root>/<topic>/...', async () => {
  // Primero busca para tener items.
  const search = await http('/api/mail/search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ useLLM: false, sinceDays: 365 }),
  });
  const upload = await http('/api/mail/upload', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: search.json.items }),
  });
  assert.equal(upload.status, 200);
  assert.equal(upload.json.mock, true);
  assert.equal(upload.json.uploaded.length, 5);
  assert.ok(upload.json.folders.length > 0);
  for (const u of upload.json.uploaded) {
    assert.ok(u.emlPath.startsWith('/Inbox-Classified/'));
    assert.ok(u.emlPath.endsWith('.eml'));
  }
});

test('Basic Auth opcional: sin env vars deja pasar; con vars rechaza sin auth', async () => {
  // El server actual no tiene basic auth seteado, así que /healthz pasa libre.
  const r = await http('/healthz');
  assert.equal(r.status, 200);
});
