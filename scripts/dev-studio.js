import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.BOUNDARYML_STUDIO_PORT || process.env.PORT || 5173);
const apiBaseUrl = process.env.BOUNDARYML_API_BASE_URL || 'http://localhost:8787';
const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function serveFile(res, requestPath) {
  const cleanPath = requestPath === '/' ? '/apps/studio/index.html' : decodeURIComponent(requestPath.split('?')[0]);
  const filePath = normalize(join(rootDir, cleanPath));
  if (!filePath.startsWith(rootDir)) return send(res, 403, 'Forbidden');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return send(res, 404, 'File not found');
  const type = contentTypes[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  createReadStream(filePath).pipe(res);
}

function proxyApi(req, res) {
  const target = new URL(req.url, apiBaseUrl);
  const proxyReq = httpRequest(target, {
    method: req.method,
    headers: { ...req.headers, host: target.host },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => send(res, 502, JSON.stringify({ ok: false, error: { code: 'SERVER_UNAVAILABLE', message: `Cannot reach ${apiBaseUrl}` } }), { 'content-type': 'application/json' }));
  req.pipe(proxyReq);
}

createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) return proxyApi(req, res);
  return serveFile(res, req.url || '/');
}).listen(port, () => {
  console.log(`BoundaryML Studio: http://localhost:${port}/apps/studio/index.html`);
  console.log(`API proxy: /api -> ${apiBaseUrl}/api`);
});
