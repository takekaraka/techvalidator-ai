import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import os from 'os';

import { CONFIG } from './config.js';

const execAsync = promisify(exec);

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'videos');
const YT_DLP = '/usr/local/bin/yt-dlp'; // Ruta en el Docker de Render

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function isInstagramURL(url) {
  return url.includes('instagram.com');
}

function extractInstagramCode(url) {
  const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function downloadFile(fileUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(outputPath);

    protocol.get(fileUrl, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(outputPath, () => {});
        return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(outputPath, () => {});
        return reject(new Error(`Error HTTP ${response.statusCode} al descargar el MP4`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(outputPath)));
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function fetchInstagramVideoURL(url) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.RAPIDAPI_KEY || CONFIG.RAPIDAPI_KEY;
    
    if (!apiKey) {
      return reject(new Error('RAPIDAPI_KEY no está configurado'));
    }

    const code = extractInstagramCode(url);
    if (!code) {
      return reject(new Error('No se pudo extraer el código del Reel'));
    }

    // Host común que suele funcionar bien
    const RAPIDAPI_HOST = 'social-media-video-downloader.p.rapidapi.com';

    const options = {
      method: 'GET',
      hostname: RAPIDAPI_HOST,
      path: `/smvd/get/instagram?url=${encodeURIComponent(url)}`,
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': apiKey,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const videoUrl = json.data?.video_url || json.url || (json.links && json.links[0]?.link);

          if (videoUrl) {
            resolve(videoUrl);
          } else {
            reject(new Error(json.message || 'La API no devolvió un link.'));
          }
        } catch (e) {
          reject(new Error('Error en RapidAPI: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

export async function downloadFromURL(url, filename) {
  const outputPath = path.join(DOWNLOAD_DIR, filename);
  const ytdlp = fs.existsSync(YT_DLP) ? YT_DLP : 'yt-dlp';

  if (isInstagramURL(url)) {
    console.log(`📱 Intentando descarga de Instagram...`);
    try {
      const videoUrl = await fetchInstagramVideoURL(url);
      await downloadFile(videoUrl, outputPath);
      return outputPath;
    } catch (e) {
      console.warn(`⚠️ RapidAPI falló (${e.message}). Intentando con yt-dlp...`);
      // Fallback a yt-dlp
      try {
        const cmd = `"${ytdlp}" -o "${outputPath}" -f "mp4" --no-playlist "${url}"`;
        await execAsync(cmd, { timeout: 60000 });
        return outputPath;
      } catch (e2) {
        throw new Error(`Error fatal: No se pudo bajar el Reel ni por API ni por yt-dlp. Revisa tu suscripción a RapidAPI.`);
      }
    }
  }

  // Otros (YouTube, TikTok...)
  try {
    const cmd = `"${ytdlp}" -o "${outputPath}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-playlist "${url}"`;
    await execAsync(cmd, { timeout: 180000 });
    return outputPath;
  } catch (e) {
    throw new Error('No se pudo descargar el vídeo.');
  }
}

function findDownloadedFile(basePath) {
  const dir = path.dirname(basePath);
  const name = path.basename(basePath, path.extname(basePath));
  const files = fs.readdirSync(dir);
  const match = files.find(f => f.startsWith(name));
  return match ? path.join(dir, match) : null;
}

export function getUploadedVideoPath(file) {
  return file.path;
}

export function listVideos() {
  if (!fs.existsSync(DOWNLOAD_DIR)) return [];
  return fs.readdirSync(DOWNLOAD_DIR)
    .filter(f => /\.(mp4|webm|mov|avi|mkv)$/i.test(f))
    .map(f => ({
      name: f,
      path: path.join(DOWNLOAD_DIR, f),
      size: fs.statSync(path.join(DOWNLOAD_DIR, f)).size,
      created: fs.statSync(path.join(DOWNLOAD_DIR, f)).birthtime,
    }));
}

export function deleteVideo(filename) {
  const filePath = path.join(DOWNLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
