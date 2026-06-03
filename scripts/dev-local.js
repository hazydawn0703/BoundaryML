import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm' : 'npm';
const rootDir = fileURLToPath(new URL('..', import.meta.url));
const serverBaseUrl = process.env.BOUNDARYML_API_BASE_URL || `http://localhost:${process.env.BOUNDARYML_SERVER_PORT || 8787}`;

const processes = [
  { name: 'server', color: '\x1b[36m', args: ['run', 'dev:server'], healthUrl: `${serverBaseUrl}/api/health` },
  { name: 'studio', color: '\x1b[35m', args: ['run', 'dev:studio'] },
];

let shuttingDown = false;
const children = [];

function prefixLines(prefix, color, chunk) {
  const text = chunk.toString();
  text.split(/\r?\n/).forEach((line) => {
    if (!line) return;
    process.stdout.write(`${color}[${prefix}]\x1b[0m ${line}\n`);
  });
}

function stopAll(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((child) => {
    if (child.killed) return;
    if (isWindows) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      return;
    }
    child.kill(signal);
  });
}

async function isHealthy(url) {
  if (!url) return false;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data.status === 'ok' || data.data?.status === 'ok';
  } catch {
    return false;
  }
}

for (const proc of processes) {
  if (await isHealthy(proc.healthUrl)) {
    process.stdout.write(`${proc.color}[${proc.name}]\x1b[0m Reusing existing BoundaryML Server at ${serverBaseUrl}\n`);
    continue;
  }

  const child = spawn(npmCommand, proc.args, {
    cwd: rootDir,
    env: process.env,
    shell: isWindows,
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  });

  children.push(child);
  child.stdout.on('data', (chunk) => prefixLines(proc.name, proc.color, chunk));
  child.stderr.on('data', (chunk) => prefixLines(proc.name, proc.color, chunk));
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    process.stderr.write(`[dev] ${proc.name} stopped with ${reason}; stopping local dev.\n`);
    stopAll();
    process.exitCode = code || 1;
  });
}

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
