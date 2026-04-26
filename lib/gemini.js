import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';
import path from 'path';

import { CONFIG } from './config.js';

let genAI = null;
let model = null;
let fileManager = null;

export function initGemini(apiKey) {
  const key = apiKey || process.env.GEMINI_API_KEY || CONFIG.GEMINI_API_KEY;
  genAI = new GoogleGenerativeAI(key);
  fileManager = new GoogleAIFileManager(key);
  // Usamos Pro para aprovechar tus créditos de Google Cloud
  model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
}

/**
 * Analyze a video file using Gemini's multimodal capabilities.
 * Extracts all AI tools, repos, skills, and commands mentioned.
 */
export async function analyzeVideo(videoPath) {
  if (!model || !fileManager) throw new Error('Gemini not initialized. Call initGemini() first.');

  const ext = path.extname(videoPath).toLowerCase();
  
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
  };
  const mimeType = mimeTypes[ext] || 'video/mp4';

  console.log(`Subiendo video a Gemini File API (${mimeType})...`);
  const uploadResult = await fileManager.uploadFile(videoPath, {
    mimeType: mimeType,
  });

  let file = await fileManager.getFile(uploadResult.file.name);
  while (file.state === "PROCESSING") {
    console.log("Procesando video en Gemini, esperando 3s...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    file = await fileManager.getFile(uploadResult.file.name);
  }

  if (file.state === "FAILED") {
    throw new Error("El procesamiento de video falló en Gemini.");
  }

  const prompt = `You are an expert AI/Developer tools analyst. Analyze this video carefully.

This video is likely about AI tools, Claude Code tricks, GitHub repos, developer skills, CLI tools, or tech updates.

Extract ALL actionable items mentioned. For EACH tool/repo/skill/update, provide:
1. name — exact name of the tool, repo, or skill
2. category — one of: "cli_tool", "repo", "skill", "extension", "api", "framework", "config", "update", "other"
3. description — what it does (2-3 sentences max)
4. install_command — the exact install/setup command if mentioned (or best guess)
5. url — the URL if mentioned (GitHub, npm, etc.) or your best guess
6. mentioned_at — approximate timestamp in the video (e.g., "0:15")
7. complexity — "easy", "medium", or "hard" to set up
8. creator_opinion — what the video creator thinks about it (positive/neutral/negative)

Also provide:
- video_summary: A concise 2-3 sentence summary of the entire video
- video_topic: The main topic category
- creator_name: If the creator identifies themselves
- language: The language spoken in the video

IMPORTANT: Return ONLY valid JSON with this exact structure:
{
  "video_summary": "...",
  "video_topic": "...",
  "creator_name": "...",
  "language": "...",
  "items": [
    {
      "name": "...",
      "category": "...",
      "description": "...",
      "install_command": "...",
      "url": "...",
      "mentioned_at": "...",
      "complexity": "...",
      "creator_opinion": "..."
    }
  ]
}`;

  console.log("Video listo, generando análisis...");
  const result = await model.generateContent([
    { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
    { text: prompt }
  ]);

  const responseText = result.response.text();
  
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
  const cleanJson = jsonMatch[1].trim();
  
  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error('Failed to parse Gemini response as JSON:', e.message);
    console.error('Raw response:', responseText);
    return {
      video_summary: 'Error parsing video analysis',
      video_topic: 'unknown',
      creator_name: 'unknown',
      language: 'unknown',
      items: [],
      raw_response: responseText
    };
  }
}

/**
 * Deep research a specific tool/repo to determine if it's worth installing.
 * Uses Gemini to search its training data for info about the tool.
 */
export async function researchTool(item) {
  if (!model) throw new Error('Gemini not initialized.');

  const prompt = `You are a senior developer advisor. A user found this tool mentioned in a video and wants to know if they should install it.

Tool: ${item.name}
Category: ${item.category}
Description: ${item.description}
Install command: ${item.install_command || 'unknown'}
URL: ${item.url || 'unknown'}

Perform a thorough evaluation:

1. **Community & Maintenance**: Is it actively maintained? Approximate GitHub stars?
2. **Pros & Cons**: Provide 3 clear advantages and 2-3 disadvantages.
3. **Use Cases**: What specific types of projects is it best for?
4. **Security & Risks**: Any malware risks, data privacy concerns, or stability issues?
5. **Alternatives**: Are there better tools for this?
6. **Verdict**: Should they install it?

Return ONLY valid JSON (in Spanish):
{
  "name": "${item.name}",
  "is_legitimate": true,
  "github_stars_estimate": "...",
  "pros": ["...", "..."],
  "cons": ["...", "..."],
  "ideal_projects": ["...", "..."],
  "security_concerns": "none" | "low" | "medium" | "high",
  "risk_notes": "...",
  "maintenance_status": "activa" | "obsoleta" | "desconocida",
  "usefulness_score": 1-10,
  "usefulness_notes": "...",
  "alternatives": ["..."],
  "install_command_verified": "...",
  "verdict": "INSTALL" | "EVALUATE" | "SKIP",
  "verdict_reason": "..."
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
  const cleanJson = jsonMatch[1].trim();

  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    console.error('Failed to parse research response:', e.message);
    return {
      name: item.name,
      verdict: 'EVALUATE',
      verdict_reason: 'Could not complete automated research. Manual review recommended.',
      raw_response: responseText
    };
  }
}

/**
 * Generate a final executive summary of all analyzed items.
 */
export async function generateSummary(analysisResults) {
  if (!model) throw new Error('Gemini not initialized.');

  const prompt = `You are an AI advisor for a developer. Here are the tools and repos found in recently saved Instagram videos.
  
Analysis results:
${JSON.stringify(analysisResults, null, 2)}

Create a brief, actionable executive summary in SPANISH:
1. What to install RIGHT NOW (top priority, safe, useful)
2. What to EVALUATE later (interesting but needs more research or setup time)
3. What to SKIP (not worth it, risky, or superseded)

Also include:
- Any patterns you notice (trending topics, common themes)
- A "quick wins" section: things that take <5 min to set up and give immediate value

Return ONLY valid JSON:
{
  "install_now": [{"name": "...", "why": "...", "command": "..."}],
  "evaluate_later": [{"name": "...", "why": "..."}],
  "skip": [{"name": "...", "why": "..."}],
  "trends": "...",
  "quick_wins": [{"name": "...", "time": "...", "command": "..."}],
  "overall_note": "..."
}`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText];
  const cleanJson = jsonMatch[1].trim();

  try {
    return JSON.parse(cleanJson);
  } catch (e) {
    return { overall_note: responseText };
  }
}
