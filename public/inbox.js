// Inbox Classifier — frontend PWA logic.

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const AXES = [
  ['Remitente / contacto', 'Coincidencia exacta, dominio y autoridad (ato.gov.au ≠ linkedin.com).'],
  ['Asunto literal', 'Substring case-insensitive contra el subject.'],
  ['Keywords full-text', 'IMAP BODY search en el servidor de Yahoo, evita descargar todo.'],
  ['Tema semántico', 'Gemini infiere el topic real (kebab-case) aunque no esté en el texto.'],
  ['Intención', 'informativo / acción-requerida / confirmación / promocional / personal / factura / viaje / seguridad.'],
  ['Urgencia', 'Detección de "asap", "due", "overdue", "today" + heurística de fecha.'],
  ['Sentimiento', 'positivo / neutro / negativo (útil para PQRs).'],
  ['Idioma', 'Auto-detect (es / en / …). Usado para luego responder con plantilla correcta.'],
  ['Entidades nombradas', 'Personas, organizaciones, fechas, importes — Gemini NER.'],
  ['Adjuntos', 'Cuenta y tipo (PDF, imagen). Crítico para facturas y reservas.'],
  ['Entidades AU', 'Detección de ABN, GST, BSB y TFN — pensado para yahoo.com.au.'],
  ['Importes monetarios', 'Extrae A$ y los lista (para deducciones / cierres de mes).'],
  ['Newsletter detect', 'Mira header List-Unsubscribe y patrones de boletín.'],
  ['Acciones sugeridas', 'responder / archivar / pagar / calendario / guardar-adjunto / borrar.'],
  ['Score de match', 'Combina remitente (+3), asunto (+3), tema (+2), cada keyword (+1). Ordena resultados.'],
  ['Confianza', 'El modelo devuelve confidence 0–1. Permite "modo conservador" si baja.'],
  ['Carpeta sugerida', 'Nombre de carpeta Drive auto-derivado del topic semántico.'],
];

let LAST_RESULTS = [];
let SETUP = null;

function setPill(id, state, text) {
  const el = document.getElementById(id);
  el.className = `status-pill ${state}`;
  el.textContent = text;
}

function renderSteps(listEl, steps) {
  listEl.innerHTML = '';
  for (const step of steps) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${step.title}</strong><br><span class="muted small">${step.detail}</span>`;
    listEl.appendChild(li);
  }
}

function setStepStateIcon(detailsId, ok) {
  const el = document.querySelector(`#${detailsId} .step-state`);
  if (el) el.textContent = ok ? '✅' : '⏳';
}

async function loadSetup() {
  const r = await fetch('/api/mail/setup-status');
  SETUP = await r.json();

  // Pre-rellena el redirect URI con el origin actual (lo que ve el iPhone).
  const redirectInput = $('#cfgGoogleRedirect');
  if (redirectInput && !redirectInput.value) {
    redirectInput.value = `${window.location.origin}/api/auth/google/callback`;
  }

  setPill('pillGemini', SETUP.gemini.configured ? 'ok' : 'err',
    `Gemini ${SETUP.gemini.configured ? 'OK' : 'FALTA'}`);
  setPill('pillYahoo', SETUP.yahoo.configured ? 'ok' : 'warn',
    SETUP.yahoo.configured ? `Yahoo: ${SETUP.yahoo.account || 'OK'}` : 'Yahoo: MODO MOCK');
  setPill('pillDrive', SETUP.google.connected ? 'ok' : (SETUP.google.configured ? 'warn' : 'err'),
    SETUP.google.connected ? 'Drive conectado' : (SETUP.google.configured ? 'Drive: conecta tu cuenta' : 'Drive: FALTAN credenciales'));

  renderSteps($('#stepsGemini'), SETUP.gemini.steps);
  renderSteps($('#stepsYahoo'), SETUP.yahoo.steps);
  renderSteps($('#stepsGoogle'), SETUP.google.steps);

  setStepStateIcon('step-gemini', SETUP.gemini.configured);
  setStepStateIcon('step-yahoo', SETUP.yahoo.configured);
  setStepStateIcon('step-google', SETUP.google.connected);

  const btn = $('#btnConnectDrive');
  btn.disabled = !SETUP.google.configured;
  btn.title = SETUP.google.configured ? '' : 'Primero pega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env';
  btn.onclick = () => { window.location.href = '/api/auth/google'; };

  // Si todavía no terminó setup, abre la sección abierta.
  if (!SETUP.gemini.configured) document.getElementById('step-gemini').open = true;
  if (!SETUP.yahoo.configured) document.getElementById('step-yahoo').open = true;
  if (!SETUP.google.connected) document.getElementById('step-google').open = true;

  // Si Drive está conectado, muestra el form de share + URL raíz + export para Render.
  if (SETUP.google.connected) {
    $('#formShareDrive').style.display = '';
    try {
      const rr = await fetch('/api/drive/root');
      const root = await rr.json();
      if (root.url) {
        $('#driveRootBox').style.display = '';
        const a = $('#driveRootUrl');
        a.href = root.url;
        const cacheTag = root.cached ? ' (cacheado, server reiniciado)' : '';
        a.textContent = `${root.name} — ${root.url}${cacheTag}`;
        $('#driveRootCopy').onclick = () => {
          navigator.clipboard.writeText(root.url).then(() => {
            const b = $('#driveRootCopy');
            const old = b.textContent; b.textContent = '✓ Copiado';
            setTimeout(() => (b.textContent = old), 1400);
          });
        };
      }
      // Mostrar el "para Render" sólo si estamos viendo el callback (?connected=1) o el usuario lo abre.
      const exp = await fetch('/api/auth/google/export').then(r => r.ok ? r.json() : null).catch(() => null);
      const box = $('#driveExportBox');
      if (exp && box) {
        box.style.display = '';
        $('#driveExportLine').textContent = exp.envLine;
        $('#driveExportCopy').onclick = () => {
          navigator.clipboard.writeText(exp.envLine).then(() => {
            const b = $('#driveExportCopy');
            const old = b.textContent; b.textContent = '✓ Copiado';
            setTimeout(() => (b.textContent = old), 1400);
          });
        };
      }
    } catch (_) { /* silencioso */ }
  }
}

