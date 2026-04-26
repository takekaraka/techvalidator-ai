import dotenv from 'dotenv';
import { initGemini } from './lib/gemini.js';
import { analyzeFullPipeline } from './lib/analyzer.js';
import path from 'path';
import fs from 'fs';

dotenv.config();

async function test() {
  console.log("Starting test...");
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No API Key");
    return;
  }
  
  initGemini(apiKey);
  
  // Create a dummy video file or use an existing one if possible
  // For now, let's just see if initGemini and the first call to Gemini works.
  try {
    console.log("Testing with a non-existent file to see if it catches the right error...");
    await analyzeFullPipeline('non-existent.mp4');
  } catch (e) {
    console.log("Caught expected error or real error:", e.message);
  }
}

test();
