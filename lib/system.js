// Operaciones de sistema: instalar/desinstalar LaunchAgent en Mac.
// Sólo expuesto detrás de Basic Auth (server.js).

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const run = promisify(exec);

export function systemInfo() {
  return {
    platform: process.platform, // 'darwin' = macOS, 'linux'
    arch: process.arch,
    node: process.version,
    hostname: os.hostname(),
    cwd: process.cwd(),
    home: os.homedir(),
    user: os.userInfo().username,
    uptime_sec: Math.floor(process.uptime()),
  };
}

export async function installLaunchAgent() {
  if (process.platform !== 'darwin') {
    return { ok: false, error: 'LaunchAgent solo en macOS. En Linux usa systemd (scripts/renderz-inbox.service).' };
  }
  const script = path.join(process.cwd(), 'scripts', 'install-launchagent.sh');
  if (!fs.existsSync(script)) return { ok: false, error: 'No encuentro scripts/install-launchagent.sh — hacé git pull.' };
  try {
    const { stdout, stderr } = await run(`bash "${script}"`, { cwd: process.cwd() });
    return { ok: true, stdout, stderr };
  } catch (e) {
    return { ok: false, error: e.message, stderr: e.stderr };
  }
}

export async function uninstallLaunchAgent() {
  if (process.platform !== 'darwin') return { ok: false, error: 'LaunchAgent solo en macOS' };
  const script = path.join(process.cwd(), 'scripts', 'uninstall-launchagent.sh');
  if (!fs.existsSync(script)) return { ok: false, error: 'No encuentro scripts/uninstall-launchagent.sh' };
  try {
    const { stdout, stderr } = await run(`bash "${script}"`, { cwd: process.cwd() });
    return { ok: true, stdout, stderr };
  } catch (e) {
    return { ok: false, error: e.message, stderr: e.stderr };
  }
}

export async function isLaunchAgentInstalled() {
  if (process.platform !== 'darwin') return false;
  try {
    const { stdout } = await run('launchctl list | grep com.renderz.inbox || true');
    return stdout.includes('com.renderz.inbox');
  } catch (_) { return false; }
}