function renderAxes() {
  const list = $('#axesList');
  list.innerHTML = '';
  AXES.forEach(([title, desc]) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${title}.</strong> <span class="muted">${desc}</span>`;
    list.appendChild(li);
  });
}

function chipsFor(item) {
  const chips = [];
  const sem = item.semantic || {};
  const axes = item.axes || {};
  if (sem.urgency === 'alta' || axes.is_urgent) chips.push('<span class="chip chip-red">URGENTE</span>');
  if (sem.intent === 'accion-requerida') chips.push('<span class="chip chip-yellow">ACCIÓN</span>');
  if (axes.is_receipt || sem.intent === 'factura') chips.push('<span class="chip chip-green">FACTURA</span>');
  if (axes.is_travel) chips.push('<span class="chip chip-blue">VIAJE</span>');
  if (axes.is_newsletter) chips.push('<span class="chip">NEWSLETTER</span>');
  if (axes.has_attachments) chips.push('<span class="chip">📎 adj</span>');
  if (axes.au_entities?.has_gst) chips.push('<span class="chip chip-green">GST</span>');
  if (axes.au_entities?.abn) chips.push('<span class="chip chip-green">ABN</span>');
  if (sem.topic_label) chips.push(`<span class="chip chip-blue">${sem.topic_label}</span>`);
  return chips.join(' ');
}

function renderResults(data) {
  LAST_RESULTS = data.items || [];
  $('#resultsSection').style.display = LAST_RESULTS.length ? 'block' : 'none';
  $('#resultsCount').textContent = `· ${LAST_RESULTS.length} encontrados${data.mock ? ' (modo mock)' : ''}`;
  const ul = $('#resultsList');
  ul.innerHTML = '';
  LAST_RESULTS.forEach((it, idx) => {
    const li = document.createElement('li');
    li.className = 'result-item';
    const d = it.date ? new Date(it.date).toLocaleString('es-AU', { dateStyle: 'short', timeStyle: 'short' }) : '';
    li.innerHTML = `
      <input type="checkbox" data-idx="${idx}" />
      <div>
        <div class="result-subject">${escapeHtml(it.subject || '(sin asunto)')}</div>
        <div class="result-from">${escapeHtml(it.from?.name || '')} &lt;${escapeHtml(it.from?.address || '')}&gt; · ${d} · score ${it.match_score}</div>
        <div class="result-meta">${chipsFor(it)}</div>
        <div class="result-snippet">${escapeHtml(it.snippet || '')}</div>
        ${it.semantic?.summary ? `<div class="result-summary">→ ${escapeHtml(it.semantic.summary)}</div>` : ''}
      </div>`;
    ul.appendChild(li);
  });
  ul.addEventListener('change', updateUploadState);
  $('#btnSelectAll').disabled = LAST_RESULTS.length === 0;
  updateUploadState();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function selectedIndices() {
  return $$('#resultsList input[type="checkbox"]:checked').map((cb) => Number(cb.dataset.idx));
}

function updateUploadState() {
  const n = selectedIndices().length;
  const btn = $('#btnUpload');
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `Subir a Drive ↑ (${n})` : 'Subir a Drive ↑';
}

async function doSearch() {
  const body = {
    from: $('#qFrom').value.trim(),
    subject: $('#qSubject').value.trim(),
    topic: $('#qTopic').value.trim(),
    keywords: $('#qKeywords').value.trim().split(/\s+/).filter(Boolean),
    sinceDays: Number($('#qSinceDays').value),
    useLLM: $('#qLLM').checked,
  };
  const btn = $('#btnSearch');
  btn.disabled = true; btn.textContent = 'Buscando…';
  $('#searchHint').textContent = '';
  try {
    const r = await fetch('/api/mail/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    renderResults(data);
    if (data.mock) {
      $('#searchHint').innerHTML = 'ℹ️ Estás viendo <strong>datos de ejemplo</strong> porque Yahoo IMAP no está configurado. Completá el paso 2 del wizard para usar tu cuenta real.';
    }
  } catch (e) {
    $('#searchHint').textContent = `Error: ${e.message}`;
  } finally {
    btn.disabled = false; btn.textContent = 'Buscar y clasificar';
  }
}

function renderDriveFolders(data) {
  const section = $('#driveFoldersSection');
  const list = $('#driveFoldersList');
  const hint = $('#driveFoldersHint');
  list.innerHTML = '';

  const counts = data.uploaded.reduce((acc, u) => {
    acc[u.topic] = (acc[u.topic] || 0) + 1;
    return acc;
  }, {});

  // Carpeta raíz arriba.
  if (data.root) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="topic-name">📂 RAÍZ — ${escapeHtml(data.root.name)}</span>
      <a class="folder-url" href="${escapeHtml(data.root.url)}" target="_blank" rel="noopener">${escapeHtml(data.root.url)}</a>
      <button class="btn btn-sm" data-copy-text="${escapeHtml(data.root.url)}">Copiar</button>
      ${data.root.url.startsWith('http') ? `<a class="btn btn-sm" href="${escapeHtml(data.root.url)}" target="_blank" rel="noopener">Abrir</a>` : ''}
    `;
    list.appendChild(li);
  }

  for (const f of data.folders || []) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="topic-name">${escapeHtml(f.topic)}</span>
      <a class="folder-url" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.url)}</a>
      <span class="count">${counts[f.topic] || 0} email${counts[f.topic] === 1 ? '' : 's'}</span>
      <button class="btn btn-sm" data-copy-text="${escapeHtml(f.url)}">Copiar</button>
      ${f.url.startsWith('http') ? `<a class="btn btn-sm" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">Abrir</a>` : ''}
    `;
    list.appendChild(li);
  }

  hint.textContent = data.mock
    ? '⚠️ Modo MOCK — las rutas mostradas son simuladas. Conectá Drive para obtener URLs reales.'
    : 'Tocá "Copiar" para llevarte el enlace a otra app, o "Abrir" para verlo en Drive.';
  section.style.display = data.uploaded.length ? 'block' : 'none';
  attachCopyHandlers();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function doUpload() {
  const idxs = selectedIndices();
  if (!idxs.length) return;
  const allItems = idxs.map((i) => LAST_RESULTS[i]);
  const btn = $('#btnUpload');
  btn.disabled = true;
  let pending = [...allItems];
  let totalUploaded = 0;
  let lastData = null;
  try {
    while (pending.length) {
      btn.textContent = `Subiendo ${totalUploaded}/${allItems.length}…`;
      const r = await fetch('/api/mail/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: pending }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Error');
      lastData = data;
      const consumed = data.batch_size || 0;
      totalUploaded += consumed;
      pending = pending.slice(consumed);
      if (!data.has_more) break;
    }
    btn.textContent = `✓ ${totalUploaded} subidos`;
    if (lastData) renderDriveFolders(lastData);
    setTimeout(() => updateUploadState(), 2000);
  } catch (e) {
    alert(`Error subiendo (${totalUploaded}/${allItems.length} ok): ` + e.message);
    updateUploadState();
  }
}

function attachCopyHandlers() {
  $$('[data-copy-text]').forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', () => {
      const txt = b.dataset.copyText;
      navigator.clipboard.writeText(txt).then(() => {
        const old = b.textContent; b.textContent = '✓ Copiado'; setTimeout(() => (b.textContent = old), 1400);
      });
    });
  });
}

function setupVoiceInput(micSel, targetSel) {
  const micBtn = document.querySelector(micSel);
  const target = document.querySelector(targetSel);
  if (!micBtn || !target) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { micBtn.disabled = true; micBtn.title = 'Tu navegador no soporta dictado'; return; }
  let rec = null;
  let listening = false;
  micBtn.addEventListener('click', () => {
    if (listening) { rec?.stop(); return; }
    rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => { listening = true; micBtn.classList.add('listening'); micBtn.textContent = '⏺'; };
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      if (text) target.value = (target.value ? target.value + ' ' : '') + text;
    };
    rec.onerror = () => {};
    rec.onend = () => { listening = false; micBtn.classList.remove('listening'); micBtn.textContent = '🎙️'; };
    try { rec.start(); } catch (_) { /* already started */ }
  });
}

async function doSearchAndUploadAll() {
  $('#btnSearchAndUpload').disabled = true;
  $('#btnSearchAndUpload').textContent = 'Buscando…';
  await doSearch();
  if (!LAST_RESULTS.length) {
    $('#btnSearchAndUpload').disabled = false;
    $('#btnSearchAndUpload').textContent = '⚡ Buscar y subir todo';
    return;
  }
  // Marca todos
  $$('#resultsList input[type="checkbox"]').forEach((c) => (c.checked = true));
  updateUploadState();
  $('#btnSearchAndUpload').textContent = `Subiendo ${LAST_RESULTS.length}…`;
  await doUpload();
  $('#btnSearchAndUpload').disabled = false;
  $('#btnSearchAndUpload').textContent = '⚡ Buscar y subir todo';
}

// Barrido "Castanys 8": ejecuta una lista de búsquedas (personas + temas) sobre
// los últimos 6 años, deduplica por uid, y los sube todos a Drive.
const CASTANYS8_QUERIES = [
  { from: 'matias' },              // matias pincheira
  { from: 'pincheira' },
  { from: 'mary szental' },
  { from: 'szental' },
  { from: 'carlos rodriguez' },
  { from: 'rodriguez' },
  { from: 'jorge villar' },
  { from: 'villar' },
  { from: 'joan fortuny' },
  { from: 'fortuny' },
  { from: 'david' },
  { from: 'constructa' },
  { from: 'isabella_gem' },        // enviados por Isa
  { keywords: 'castany' },
  { keywords: 'castanys 8' },
  { keywords: 'planos' },
  { keywords: 'plano' },
  { keywords: 'dossier' },
  { keywords: 'dossiers' },
  { keywords: 'factura' },
  { keywords: 'presupuesto' },
  { keywords: 'inmobiliaria' },
  { keywords: 'material' },
  { subject: 'castany' },
  { subject: 'reforma' },
  { subject: 'obra' },
];

async function doCastanys8Sweep() {
  const btn = $('#btnCastanys8');
  const progress = $('#castanysProgress');
  btn.disabled = true;
  const total = CASTANYS8_QUERIES.length;
  const allByUid = new Map();
  let i = 0;
  for (const q of CASTANYS8_QUERIES) {
    i++;
    const label = q.from ? `de:${q.from}` : q.subject ? `asunto:${q.subject}` : `palabra:${q.keywords}`;
    progress.textContent = ` Buscando ${i}/${total} (${label})…`;
    btn.textContent = `🏠 Buscando ${i}/${total}…`;
    try {
      const r = await fetch('/api/mail/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...q, sinceDays: 2190, limit: 100, useLLM: false }),
      });
      const data = await r.json();
      if (data.items) {
        for (const it of data.items) {
          if (!allByUid.has(String(it.uid))) allByUid.set(String(it.uid), it);
        }
      }
      progress.textContent = ` ${i}/${total} hecho. Total único: ${allByUid.size}`;
    } catch (e) {
      console.warn('castanys sweep err', label, e);
    }
  }
  const merged = Array.from(allByUid.values());
  renderResults({ items: merged, mock: false });
  progress.textContent = ` ✓ ${merged.length} emails únicos. Subiendo a Drive…`;
  if (!merged.length) {
    btn.disabled = false;
    btn.textContent = '🏠 Barrido Castanys 8 (6 años, todo)';
    return;
  }
  $$('#resultsList input[type="checkbox"]').forEach((c) => (c.checked = true));
  updateUploadState();
  try {
    await doUpload();
    progress.textContent = ` ✓ Subido. ${merged.length} emails en Drive.`;
  } catch (e) {
    progress.textContent = ` ✗ Error subiendo: ${e.message}`;
  }
  btn.disabled = false;
  btn.textContent = '🏠 Barrido Castanys 8 (6 años, todo)';
}

function setMsg(id, text, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'form-msg' + (kind ? ' ' + kind : '');
}

async function saveGemini(e) {
  e.preventDefault();
  const apiKey = $('#cfgGeminiKey').value.trim();
  if (!apiKey) return setMsg('msgGemini', 'Pegá la API key.', 'err');
  setMsg('msgGemini', 'Guardando…', 'info');
  try {
    const r = await fetch('/api/config/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    setMsg('msgGemini', `✓ Activada (${data.masked})`, 'ok');
    $('#cfgGeminiKey').value = '';
    loadSetup();
  } catch (e) { setMsg('msgGemini', '✗ ' + e.message, 'err'); }
}

async function saveYahoo(e) {
  e.preventDefault();
  const email = $('#cfgYahooEmail').value.trim();
  const appPassword = $('#cfgYahooPass').value.trim();
  if (!email || !appPassword) return setMsg('msgYahoo', 'Email y App Password son obligatorios.', 'err');
  setMsg('msgYahoo', 'Probando conexión con Yahoo…', 'info');
  try {
    const r = await fetch('/api/config/yahoo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, appPassword }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    setMsg('msgYahoo', `✓ Conectado a ${data.account} (${data.total_in_inbox} mails en INBOX)`, 'ok');
    $('#cfgYahooPass').value = '';
    loadSetup();
  } catch (e) { setMsg('msgYahoo', '✗ ' + e.message, 'err'); }
}

async function clearYahoo() {
  if (!confirm('¿Borrar credenciales de Yahoo?')) return;
  await fetch('/api/config/yahoo', { method: 'DELETE' });
  setMsg('msgYahoo', 'Borradas.', 'info');
  loadSetup();
}

async function shareDrive(e) {
  e.preventDefault();
  const email = $('#cfgShareEmail').value.trim();
  const notify = $('#cfgShareNotify').checked;
  if (!email) return setMsg('msgShare', 'Pegá un email.', 'err');
  setMsg('msgShare', 'Compartiendo…', 'info');
  try {
    const r = await fetch('/api/drive/share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, notify }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    setMsg('msgShare', `✓ Carpeta compartida con ${data.permission.emailAddress} como ${data.permission.role}. ${notify ? 'Le llegó un mail.' : ''}`, 'ok');
  } catch (e) { setMsg('msgShare', '✗ ' + e.message, 'err'); }
}

async function saveGoogle(e) {
  e.preventDefault();
  const clientId = $('#cfgGoogleId').value.trim();
  const clientSecret = $('#cfgGoogleSecret').value.trim();
  const redirectUri = $('#cfgGoogleRedirect').value.trim();
  if (!clientId || !clientSecret) return setMsg('msgGoogle', 'Client ID y Secret son obligatorios.', 'err');
  setMsg('msgGoogle', 'Guardando…', 'info');
  try {
    const r = await fetch('/api/config/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret, redirectUri }),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Error');
    setMsg('msgGoogle', '✓ Credenciales guardadas. Ahora tocá "Conectar Google Drive".', 'ok');
    $('#cfgGoogleSecret').value = '';
    loadSetup();
  } catch (e) { setMsg('msgGoogle', '✗ ' + e.message, 'err'); }
}

document.addEventListener('DOMContentLoaded', () => {
  renderAxes();
  loadSetup();

  $('#formGemini').addEventListener('submit', saveGemini);
  $('#formYahoo').addEventListener('submit', saveYahoo);
  $('#btnClearYahoo').addEventListener('click', clearYahoo);
  $('#formGoogle').addEventListener('submit', saveGoogle);
  $('#formShareDrive').addEventListener('submit', shareDrive);

  $('#btnRestore').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg('msgRestore', 'Cargando archivo…', 'info');
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const r = await fetch('/api/config/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'Error');
      setMsg('msgRestore', `✓ Restaurado: ${data.restored_keys.length} claves${data.drive ? ' + tokens Drive' : ''}. Recargá la página.`, 'ok');
      setTimeout(() => location.reload(), 1500);
    } catch (e) { setMsg('msgRestore', '✗ ' + e.message, 'err'); }
  });

  $('#btnSearch').addEventListener('click', doSearch);
  $('#btnUpload').addEventListener('click', doUpload);
  $('#btnSearchAndUpload').addEventListener('click', doSearchAndUploadAll);
  $('#btnCastanys8').addEventListener('click', doCastanys8Sweep);

  setupVoiceInput('#micKeywords', '#qKeywords');

  // Register service worker para que la PWA funcione offline.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Sistema (Mac LaunchAgent)
  fetch('/api/system/info').then(r => r.json()).then((info) => {
    if (info.platform !== 'darwin') return;
    $('#systemCard').style.display = '';
    $('#systemInfo').textContent =
      `${info.platform}/${info.arch} · usuario ${info.user} · uptime ${Math.floor(info.uptime_sec / 60)} min · LaunchAgent: ${info.launch_agent ? 'instalado ✅' : 'no instalado'}`;
    $('#btnInstallLA').addEventListener('click', async () => {
      setMsg('msgLA', 'Instalando…', 'info');
      const r = await fetch('/api/system/launch-agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'install' }),
      }).then(r => r.json());
      setMsg('msgLA', r.ok ? '✓ Instalado. Cada login arranca el server solo.' : '✗ ' + (r.error || 'error'), r.ok ? 'ok' : 'err');
    });
    $('#btnUninstallLA').addEventListener('click', async () => {
      if (!confirm('¿Desinstalar el auto-start?')) return;
      setMsg('msgLA', 'Desinstalando…', 'info');
      const r = await fetch('/api/system/launch-agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'uninstall' }),
      }).then(r => r.json());
      setMsg('msgLA', r.ok ? '✓ Desinstalado.' : '✗ ' + (r.error || 'error'), r.ok ? 'ok' : 'err');
    });
  }).catch(() => {});

  $('#btnSelectAll').addEventListener('click', () => {
    const checkboxes = $$('#resultsList input[type="checkbox"]');
    const allSel = checkboxes.every((c) => c.checked);
    checkboxes.forEach((c) => (c.checked = !allSel));
    updateUploadState();
  });
  $('#toggleShare').addEventListener('click', async () => {
    const box = $('#shareBox');
    const btn = $('#toggleShare');
    if (box.style.display === 'none') {
      const r = await fetch('/api/share/qr');
      const data = await r.json();
      $('#shareQR').src = data.qr;
      $('#shareUrl').href = data.target;
      $('#shareUrl').textContent = data.target;
      $('#shareCopyUrl').onclick = () => navigator.clipboard.writeText(data.target).then(() => {
        const b = $('#shareCopyUrl'); const old = b.textContent;
        b.textContent = '✓ Copiado'; setTimeout(() => (b.textContent = old), 1400);
      });
      const msg = encodeURIComponent(
        `Hola! Abrí esto en Safari del iPhone (en WiFi de casa): ${data.target}\n\nDespués tocá Compartir ⬆ → "Añadir a pantalla de inicio" para que te quede como app.`
      );
      $('#shareWhatsApp').onclick = () => window.open(`https://wa.me/?text=${msg}`, '_blank');
      $('#shareMail').onclick = () => window.location.href = `mailto:?subject=Inbox AI&body=${msg}`;
      box.style.display = '';
      btn.textContent = 'Ocultar QR';
    } else {
      box.style.display = 'none';
      btn.textContent = 'Mostrar QR';
    }
  });
  $('#toggleSetup').addEventListener('click', () => {
    const card = $('#setupCard');
    const hidden = card.dataset.collapsed === '1';
    card.dataset.collapsed = hidden ? '0' : '1';
    $$('.setup-card .step-block').forEach((b) => (b.style.display = hidden ? '' : 'none'));
    $('#toggleSetup').textContent = hidden ? 'Ocultar' : 'Mostrar';
  });
  $$('[data-copy]').forEach((b) => {
    b.addEventListener('click', () => {
      const txt = b.previousElementSibling?.innerText || '';
      navigator.clipboard.writeText(txt).then(() => {
        const old = b.textContent; b.textContent = '✓'; setTimeout(() => (b.textContent = old), 1200);
      });
    });
  });
  attachCopyHandlers();

  // Si volvemos de OAuth, recargamos status.
  if (location.search.includes('connected=1')) {
    setTimeout(loadSetup, 500);
  }
});
