import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import os from 'os';

const execAsync = promisify(exec);

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'videos');
const YT_DLP = path.join(os.homedir(), 'Library', 'Python', '3.9', 'bin', 'yt-dlp');

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function isInstagramURL(url) {
  return url.includes('instagram.com');
}

// Extracts the shortcode from an Instagram URL.
// e.g. https://www.instagram.com/reel/DESoQn4RgAl/ → DESoQn4RgAl
function extractInstagramCode(url) {
  const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// Calls Instagram Social API on RapidAPI to get the direct MP4 URL.
// API: instagram-social.p.rapidapi.com
// Endpoint: GET /api/v1/instagram/info?code=<shortcode>
// Response: body.media_url (video URL for media_type=2 reels)
// Requires RAPIDAPI_KEY in .env
async function fetchInstagramVideoURL(url) {
  return new Promise((resolve, reject) => {
    if (!process.env.RAPIDAPI_KEY) {
      return reject(new Error('RAPIDAPI_KEY no está configurado en .env'));
    }

    const code = extractInstagramCode(url);
    if (!code) {
      return reject(new Error('No se pudo extraer el código del Reel desde la URL proporcionada.'));
    }

    // Usaremos un host más genérico y robusto de RapidAPI para descarga
    const RAPIDAPI_HOST = 'social-media-video-downloader.p.rapidapi.com';

    const options = {
      method: 'GET',
      hostname: RAPIDAPI_HOST,
      path: `/smvd/get/instagram?url=${encodeURIComponent(url)}`,
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      },
    };

    console.log(`📡 Consultando RapidAPI (${RAPIDAPI_HOST}) para: ${url}`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          // Estructura común en APIs de descarga de RapidAPI
          const videoUrl = json.data?.video_url || json.url || (json.links && json.links[0]?.link);

          if (videoUrl) {
            resolve(videoUrl);
          } else {
            console.error('Respuesta inesperada de RapidAPI:', data);
            reject(new Error('La API no devolvió un enlace de descarga directo. Asegúrate de estar suscrito a la API en RapidAPI.'));
          }
        } catch (e) {
          reject(new Error('Error al procesar la respuesta de RapidAPI: ' + e.message));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Downloads a file from a direct URL to outputPath, following up to one redirect.
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

export async function downloadFromURL(url, filename) {
  const outputPath = path.join(DOWNLOAD_DIR, filename);

  if (isInstagramURL(url)) {
    console.log(`📱 URL de Instagram detectada. Usando RapidAPI...`);
    try {
      const videoUrl = await fetchInstagramVideoURL(url);
      console.log(`🔗 URL directa obtenida. Descargando MP4...`);
      await downloadFile(videoUrl, outputPath);
      console.log(`✅ Descarga completada: ${outputPath}`);
      return outputPath;
    } catch (e) {
      console.error('❌ Error con Instagram API:', e.message);
      throw new Error(
        `No se pudo descargar el Reel de Instagram: ${e.message}. ` +
        `Prueba a descargarlo manualmente desde tu móvil y súbelo directamente.`
      );
    }
  }

  // Non-Instagram URLs: use yt-dlp (YouTube, TikTok, etc.)
  try {
    const ytdlp = fs.existsSync(YT_DLP) ? YT_DLP : 'yt-dlp';
    console.log(`📥 Downloading with yt-dlp from: ${url}`);
    const cmd = `"${ytdlp}" -o "${outputPath}" -f "bestvideo[ext=mp4][filesize<200M]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --no-playlist "${url}"`;
    await execAsync(cmd, { timeout: 180000 });
    console.log('✅ Download complete:', outputPath);
    const actualFile = findDownloadedFile(outputPath);
    return actualFile || outputPath;
  } catch (e) {
    console.log('⚠️  yt-dlp failed:', e.message);
    throw new Error('No se pudo descargar el vídeo. Puede que sea privado, no exista, o la plataforma lo bloquee. Intenta descargar el vídeo a tu móvil/PC y súbelo manualmente.');
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
