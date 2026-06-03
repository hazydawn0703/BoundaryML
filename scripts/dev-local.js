import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const processes = [
  { name: 'server', color: '\x1b[36m', args: ['run', 'dev:server'] },
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
    if (!child.killed) child.kill(signal);
  });
}

for (const proc of processes) {
  const child = spawn(npmCommand, proc.args, {
    cwd: new URL('..', import.meta.url),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
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
