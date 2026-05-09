// ═══════════════════════════════════════
// TECHVALIDATOR AI — Frontend App
// ═══════════════════════════════════════

const API = 'https://techvalidator-ai.onrender.com';
const FETCH_TIMEOUT = 30000;
let polling = null;
let lastAnalysesData = '';
let connectionStatus = 'unknown';

// ── Fetch with timeout and error handling ──
async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado. El servidor puede estar iniciándose.');
    }
    throw error;
  }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  checkConnection();
  loadStats();
  loadAnalyses();
  initUpload();
  startPolling();
});

// ── Connection Check ──
async function checkConnection() {
  const badge = document.getElementById('geminiStatus');
  try {
    const res = await fetchWithTimeout(`${API}/api/stats`, {}, 10000);
    if (res.ok) {
      connectionStatus = 'connected';
      badge.textContent = 'GEMINI 2.5 FLASH CONECTADO';
      badge.style.color = 'var(--green)';
    } else {
      throw new Error('Backend error');
    }
  } catch (e) {
    connectionStatus = 'error';
    badge.textContent = 'CONECTANDO...';
    badge.style.color = 'var(--yellow)';
    setTimeout(checkConnection, 5000);
  }
}

// ── Stats ──
async function loadStats() {
  try {
    const res = await fetchWithTimeout(`${API}/api/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    document.getElementById('statTotal').textContent = s.totalAnalyses || 0;
    document.getElementById('statItems').textContent = s.totalItemsFound || 0;
    document.getElementById('statInstall').textContent = s.installRecommended || 0;
    document.getElementById('statSkip').textContent = s.skipRecommended || 0;
  } catch (e) {
    console.warn('Stats error:', e);
  }
}

// ── Upload / URL ──
function initUpload() {
  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const btnFile = document.getElementById('btnSelectFile');
  const btnUrl = document.getElementById('btnAnalyzeUrl');
  const urlInput = document.getElementById('urlInput');

  btnFile.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadVideo(fileInput.files[0]);
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) {
      uploadVideo(f);
    } else {
      showToast('Solo se permiten archivos de video', 'error');
    }
  });

  btnUrl.addEventListener('click', () => analyzeUrl());
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeUrl();
  });
}

async function uploadVideo(file) {
  if (file.size > 200 * 1024 * 1024) {
    showToast('El archivo excede el límite de 200MB', 'error');
    return;
  }

  showProcessing('Subiendo video...', `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  updateProgress(5);

  const form = new FormData();
  form.append('video', file);

  try {
    const res = await fetchWithTimeout(`${API}/api/analyze/upload`, {
      method: 'POST',
      body: form
    }, 120000);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Error del servidor (${res.status})`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error);
    }

    showProcessing('Analizando con Gemini...', 'Esto puede tardar 1-3 minutos');
    updateProgress(30);
    showToast('Video subido, análisis en progreso...', 'success');

    document.getElementById('fileInput').value = '';

  } catch (e) {
    hideProcessing();
    showToast('Error al subir: ' + e.message, 'error');
    console.error('Upload error:', e);
  }
}

async function analyzeUrl() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();

  if (!url) {
    showToast('Pega una URL primero', 'error');
    return;
  }

  // Instagram temporarily blocked
  if (url.includes('instagram.com')) {
    showToast('Instagram bloqueado temporalmente. Usa YouTube, TikTok, o sube el video directamente.', 'error');
    return;
  }

  if (!isValidVideoUrl(url)) {
    showToast('URL no válida. Usa YouTube, TikTok o sube el video directamente.', 'error');
    return;
  }

  showProcessing('Descargando video...', url);
  updateProgress(10);

  try {
    const res = await fetchWithTimeout(`${API}/api/analyze/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    }, 120000);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Error del servidor (${res.status})`);
    }

    const data = await res.json();

    if (data.error) {
      throw new Error(data.error);
    }

    showProcessing('Analizando con Gemini...', 'Esto puede tardar 1-3 minutos');
    updateProgress(20);
    urlInput.value = '';
    showToast('Descarga iniciada, análisis en progreso...', 'success');

  } catch (e) {
    hideProcessing();
    showToast('Error: ' + e.message, 'error');
    console.error('URL analysis error:', e);
  }
}

function isValidVideoUrl(url) {
  try {
    const u = new URL(url);
    const validDomains = [
      'instagram.com', 'www.instagram.com',
      'youtube.com', 'www.youtube.com', 'youtu.be',
      'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com',
      'twitter.com', 'x.com'
    ];
    return validDomains.some(d => u.hostname.includes(d)) ||
           url.match(/\.(mp4|webm|mov|avi)(\?|$)/i);
  } catch {
    return false;
  }
}

// ── Processing Status ──
function showProcessing(title, detail) {
  const el = document.getElementById('processingStatus');
  el.style.display = 'block';
  document.getElementById('processTitle').textContent = title;
  document.getElementById('processDetail').textContent = detail;
  updateProgress(10);
}

function hideProcessing() {
  document.getElementById('processingStatus').style.display = 'none';
  updateProgress(0);
}

function updateProgress(pct) {
  document.getElementById('progressFill').style.width = pct + '%';
}

// ── Load Analyses ──
async function loadAnalyses() {
  try {
    const res = await fetchWithTimeout(`${API}/api/analyses`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const analyses = await res.json();
    const newDataString = JSON.stringify(analyses);

    if (newDataString !== lastAnalysesData) {
      renderAnalyses(analyses);
      lastAnalysesData = newDataString;
    }
  } catch (e) {
    console.warn('Load analyses error:', e);
  }
}

function renderAnalyses(analyses) {
  const container = document.getElementById('analysesList');

  if (!analyses || !analyses.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">🔍</div>
        <p>Aún no hay análisis. Sube un video o pega una URL para empezar.</p>
      </div>`;
    return;
  }

  container.innerHTML = analyses.map(a => {
    const statusClass = a.status === 'complete' ? 'status-complete' :
                        a.status === 'error' ? 'status-error' : 'status-analyzing';

    const statusMap = {
      complete: 'Completado',
      error: 'Error',
      analyzing_video: 'Analizando video...',
      researching_tools: 'Investigando...',
      generating_summary: 'Generando resumen...',
      pending: 'Pendiente...',
      downloading: 'Descargando...'
    };
    const statusText = statusMap[a.status] || a.status;

    const date = new Date(a.createdAt).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    const itemCount = a.toolResearch?.length || a.videoAnalysis?.items?.length || 0;
    const installCount = (a.toolResearch || []).filter(t => t.research?.verdict === 'INSTALL').length;
    const skipCount = (a.toolResearch || []).filter(t => t.research?.verdict === 'SKIP').length;

    return `
      <div class="analysis-card open" id="card-${a.id}">
        <div class="analysis-header" onclick="toggleCard('${a.id}')" style="cursor: pointer;">
          <div class="analysis-info">
            <h3>${escapeHtml(a.videoAnalysis?.video_summary || a.videoFilename || 'Análisis en progreso...')}</h3>
            <div class="meta">
              <span>📅 ${date}</span>
              <span>🔧 ${itemCount} herramientas</span>
              ${installCount ? `<span style="color:var(--green)">✅ ${installCount} instalar</span>` : ''}
              ${skipCount ? `<span style="color:var(--red)">❌ ${skipCount} saltar</span>` : ''}
              ${a.videoAnalysis?.video_topic ? `<span>📌 ${escapeHtml(a.videoAnalysis.video_topic)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:0.75rem;">
            <span class="status ${statusClass}">${statusText}</span>
            ${a.status !== 'complete' && a.status !== 'error' ? '<div class="spinner"></div>' : ''}
          </div>
        </div>
        <div class="analysis-body">
          ${renderAnalysisBody(a)}
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderAnalysisBody(a) {
  if (a.status === 'error') {
    return `<p style="color:var(--red)">❌ Error: ${escapeHtml(a.error || 'Error desconocido')}</p>`;
  }

  if (a.status !== 'complete') {
    return `<p style="color:var(--grey-light)">⏳ Análisis en progreso...</p>`;
  }

  let html = '';

  // Summary section
  if (a.summary) {
    html += `<div class="summary-card">`;

    if (a.summary.install_now?.length) {
      html += `<h4>✅ Instalar Ahora</h4><ul class="summary-list">`;
      html += a.summary.install_now.map(i =>
        `<li><strong>${escapeHtml(i.name)}</strong> <span class="why">${escapeHtml(i.why)}</span></li>`
      ).join('');
      html += `</ul>`;
    }

    if (a.summary.skip?.length) {
      html += `<h4 style="margin-top:1rem">❌ Saltar</h4><ul class="summary-list">`;
      html += a.summary.skip.map(i =>
        `<li><strong>${escapeHtml(i.name)}</strong> <span class="why">${escapeHtml(i.why)}</span></li>`
      ).join('');
      html += `</ul>`;
    }

    if (a.summary.quick_wins?.length) {
      html += `<h4 style="margin-top:1rem">⚡ Quick Wins (< 5 min)</h4><ul class="summary-list">`;
      html += a.summary.quick_wins.map(i =>
        `<li><strong>${escapeHtml(i.name)}</strong> <span class="why">${escapeHtml(i.time)} — <code>${escapeHtml(i.command || '')}</code></span></li>`
      ).join('');
      html += `</ul>`;
    }

    if (a.summary.overall_note) {
      html += `<p style="margin-top:1rem;font-size:0.85rem;color:var(--grey-light);font-style:italic;">${escapeHtml(a.summary.overall_note)}</p>`;
    }

    html += `</div>`;
  }

  // Tools detail
  if (a.toolResearch?.length) {
    html += `<div class="tools-list">`;
    html += a.toolResearch.map(t => {
      const r = t.research || {};
      const verdict = r.verdict || 'EVALUATE';
      const toolNameSafe = (t.name || '').replace(/[^a-zA-Z0-9]/g, '');
      const installCmd = r.install_command_verified || t.install_command || '';

      return `
        <div class="tool-item">
          <div class="tool-top">
            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
              <span class="tool-name">${escapeHtml(t.name)}</span>
              <span class="tool-category">${escapeHtml(t.category || '')}</span>
              ${r.github_stars_estimate ? `<span style="color:var(--grey-light);font-size:11px;">⭐ ${escapeHtml(r.github_stars_estimate)}</span>` : ''}
            </div>
            <span class="verdict verdict-${verdict}">${verdict === 'INSTALL' ? '✅ INSTALAR' : verdict === 'SKIP' ? '❌ SALTAR' : '🟡 EVALUAR'}</span>
          </div>

          <div class="tool-desc" style="font-size: 14px; margin-bottom: 24px; color: var(--white);">${escapeHtml(r.usefulness_notes || t.description || '')}</div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 24px; font-size: 12px;">
            ${r.pros?.length ? `<div>
              <strong style="color:var(--green); letter-spacing:1px; text-transform:uppercase; font-size:10px;">VENTAJAS</strong>
              <ul style="list-style:none; padding-top:8px; display:flex; flex-direction:column; gap:6px; color:var(--grey-light);">
                ${r.pros.map(p => `<li>✓ ${escapeHtml(p)}</li>`).join('')}
              </ul>
            </div>` : ''}

            ${r.cons?.length ? `<div>
              <strong style="color:var(--red); letter-spacing:1px; text-transform:uppercase; font-size:10px;">DESVENTAJAS</strong>
              <ul style="list-style:none; padding-top:8px; display:flex; flex-direction:column; gap:6px; color:var(--grey-light);">
                ${r.cons.map(c => `<li>— ${escapeHtml(c)}</li>`).join('')}
              </ul>
            </div>` : ''}

            ${r.ideal_projects?.length ? `<div>
              <strong style="color:var(--accent); letter-spacing:1px; text-transform:uppercase; font-size:10px;">IDEAL PARA</strong>
              <ul style="list-style:none; padding-top:8px; display:flex; flex-direction:column; gap:6px; color:var(--grey-light);">
                ${r.ideal_projects.map(p => `<li>• ${escapeHtml(p)}</li>`).join('')}
              </ul>
            </div>` : ''}
          </div>

          <div class="tool-meta" style="margin-bottom: 16px;">
            ${r.maintenance_status ? `<span>🔧 Mantenimiento: ${escapeHtml(r.maintenance_status)}</span>` : ''}
            ${r.security_concerns && r.security_concerns !== 'none' ? `<span style="color:var(--red)">⚠️ Seguridad: ${escapeHtml(r.security_concerns)} (${escapeHtml(r.risk_notes || 'Revisar')})</span>` : `<span>✅ Seguro</span>`}
            ${r.usefulness_score ? `<span>Puntuación: ⭐ ${r.usefulness_score}/10</span>` : ''}
          </div>

          ${installCmd ? `
            <div class="tool-command">
              <code>${escapeHtml(installCmd)}</code>
              <div style="display:flex;gap:8px;">
                <button onclick="copyCommand(this)" data-cmd="${escapeHtml(installCmd)}">📋 Copiar</button>
                ${isLocalhost() ? `<button onclick="executeCommand(this)" data-cmd="${escapeHtml(installCmd)}" style="color:var(--accent);border-color:var(--accent);">⚡ Instalar</button>` : ''}
              </div>
            </div>
          ` : ''}
          ${r.verdict_reason ? `<div class="tool-verdict-reason" style="margin-top:16px; padding-left:12px; border-left:2px solid var(--line-strong); color:var(--grey-light); font-style:italic;">"${escapeHtml(r.verdict_reason)}"</div>` : ''}
          ${r.alternatives?.length ? `<div style="margin-top:12px;font-size:0.78rem;color:var(--grey-light);">Alternativas sugeridas: ${r.alternatives.map(alt => escapeHtml(alt)).join(', ')}</div>` : ''}
        </div>
      `;
    }).join('');
    html += `</div>`;
  }

  // Delete button
  html += `
    <div style="margin-top:1.5rem;text-align:right;">
      <button class="btn btn-danger btn-sm" onclick="deleteAnalysis('${a.id}')">🗑️ Eliminar análisis</button>
    </div>`;

  return html;
}

// ── Helper Functions ──
function isLocalhost() {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

// ── Actions ──
function toggleCard(id) {
  const card = document.getElementById('card-' + id);
  if (card) card.classList.toggle('open');
}

function copyCommand(btn) {
  const cmd = btn.getAttribute('data-cmd');
  navigator.clipboard.writeText(cmd).then(() => {
    showToast('Comando copiado ✓', 'success');
  }).catch(() => {
    showToast('No se pudo copiar', 'error');
  });
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Comando copiado ✓', 'success');
  }).catch(() => {
    showToast('No se pudo copiar', 'error');
  });
}

async function executeCommand(btn) {
  const command = btn.getAttribute('data-cmd');
  if (!confirm('¿Ejecutar este comando en tu sistema?\n\n' + command)) return;

  const originalText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div>';
  btn.disabled = true;

  try {
    const res = await fetchWithTimeout(`${API}/api/execute-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    }, 60000);

    const data = await res.json();

    if (res.ok && !data.error) {
      showToast('¡Instalación exitosa! ✓', 'success');
      btn.innerHTML = '✅ Instalado';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--green)';
    } else {
      showToast('Error: ' + (data.error || 'Fallo en la instalación'), 'error');
      btn.innerHTML = '❌ Error';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 3000);
    }
  } catch (e) {
    showToast('Error de conexión con el servidor', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteAnalysis(id) {
  if (!confirm('¿Eliminar este análisis?')) return;

  try {
    const res = await fetchWithTimeout(`${API}/api/analyses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Análisis eliminado', 'success');
      loadAnalyses();
      loadStats();
    } else {
      showToast('Error al eliminar', 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

// ── Toast ──
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type ? 'toast-' + type : ''}`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Polling ──
function startPolling() {
  polling = setInterval(async () => {
    try {
      const res = await fetchWithTimeout(`${API}/api/analyses`, {}, 10000);
      if (!res.ok) return;

      const analyses = await res.json();
      const running = analyses.filter(a => !['complete', 'error'].includes(a.status));

      if (running.length > 0) {
        const r = running[0];
        const steps = {
          pending: 10,
          downloading: 20,
          analyzing_video: 40,
          researching_tools: 65,
          generating_summary: 85
        };
        const titles = {
          pending: 'Preparando análisis...',
          downloading: 'Descargando video...',
          analyzing_video: 'Analizando video con Gemini...',
          researching_tools: 'Investigando herramientas...',
          generating_summary: 'Generando resumen ejecutivo...'
        };
        showProcessing(titles[r.status] || 'Procesando...', r.videoFilename || '');
        updateProgress(steps[r.status] || 50);
      } else {
        hideProcessing();
      }

      const newDataString = JSON.stringify(analyses);
      if (newDataString !== lastAnalysesData) {
        const hadRunning = JSON.parse(lastAnalysesData || '[]').some(a => !['complete', 'error'].includes(a.status));
        const nowComplete = analyses.some(a => a.status === 'complete');

        if (hadRunning && nowComplete && lastAnalysesData) {
          showToast('¡Análisis completado! 🎉', 'success');
        }

        renderAnalyses(analyses);
        lastAnalysesData = newDataString;
      }

      loadStats();
    } catch (e) {
      // Silent fail for polling
    }
  }, 3000);
}
