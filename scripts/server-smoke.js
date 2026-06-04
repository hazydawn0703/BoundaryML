import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import http from 'node:http';

function assert(condition, message) { if (!condition) throw new Error(message); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function request(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode || 0, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function waitForServer(baseUrl, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await request(baseUrl, '/api/health');
      if (res.status === 200) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Server did not become healthy in time');
}

async function apiFetch(baseUrl, path, options = {}) {
  const { status, body } = await request(baseUrl, path, options);
  assert(body && typeof body === 'object', `Response must be JSON object: ${path}`);
  assert('ok' in body, `Envelope must contain ok: ${path}`);
  assert(body.meta && body.meta.requestId, `Envelope must contain meta.requestId: ${path}`);
  if (body.ok) assert('data' in body, `Success envelope must contain data: ${path}`);
  else assert(body.error && body.error.code, `Failure envelope must contain error.code: ${path}`);
  return { status, body };
}

async function main() {
  const port = String(9900 + Math.floor(Math.random() * 80));
  const baseUrl = `http://127.0.0.1:${port}`;
  const tmpDataDir = `.tmp-server-smoke-${Date.now()}`;
  const env = { ...process.env, BOUNDARYML_SERVER_PORT: port, BOUNDARYML_STORAGE_ADAPTER: 'file', BOUNDARYML_DATA_DIR: tmpDataDir };
  let server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
  try {
    await waitForServer(baseUrl);
    const health = await apiFetch(baseUrl, '/api/health'); assert(health.status === 200, 'health should return 200');
    const templates = await apiFetch(baseUrl, '/api/templates'); assert((templates.body.data.templates || []).length >= 3, 'templates should expose public MVP templates');
    const template = await apiFetch(baseUrl, '/api/templates/template-ai-saas-feature-mvp'); assert(template.body.data.id === 'template-ai-saas-feature-mvp', 'template detail should be fetchable');
    const created = await apiFetch(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'smoke-project', goal: 'smoke goal' }) });
    const projectId = created.body.data.id; assert(projectId, 'project id should exist');
    await apiFetch(baseUrl, '/api/projects');
    await apiFetch(baseUrl, `/api/projects/${projectId}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack`, { method: 'PUT', body: JSON.stringify({ team_roles:['PM'], approval_process:['Review'], tool_stack:['GitHub'], risk_constraints:['None'], historical_process_materials:'N/A' }) });
    const workflow = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    assert(Array.isArray(workflow.body.data.nodes), 'workflow should include nodes array');
    const initialNodeName = workflow.body.data.nodes[0].name;
    const firstEditNodes = structuredClone(workflow.body.data.nodes);
    firstEditNodes[0] = { ...firstEditNodes[0], name: 'smoke edit one' };
    const firstEdit = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`, { method: 'PATCH', body: JSON.stringify({ workflow_version: workflow.body.data.version, nodes: firstEditNodes }) });
    const secondEditNodes = structuredClone(firstEdit.body.data.workflow.nodes);
    secondEditNodes[0] = { ...secondEditNodes[0], name: 'smoke edit two' };
    const secondEdit = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`, { method: 'PATCH', body: JSON.stringify({ workflow_version: firstEdit.body.data.workflow.version, nodes: secondEditNodes }) });
    const autoHistory = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/history`);
    assert(autoHistory.body.data.length === 0, 'workflow edits should not automatically create saved history');
    const firstUndo = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/undo`, { method: 'POST' });
    assert(firstUndo.body.data.workflow.nodes[0].name === 'smoke edit one', 'first undo should restore the previous edit');
    const secondUndo = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/undo`, { method: 'POST' });
    assert(secondUndo.body.data.workflow.nodes[0].name === initialNodeName, 'second undo should restore the original workflow, not the prior undo');
    let saveVersion = secondUndo.body.data.workflow.version;
    for (let i = 0; i < 11; i += 1) {
      const saved = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/history`, { method: 'POST', body: JSON.stringify({ workflow_version: saveVersion, summary: `manual save ${i}` }) });
      assert(saved.body.data.history.length <= 10, 'manual saved history should retain at most 10 versions');
    }
    const savedHistory = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/history`);
    assert(savedHistory.body.data.length === 10, 'manual saved history should keep exactly the latest 10 saves after 11 saves');
    assert(savedHistory.body.data[0].summary === 'manual save 1', 'oldest saved history should be trimmed when the 11th save is added');
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/validate`, { method: 'POST' });
    const preview = await apiFetch(baseUrl, `/api/projects/${projectId}/execution-kits/preview`, { method: 'POST', body: JSON.stringify({ kit_type: 'draft' }) });
    assert(preview.body.data.preview?.files?.['workflow_spec.yaml'], 'execution kit preview should include workflow_spec.yaml');
    await apiFetch(baseUrl, `/api/projects/${projectId}/jobs`);
    server.kill('SIGTERM'); await sleep(400);
    server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
    await waitForServer(baseUrl);
    await apiFetch(baseUrl, `/api/projects/${projectId}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    console.log('✅ server smoke passed');
  } finally {
    try { server.kill('SIGTERM'); } catch {}
    await sleep(100);
    rmSync(tmpDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error('❌ server smoke failed:', err.message); process.exit(1); });
