import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI('AIzaSyDIgn8ROdq4gwQxy-bquQ3nBQvi9LAeuis');
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
async function run() {
  try {
    const res = await model.generateContent("hello");
    console.log(res.response.text());
  } catch(e) {
    console.error(e.message);
  }
}
run();
