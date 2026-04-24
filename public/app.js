// ═══════════════════════════════════════
// IG AI ADVISOR — Frontend App
// ═══════════════════════════════════════

const API = '';
let polling = null;
let lastAnalysesData = '';

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadAnalyses();
  initUpload();
  startPolling();
});

// ── Stats ──
async function loadStats() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const s = await res.json();
    document.getElementById('statTotal').textContent = s.totalAnalyses || 0;
    document.getElementById('statItems').textContent = s.totalItemsFound || 0;
    document.getElementById('statInstall').textContent = s.installRecommended || 0;
    document.getElementById('statSkip').textContent = s.skipRecommended || 0;
  } catch (e) { console.warn('Stats error:', e); }
}

// ── Upload / URL ──
function initUpload() {
  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const btnFile = document.getElementById('btnSelectFile');
  const btnUrl = document.getElementById('btnAnalyzeUrl');
  const urlInput = document.getElementById('urlInput');

  btnFile.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadVideo(fileInput.files[0]); });

  // Drag & drop
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) uploadVideo(f);
    else showToast('Solo se permiten archivos de video', 'error');
  });

  // URL analysis
  btnUrl.addEventListener('click', () => analyzeUrl());
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeUrl(); });
}

async function uploadVideo(file) {
  showProcessing('Subiendo video...', `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  const form = new FormData();
  form.append('video', file);
  try {
    const res = await fetch(`${API}/api/analyze/upload`, { method: 'POST', body: form });
    const data = await res.json();
    showProcessing('Analizando con Gemini...', 'Esto puede tardar 1-3 minutos');
    updateProgress(30);
    showToast('Video subido, análisis en progreso...', 'success');
  } catch (e) {
    hideProcessing();
    showToast('Error al subir el video: ' + e.message, 'error');
  }
}

async function analyzeUrl() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) return showToast('Pega una URL primero', 'error');
  showProcessing('Descargando video...', url);
  try {
    const res = await fetch(`${API}/api/analyze/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    showProcessing('Analizando con Gemini...', 'Esto puede tardar 1-3 minutos');
    updateProgress(20);
    document.getElementById('urlInput').value = '';
    showToast('Descarga iniciada, análisis en progreso...', 'success');
  } catch (e) {
    hideProcessing();
    showToast('Error: ' + e.message, 'error');
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
function hideProcessing() { document.getElementById('processingStatus').style.display = 'none'; }
function updateProgress(pct) { document.getElementById('progressFill').style.width = pct + '%'; }

// ── Load Analyses ──
async function loadAnalyses() {
  try {
    const res = await fetch(`${API}/api/analyses`);
    const analyses = await res.json();
    const newDataString = JSON.stringify(analyses);
    if (newDataString !== lastAnalysesData) {
      renderAnalyses(analyses);
      lastAnalysesData = newDataString;
    }
  } catch (e) { console.warn('Load error:', e); }
}

function renderAnalyses(analyses) {
  const container = document.getElementById('analysesList');
  if (!analyses.length) {
    container.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>Aún no hay análisis. Sube un video o pega una URL para empezar.</p></div>`;
    return;
  }

  container.innerHTML = analyses.map(a => {
    const statusClass = a.status === 'complete' ? 'status-complete' :
                        a.status === 'error' ? 'status-error' : 'status-analyzing';
    const statusText = { complete: 'Completado', error: 'Error',
      analyzing_video: 'Analizando video...', researching_tools: 'Investigando...',
      generating_summary: 'Generando resumen...' }[a.status] || a.status;
    const date = new Date(a.createdAt).toLocaleString('es-ES', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    const itemCount = a.toolResearch?.length || a.videoAnalysis?.items?.length || 0;
    const installCount = (a.toolResearch || []).filter(t => t.research?.verdict === 'INSTALL').length;
    const skipCount = (a.toolResearch || []).filter(t => t.research?.verdict === 'SKIP').length;

    return `
      <div class="analysis-card open" id="card-${a.id}">
        <div class="analysis-header" onclick="toggleCard('${a.id}')" style="cursor: pointer;">
          <div class="analysis-info">
            <h3>${a.videoAnalysis?.video_summary || a.videoFilename || 'Análisis en progreso...'}</h3>
            <div class="meta">
              <span>📅 ${date}</span>
              <span>🔧 ${itemCount} herramientas</span>
              ${installCount ? `<span style="color:var(--green)">✅ ${installCount} instalar</span>` : ''}
              ${skipCount ? `<span style="color:var(--red)">❌ ${skipCount} saltar</span>` : ''}
              ${a.videoAnalysis?.video_topic ? `<span>📌 ${a.videoAnalysis.video_topic}</span>` : ''}
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

function renderAnalysisBody(a) {
  if (a.status === 'error') return `<p style="color:var(--red)">❌ Error: ${a.error}</p>`;
  if (a.status !== 'complete') return `<p style="color:var(--text-muted)">⏳ Análisis en progreso...</p>`;

  let html = '';

  // Summary section
  if (a.summary) {
    html += `<div class="summary-card">`;
    if (a.summary.install_now?.length) {
      html += `<h4>✅ Instalar Ahora</h4><ul class="summary-list">`;
      html += a.summary.install_now.map(i => `<li><strong>${i.name}</strong> <span class="why">${i.why}</span></li>`).join('');
      html += `</ul>`;
    }
    if (a.summary.skip?.length) {
      html += `<h4 style="margin-top:1rem">❌ Saltar</h4><ul class="summary-list">`;
      html += a.summary.skip.map(i => `<li><strong>${i.name}</strong> <span class="why">${i.why}</span></li>`).join('');
      html += `</ul>`;
    }
    if (a.summary.quick_wins?.length) {
      html += `<h4 style="margin-top:1rem">⚡ Quick Wins (< 5 min)</h4><ul class="summary-list">`;
      html += a.summary.quick_wins.map(i => `<li><strong>${i.name}</strong> <span class="why">${i.time} — <code>${i.command || ''}</code></span></li>`).join('');
      html += `</ul>`;
    }
    if (a.summary.overall_note) {
      html += `<p style="margin-top:1rem;font-size:0.85rem;color:var(--text-muted);font-style:italic;">${a.summary.overall_note}</p>`;
    }
    html += `</div>`;
  }

  // Tools detail
  if (a.toolResearch?.length) {
    html += `<div class="tools-list">`;
    html += a.toolResearch.map(t => {
      const r = t.research || {};
      const verdict = r.verdict || 'EVALUATE';
      return `
        <div class="tool-item">
          <div class="tool-top">
            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
              <span class="tool-name">${t.name}</span>
              <span class="tool-category">${t.category || ''}</span>
              ${r.github_stars_estimate ? `<span style="color:var(--text-muted);font-size:11px;">⭐ ${r.github_stars_estimate}</span>` : ''}
            </div>
            <span class="verdict verdict-${verdict}">${verdict === 'INSTALL' ? '✅ INSTALAR' : verdict === 'SKIP' ? '❌ SALTAR' : '🟡 EVALUAR'}</span>
          </div>
          
          <div class="tool-desc" style="font-size: 14px; margin-bottom: 24px; color: var(--white);">${r.usefulness_notes || t.description || ''}</div>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-bottom: 24px; font-size: 12px;">
            ${r.pros?.length ? `<div>
              <strong style="color:var(--green); letter-spacing:1px; text-transform:uppercase; font-size:10px;">VENTAJAS</strong>
              <ul style="list-style:none; padding-top:8px; display:flex; flex-direction:column; gap:6px; color:var(--grey-text);">
                ${r.pros.map(p => `<li>✓ ${p}</li>`).join('')}
              </ul>
            </div>` : ''}
            
            ${r.cons?.length ? `<div>
              <strong style="color:var(--red); letter-spacing:1px; text-transform:uppercase; font-size:10px;">DESVENTAJAS</strong>
              <ul style="list-style:none; padding-top:8px; display:flex; flex-direction:column; gap:6px; color:var(--grey-text);">
                ${r.cons.map(c => `<li>— ${c}</li>`).join('')}
              </ul>
            </div>` : ''}
            
            ${r.ideal_projects?.length ? `<div>
              <strong style="color:var(--accent); letter-spacing:1px; text-transform:uppercase; font-size:10px;">IDEAL PARA</strong>
              <ul style="list-style:none; padding-top:8px; display:flex; flex-direction:column; gap:6px; color:var(--grey-text);">
                ${r.ideal_projects.map(p => `<li>• ${p}</li>`).join('')}
              </ul>
            </div>` : ''}
          </div>

          <div class="tool-meta" style="margin-bottom: 16px;">
            ${r.maintenance_status ? `<span>🔧 Mantenimiento: ${r.maintenance_status}</span>` : ''}
            ${r.security_concerns && r.security_concerns !== 'none' ? `<span style="color:var(--red)">⚠️ Seguridad: ${r.security_concerns} (${r.risk_notes || 'Revisar'})</span>` : `<span>✅ Seguro</span>`}
            ${r.usefulness_score ? `<span>Puntuación: ⭐ ${r.usefulness_score}/10</span>` : ''}
          </div>

          ${(r.install_command_verified || t.install_command) ? `
            <div class="tool-command">
              <code>${r.install_command_verified || t.install_command}</code>
              <div style="display:flex;gap:8px;">
                <button onclick="copyText('${(r.install_command_verified || t.install_command).replace(/'/g, "\\'")}')">📋 Copiar</button>
                <button id="btn-exec-${t.name.replace(/\\s+/g, '')}" onclick="executeCommand('${(r.install_command_verified || t.install_command).replace(/'/g, "\\'")}', this.id)" style="color:var(--accent);border-color:var(--accent);">⚡ Instalar</button>
              </div>
            </div>
          ` : ''}
          ${r.verdict_reason ? `<div class="tool-verdict-reason" style="margin-top:16px; padding-left:12px; border-left:2px solid var(--line-strong); color:var(--grey-light); font-style:italic;">"${r.verdict_reason}"</div>` : ''}
          ${r.alternatives?.length ? `<div style="margin-top:12px;font-size:0.78rem;color:var(--text-muted);">Alternativas sugeridas: ${r.alternatives.join(', ')}</div>` : ''}
        </div>
      `;
    }).join('');
    html += `</div>`;
  }

  // Delete button
  html += `<div style="margin-top:1.5rem;text-align:right;">
    <button class="btn btn-danger btn-sm" onclick="deleteAnalysis('${a.id}')">🗑️ Eliminar análisis</button>
  </div>`;

  return html;
}

// ── Actions ──
function toggleCard(id) {
  document.getElementById('card-' + id)?.classList.toggle('open');
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Comando copiado ✓', 'success'));
}

async function executeCommand(command, btnId) {
  if (!confirm('¿Ejecutar este comando en tu sistema?\\n\\n' + command)) return;
  
  const btn = document.getElementById(btnId);
  const originalText = btn.innerHTML;
  btn.innerHTML = '<div class="spinner"></div>';
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/api/execute-command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    const data = await res.json();
    
    if (res.ok) {
      showToast('¡Instalación exitosa! ✓', 'success');
      btn.innerHTML = '✅ Instalado';
      btn.style.color = 'var(--green)';
      btn.style.borderColor = 'var(--green)';
    } else {
      showToast('Error: ' + (data.error || 'Fallo en la instalación'), 'error');
      btn.innerHTML = '❌ Error';
      btn.disabled = false;
    }
  } catch (e) {
    showToast('Error de conexión con el servidor', 'error');
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

async function deleteAnalysis(id) {
  if (!confirm('¿Eliminar este análisis?')) return;
  await fetch(`${API}/api/analyses/${id}`, { method: 'DELETE' });
  loadAnalyses();
  loadStats();
  showToast('Análisis eliminado', 'success');
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
      const res = await fetch(`${API}/api/analyses`);
      const analyses = await res.json();
      const running = analyses.filter(a => !['complete', 'error'].includes(a.status));

      if (running.length > 0) {
        const r = running[0];
        const steps = { analyzing_video: 30, researching_tools: 60, generating_summary: 85 };
        showProcessing(
          { analyzing_video: 'Analizando video con Gemini...', researching_tools: 'Investigando herramientas...', generating_summary: 'Generando resumen ejecutivo...' }[r.status] || 'Procesando...',
          r.videoFilename || ''
        );
        updateProgress(steps[r.status] || 50);
      } else {
        hideProcessing();
      }

      const newDataString = JSON.stringify(analyses);
      if (newDataString !== lastAnalysesData) {
        renderAnalyses(analyses);
        lastAnalysesData = newDataString;
      }

      loadStats();
    } catch (e) { /* silent */ }
  }, 3000);
}
