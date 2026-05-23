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

  // Si Drive está conectado, muestra la URL de la carpeta raíz.
  if (SETUP.google.connected) {
    try {
      const rr = await fetch('/api/drive/root');
      const root = await rr.json();
      if (root.url) {
        $('#driveRootBox').style.display = '';
        const a = $('#driveRootUrl');
        a.href = root.url;
        a.textContent = `${root.name} — ${root.url}`;
        $('#driveRootCopy').onclick = () => {
          navigator.clipboard.writeText(root.url).then(() => {
            const b = $('#driveRootCopy');
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
  const items = idxs.map((i) => LAST_RESULTS[i]);
  const btn = $('#btnUpload');
  btn.disabled = true; btn.textContent = 'Subiendo…';
  try {
    const r = await fetch('/api/mail/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Error');
    renderDriveFolders(data);
  } catch (e) {
    alert('Error subiendo: ' + e.message);
  } finally {
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

document.addEventListener('DOMContentLoaded', () => {
  renderAxes();
  loadSetup();

  $('#btnSearch').addEventListener('click', doSearch);
  $('#btnUpload').addEventListener('click', doUpload);
  $('#btnSelectAll').addEventListener('click', () => {
    const checkboxes = $$('#resultsList input[type="checkbox"]');
    const allSel = checkboxes.every((c) => c.checked);
    checkboxes.forEach((c) => (c.checked = !allSel));
    updateUploadState();
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
