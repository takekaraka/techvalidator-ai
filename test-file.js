import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import fs from 'fs';

const apiKey = 'AIzaSyDIgn8ROdq4gwQxy-bquQ3nBQvi9LAeuis';
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function run() {
  fs.writeFileSync('dummy.txt', 'hello world');
  const uploadResult = await fileManager.uploadFile('dummy.txt', {
    mimeType: 'text/plain',
  });
  console.log("Uploaded:", uploadResult.file.uri);
  
  try {
    const res = await model.generateContent([
      { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
      { text: "What is this file?" }
    ]);
    console.log(res.response.text());
  } catch(e) {
    console.error(e.message);
  }
}
run();
