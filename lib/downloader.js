import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const execAsync = promisify(exec);

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'videos');
const YT_DLP = '/usr/local/bin/yt-dlp';

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

function isInstagramURL(url) {
  return url.includes('instagram.com');
}

function isTikTokURL(url) {
  return url.includes('tiktok.com');
}

function isYouTubeURL(url) {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

function extractInstagramCode(url) {
  const match = url.match(/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function downloadFile(fileUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(outputPath);

    const request = protocol.get(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(outputPath, () => {});
        return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(outputPath, () => {});
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(outputPath)));
    });

    request.on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });

    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Timeout de descarga'));
    });
  });
}

function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (postData) req.write(postData);
    req.end();
  });
}

// ═══════════════════════════════════════════════
// INSTAGRAM DOWNLOAD STRATEGIES
// ═══════════════════════════════════════════════

async function tryRapidAPI1(url, apiKey) {
  const options = {
    method: 'GET',
    hostname: 'social-media-video-downloader.p.rapidapi.com',
    path: `/smvd/get/instagram?url=${encodeURIComponent(url)}`,
    headers: {
      'x-rapidapi-host': 'social-media-video-downloader.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
  };

  const { data } = await httpsRequest(options);
  const videoUrl = data?.data?.video_url || data?.url || data?.links?.[0]?.link;
  if (videoUrl) return videoUrl;
  throw new Error(data?.message || 'No video URL');
}

async function tryRapidAPI2(url, apiKey) {
  const options = {
    method: 'GET',
    hostname: 'instagram-scraper-api2.p.rapidapi.com',
    path: `/v1/post_info?code_or_id_or_url=${encodeURIComponent(url)}`,
    headers: {
      'x-rapidapi-host': 'instagram-scraper-api2.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
  };

  const { data } = await httpsRequest(options);
  const videoUrl = data?.data?.video_url || data?.video_versions?.[0]?.url;
  if (videoUrl) return videoUrl;
  throw new Error('No video URL from API2');
}

async function tryRapidAPI3(url, apiKey) {
  const code = extractInstagramCode(url);
  if (!code) throw new Error('Invalid Instagram URL');

  const options = {
    method: 'GET',
    hostname: 'instagram-looter2.p.rapidapi.com',
    path: `/post?link=${encodeURIComponent(url)}`,
    headers: {
      'x-rapidapi-host': 'instagram-looter2.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
  };

  const { data } = await httpsRequest(options);
  const videoUrl = data?.video_url || data?.media?.[0]?.url;
  if (videoUrl) return videoUrl;
  throw new Error('No video URL from API3');
}

async function tryReelsDownloaderAPI(url) {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) throw new Error('RAPIDAPI_KEY not set');

  const options = {
    method: 'GET',
    hostname: 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com',
    path: `/unified/url?url=${encodeURIComponent(url)}`,
    headers: {
      'x-rapidapi-host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
  };

  const { data } = await httpsRequest(options);

  if (data?.success && data?.data?.content?.media_url) {
    return data.data.content.media_url;
  }
  throw new Error(data?.message || 'No video URL from Reels Downloader API');
}

async function fetchInstagramVideoURL(url) {
  const errors = [];

  // Strategy 1: Reels Downloader API (7sCORP) - Most reliable
  try {
    console.log('  → Intentando Reels Downloader API...');
    return await tryReelsDownloaderAPI(url);
  } catch (e) {
    errors.push(`ReelsDownloader: ${e.message}`);
  }

  throw new Error(`Instagram: API falló (${errors.join(', ')}). Intenta subir el video directamente.`);
}

// ═══════════════════════════════════════════════
// MAIN DOWNLOAD FUNCTION
// ═══════════════════════════════════════════════

export async function downloadFromURL(url, filename) {
  const outputPath = path.join(DOWNLOAD_DIR, filename);
  const ytdlp = fs.existsSync(YT_DLP) ? YT_DLP : 'yt-dlp';
  const ytdlpAvailable = await checkYtdlp(ytdlp);

  // ─── Instagram ───
  if (isInstagramURL(url)) {
    console.log(`📱 Descargando desde Instagram...`);

    // yt-dlp es el método más confiable para Instagram
    if (ytdlpAvailable) {
      try {
        console.log(`  → Descargando con yt-dlp...`);
        const cmd = `"${ytdlp}" -o "${outputPath}" -f "mp4" --no-playlist --no-warnings --no-check-certificates "${url}"`;
        await execAsync(cmd, { timeout: 120000 });
        if (fs.existsSync(outputPath)) {
          console.log(`  ✓ Descargado con yt-dlp`);
          return outputPath;
        }
      } catch (e) {
        console.warn(`  ⚠️ yt-dlp falló: ${e.message}`);
      }
    }

    // Fallback a APIs (por si yt-dlp no está disponible)
    try {
      const videoUrl = await fetchInstagramVideoURL(url);
      console.log(`  ✓ URL obtenida via API, descargando MP4...`);
      await downloadFile(videoUrl, outputPath);
      console.log(`  ✓ Descarga completada: ${filename}`);
      return outputPath;
    } catch (apiError) {
      console.warn(`  ⚠️ APIs fallaron: ${apiError.message}`);
    }

    throw new Error('No se pudo descargar el Reel de Instagram. Intenta subir el video directamente.');
  }

  // ─── TikTok ───
  if (isTikTokURL(url)) {
    console.log(`🎵 Descargando desde TikTok...`);

    if (ytdlpAvailable) {
      try {
        const cmd = `"${ytdlp}" -o "${outputPath}" -f "mp4" --no-playlist --no-warnings "${url}"`;
        await execAsync(cmd, { timeout: 90000 });
        if (fs.existsSync(outputPath)) return outputPath;
      } catch (e) {
        console.warn(`  ⚠️ yt-dlp falló para TikTok: ${e.message}`);
      }
    }

    throw new Error('No se pudo descargar el video de TikTok. Intenta subir el video directamente.');
  }

  // ─── YouTube ───
  if (isYouTubeURL(url)) {
    console.log(`🎬 Descargando desde YouTube...`);

    if (!ytdlpAvailable) {
      throw new Error('yt-dlp no está disponible para descargar de YouTube.');
    }

    try {
      const cmd = `"${ytdlp}" -o "${outputPath}" -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-playlist --no-warnings "${url}"`;
      await execAsync(cmd, { timeout: 300000 }); // 5 min para YouTube

      // yt-dlp puede agregar extensión diferente
      const downloaded = findDownloadedFile(outputPath);
      if (downloaded) return downloaded;
      if (fs.existsSync(outputPath)) return outputPath;

      throw new Error('Archivo no encontrado después de la descarga');
    } catch (e) {
      throw new Error(`Error descargando YouTube: ${e.message}`);
    }
  }

  // ─── Direct MP4 URL ───
  if (url.match(/\.(mp4|webm|mov)(\?|$)/i)) {
    console.log(`📥 Descargando video directo...`);
    try {
      await downloadFile(url, outputPath);
      return outputPath;
    } catch (e) {
      throw new Error(`Error descargando archivo: ${e.message}`);
    }
  }

  // ─── Unknown - try yt-dlp ───
  if (ytdlpAvailable) {
    console.log(`🔗 Intentando descarga genérica con yt-dlp...`);
    try {
      const cmd = `"${ytdlp}" -o "${outputPath}" -f "best[ext=mp4]/best" --no-playlist --no-warnings "${url}"`;
      await execAsync(cmd, { timeout: 120000 });
      if (fs.existsSync(outputPath)) return outputPath;
    } catch (e) {
      throw new Error(`No se pudo descargar: ${e.message}`);
    }
  }

  throw new Error('URL no soportada. Intenta subir el video directamente.');
}

async function checkYtdlp(ytdlp) {
  try {
    await execAsync(`"${ytdlp}" --version`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function findDownloadedFile(basePath) {
  const dir = path.dirname(basePath);
  const name = path.basename(basePath, path.extname(basePath));

  if (!fs.existsSync(dir)) return null;

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
