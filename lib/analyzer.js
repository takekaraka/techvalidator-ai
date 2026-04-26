import fs from 'fs';
import path from 'path';
import { analyzeVideo, researchTool, generateSummary } from './gemini.js';
import { downloadFromURL } from './downloader.js';

const DATA_FILE = path.join(process.cwd(), 'data', 'analyses.json');

/**
 * Load existing analyses from disk
 */
export function loadAnalyses() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Save analyses to disk
 */
function saveAnalyses(analyses) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(analyses, null, 2), 'utf8');
}

/**
 * Full analysis pipeline for a single video.
 * 1. Analyze video content with Gemini (multimodal)
 * 2. Research each extracted tool/repo
 * 3. Generate verdict for each item
 * 4. Save results
 */
export async function analyzeFullPipeline(videoPath, sourceUrl = '', progressCallback = null) {
  const analyses = loadAnalyses();
  const id = `analysis_${Date.now()}`;
  const videoFilename = path.basename(videoPath);

  // Create initial record
  const record = {
    id,
    videoFilename,
    sourceUrl,
    status: 'analyzing_video',
    createdAt: new Date().toISOString(),
    videoAnalysis: null,
    toolResearch: [],
    summary: null,
    error: null,
  };
  analyses.push(record);
  saveAnalyses(analyses);

  try {
    // Step 1: Analyze video content
    if (progressCallback) progressCallback({ step: 'video_analysis', status: 'running' });
    console.log(`🎬 [${id}] Analyzing video: ${videoFilename}...`);
    
    const videoAnalysis = await analyzeVideo(videoPath);
    record.videoAnalysis = videoAnalysis;
    record.status = 'researching_tools';
    saveAnalyses(analyses);
    
    console.log(`✅ [${id}] Found ${videoAnalysis.items?.length || 0} items in video`);
    if (progressCallback) progressCallback({ 
      step: 'video_analysis', 
      status: 'done', 
      itemCount: videoAnalysis.items?.length || 0 
    });

    // Step 2: Research each tool
    const items = videoAnalysis.items || [];
    console.log(`🔍 [${id}] Researching ${items.length} tools in parallel...`);
    
    const researchPromises = items.map(async (item, i) => {
      if (progressCallback) progressCallback({ 
        step: 'research', 
        current: i + 1, 
        total: items.length, 
        itemName: item.name 
      });
      try {
        const research = await researchTool(item);
        return { ...item, research };
      } catch (err) {
        console.error(`⚠️  Failed to research ${item.name}:`, err.message);
        return {
          ...item,
          research: {
            verdict: 'EVALUATE',
            verdict_reason: `Research failed: ${err.message}`,
            error: true,
          },
        };
      }
    });

    const researched = await Promise.all(researchPromises);

    record.toolResearch = researched;
    record.status = 'generating_summary';
    saveAnalyses(analyses);

    // Step 3: Generate executive summary
    if (researched.length > 0) {
      console.log(`📋 [${id}] Generating executive summary...`);
      if (progressCallback) progressCallback({ step: 'summary', status: 'running' });
      
      const summary = await generateSummary(researched);
      record.summary = summary;
    }

    record.status = 'complete';
    record.completedAt = new Date().toISOString();
    saveAnalyses(analyses);

    console.log(`🎉 [${id}] Analysis complete!`);
    if (progressCallback) progressCallback({ step: 'complete', status: 'done' });

    return record;

  } catch (err) {
    console.error(`❌ [${id}] Pipeline error:`, err.message);
    record.status = 'error';
    record.error = err.message;
    saveAnalyses(analyses);
    throw err;
  }
}

/**
 * Analyze from a URL — register first, then download and run pipeline.
 */
export async function analyzeFromURL(url, progressCallback = null) {
  const analyses = loadAnalyses();
  const id = `analysis_url_${Date.now()}`;
  const filename = `video_${Date.now()}.mp4`;
  const videoPath = path.join(process.cwd(), 'data', 'videos', filename);

  // Crear el registro inmediatamente para que aparezca en la UI
  const record = {
    id,
    videoFilename: filename,
    sourceUrl: url,
    status: 'analyzing_video', // Empezamos con estado de descarga/análisis
    createdAt: new Date().toISOString(),
    videoAnalysis: null,
    toolResearch: [],
    summary: null,
    error: null,
  };
  
  analyses.push(record);
  saveAnalyses(analyses);

  try {
    if (progressCallback) progressCallback({ step: 'download', status: 'running' });
    console.log(`📥 [${id}] Descargando desde URL: ${url}`);
    
    await downloadFromURL(url, filename);
    
    // Una vez descargado, ejecutamos la lógica del pipeline sobre el archivo
    // Pero como ya tenemos el record creado, vamos a llamar a una versión interna
    return runPipelineOnRecord(id, videoPath, url, progressCallback);
  } catch (err) {
    console.error(`❌ [${id}] Error en descarga/pipeline:`, err.message);
    const currentAnalyses = loadAnalyses();
    const r = currentAnalyses.find(a => a.id === id);
    if (r) {
      r.status = 'error';
      r.error = `Error de descarga: ${err.message}`;
      saveAnalyses(currentAnalyses);
    }
    throw err;
  }
}

/**
 * Versión interna que asume que el record ya existe
 */
async function runPipelineOnRecord(id, videoPath, sourceUrl, progressCallback) {
  const analyses = loadAnalyses();
  const record = analyses.find(a => a.id === id);
  if (!record) return;

  try {
    // Paso 1: Análisis de video
    if (progressCallback) progressCallback({ step: 'video_analysis', status: 'running' });
    const videoAnalysis = await analyzeVideo(videoPath);
    
    record.videoAnalysis = videoAnalysis;
    record.status = 'researching_tools';
    saveAnalyses(analyses);

    // ... resto del pipeline ...
    const items = videoAnalysis.items || [];
    const researchPromises = items.map(async (item, i) => {
      try {
        const research = await researchTool(item);
        return { ...item, research };
      } catch (err) {
        return { ...item, research: { verdict: 'EVALUATE', verdict_reason: err.message, error: true } };
      }
    });

    const researched = await Promise.all(researchPromises);
    record.toolResearch = researched;
    record.status = 'generating_summary';
    saveAnalyses(analyses);

    if (researched.length > 0) {
      const summary = await generateSummary(researched);
      record.summary = summary;
    }

    record.status = 'complete';
    record.completedAt = new Date().toISOString();
    saveAnalyses(analyses);
  } catch (err) {
    record.status = 'error';
    record.error = err.message;
    saveAnalyses(analyses);
  }
}

/**
 * Get a specific analysis by ID
 */
export function getAnalysis(id) {
  const analyses = loadAnalyses();
  return analyses.find(a => a.id === id) || null;
}

/**
 * Delete an analysis
 */
export function deleteAnalysis(id) {
  let analyses = loadAnalyses();
  analyses = analyses.filter(a => a.id !== id);
  saveAnalyses(analyses);
}

/**
 * Get statistics
 */
export function getStats() {
  const analyses = loadAnalyses();
  const allItems = analyses.flatMap(a => a.toolResearch || []);
  
  return {
    totalAnalyses: analyses.length,
    totalItemsFound: allItems.length,
    installRecommended: allItems.filter(i => i.research?.verdict === 'INSTALL').length,
    evaluateRecommended: allItems.filter(i => i.research?.verdict === 'EVALUATE').length,
    skipRecommended: allItems.filter(i => i.research?.verdict === 'SKIP').length,
    lastAnalysis: analyses.length > 0 ? analyses[analyses.length - 1].createdAt : null,
  };
}
