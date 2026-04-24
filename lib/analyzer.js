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
    const researched = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`🔍 [${id}] Researching ${i + 1}/${items.length}: ${item.name}...`);
      if (progressCallback) progressCallback({ 
        step: 'research', 
        current: i + 1, 
        total: items.length, 
        itemName: item.name 
      });

      try {
        const research = await researchTool(item);
        researched.push({
          ...item,
          research,
        });
      } catch (err) {
        console.error(`⚠️  Failed to research ${item.name}:`, err.message);
        researched.push({
          ...item,
          research: {
            verdict: 'EVALUATE',
            verdict_reason: `Research failed: ${err.message}`,
            error: true,
          },
        });
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 1000));
    }

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
 * Analyze from a URL — download first, then run pipeline.
 */
export async function analyzeFromURL(url, progressCallback = null) {
  const filename = `video_${Date.now()}.mp4`;
  
  if (progressCallback) progressCallback({ step: 'download', status: 'running' });
  console.log(`📥 Downloading from URL: ${url}`);
  
  const videoPath = await downloadFromURL(url, filename);
  return analyzeFullPipeline(videoPath, url, progressCallback);
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
