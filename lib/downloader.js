import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import os from 'os';

const execAsync = promisify(exec);

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'videos');

// yt-dlp path (may not be on default PATH)
const YT_DLP = path.join(os.homedir(), 'Library', 'Python', '3.9', 'bin', 'yt-dlp');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Download video from Instagram/YouTube/TikTok URL using yt-dlp.
 * Falls back to a basic HTTPS download approach.
 */
export async function downloadFromURL(url, filename) {
  const outputPath = path.join(DOWNLOAD_DIR, filename);

  // Try yt-dlp first (supports Instagram, YouTube, TikTok, etc.)
  try {
    const ytdlp = fs.existsSync(YT_DLP) ? YT_DLP : 'yt-dlp';
    console.log(`📥 Downloading with yt-dlp from: ${url}`);
    // Use format that keeps file under 200MB and prefers mp4
    const cmd = `"${ytdlp}" -o "${outputPath}" -f "bestvideo[ext=mp4][filesize<200M]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 --no-playlist "${url}"`;
    const { stdout, stderr } = await execAsync(cmd, { timeout: 180000 });
    console.log('✅ Download complete:', outputPath);
    
    // yt-dlp might add extension, find the actual file
    const actualFile = findDownloadedFile(outputPath);
    return actualFile || outputPath;
  } catch (e) {
    console.log('⚠️  yt-dlp failed:', e.message);
    console.log('Trying direct download...');
  }

  // Fallback: direct HTTP download (works for direct video URLs)
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFromURL(response.headers.location, filename).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        return reject(new Error(`Download failed with status ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('✅ Download complete:', outputPath);
        resolve(outputPath);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

/**
 * Find the actual downloaded file (yt-dlp may change the extension)
 */
function findDownloadedFile(basePath) {
  const dir = path.dirname(basePath);
  const name = path.basename(basePath, path.extname(basePath));
  const files = fs.readdirSync(dir);
  const match = files.find(f => f.startsWith(name));
  return match ? path.join(dir, match) : null;
}

/**
 * Handle uploaded video file from multer
 */
export function getUploadedVideoPath(file) {
  return file.path;
}

/**
 * List all downloaded/uploaded videos
 */
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

/**
 * Delete a video file
 */
export function deleteVideo(filename) {
  const filePath = path.join(DOWNLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
