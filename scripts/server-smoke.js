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
    const modelConfigSave = await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ provider: 'openai-compatible', api_base_url: 'https://example.test/v1', api_key: 'sk-smoke-secret', default_model: 'smoke-default', planning_model: 'smoke-planning', prompt_model: 'smoke-prompt', diff_model: 'smoke-diff', timeout_ms: 12345, structured_output_enabled: false, allow_mock: true, log_level: 'debug' }) });
    assert(modelConfigSave.body.data.status.default_model === 'smoke-default', 'saved model config should update runtime status');
    assert(modelConfigSave.body.data.status.mode === 'real', 'saved api key should switch model status out of mock mode');
    const modelConfig = await apiFetch(baseUrl, '/api/model/config');
    assert(modelConfig.body.data.default_model === 'smoke-default', 'model config should be readable');
    assert(modelConfig.body.data.api_key === '', 'model config response should not expose raw api key');
    assert(modelConfig.body.data.api_key_configured === true, 'model config should report configured api key');
    assert(modelConfig.body.data.api_key_masked === 'sk-s****cret', 'model config should expose a safe first4/last4 api key mask');
    const modelTest = await apiFetch(baseUrl, '/api/model/test', { method: 'POST' });
    assert(modelTest.status === 200, 'model test should return an app-level result instead of proxying provider errors as HTTP failure');
    assert(['failed', 'succeeded', 'mock'].includes(modelTest.body.data.status), 'model test should report an explicit status');
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ api_key: 'sk-invalid-配置' }) });
    const invalidKeyTest = await apiFetch(baseUrl, '/api/model/test', { method: 'POST' });
    assert(invalidKeyTest.body.data.status === 'failed', 'invalid api key characters should be reported as a model test failure');
    assert(invalidKeyTest.body.data.error.includes('MODEL_API_KEY_INVALID_CHARACTERS'), 'invalid api key error should be explicit');
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ api_key: 'Bearer sk－full width key' }) });
    const normalizedKeyConfig = await apiFetch(baseUrl, '/api/model/config');
    assert(normalizedKeyConfig.body.data.api_key_masked.startsWith('sk-f'), 'api key normalization should support sk- keys pasted with Bearer or full-width punctuation');
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ api_key: 'sk-smoke-secret' }) });
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ clear_api_key: true, allow_mock: false }) });
    const missingKeyTest = await apiFetch(baseUrl, '/api/model/test', { method: 'POST' });
    assert(missingKeyTest.body.data.error.includes('MODEL_API_KEY_NOT_CONFIGURED'), 'missing real model api key should produce a clear Settings guidance error');
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ api_key: 'sk-smoke-secret', allow_mock: true }) });
    const templates = await apiFetch(baseUrl, '/api/templates'); assert((templates.body.data.templates || []).length >= 3, 'templates should expose public MVP templates');
    const template = await apiFetch(baseUrl, '/api/templates/template-ai-saas-feature-mvp'); assert(template.body.data.id === 'template-ai-saas-feature-mvp', 'template detail should be fetchable');
    const created = await apiFetch(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'smoke-project', goal: 'smoke goal' }) });
    const projectId = created.body.data.id; assert(projectId, 'project id should exist');
    await apiFetch(baseUrl, '/api/projects');
    await apiFetch(baseUrl, `/api/projects/${projectId}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack`, { method: 'PUT', body: JSON.stringify({ team_roles:['PM'], approval_process:['Review'], tool_stack:['GitHub'], risk_constraints:['None'], historical_process_materials:'N/A' }) });
    const workflow = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    assert(Array.isArray(workflow.body.data.nodes), 'workflow should include nodes array');
    assert(workflow.body.data.nodes.length === 0, 'new projects should start from an empty workflow before generation');
    const generated = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/generate`, { method: 'POST' });
    assert(generated.body.data.workflow.nodes.length > 0, 'workflow generation should create project-specific nodes');
    const generatedWorkflow = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    const initialNodeName = generatedWorkflow.body.data.nodes[0].name;
    const firstEditNodes = structuredClone(generatedWorkflow.body.data.nodes);
    firstEditNodes[0] = { ...firstEditNodes[0], name: 'smoke edit one' };
    const firstEdit = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`, { method: 'PATCH', body: JSON.stringify({ workflow_version: generatedWorkflow.body.data.version, nodes: firstEditNodes }) });
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
    const persistedModelConfig = await apiFetch(baseUrl, '/api/model/config');
    assert(persistedModelConfig.body.data.default_model === 'smoke-default', 'model config should persist across server restart');
    await apiFetch(baseUrl, `/api/projects/${projectId}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    console.log('✅ server smoke passed');
  } finally {
    try { server.kill('SIGTERM'); } catch {}
    await sleep(100);
    rmSync(tmpDataDir, { recursive: true, force: true });
  }
}

async function checkDefaultFileStorage() {
  const port = String(9980 + Math.floor(Math.random() * 80));
  const baseUrl = `http://127.0.0.1:${port}`;
  const tmpDataDir = `.tmp-server-default-storage-${Date.now()}`;
  const env = { ...process.env, BOUNDARYML_SERVER_PORT: port, BOUNDARYML_DATA_DIR: tmpDataDir };
  delete env.BOUNDARYML_STORAGE_ADAPTER;
  delete env.STORAGE_MODE;
  let server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
  try {
    await waitForServer(baseUrl);
    const health = await apiFetch(baseUrl, '/api/health');
    assert(health.body.data.storage === 'file', 'server should default to file storage');
    const created = await apiFetch(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'default-file-project', goal: 'persist by default' }) });
    const projectId = created.body.data.id;
    server.kill('SIGTERM'); await sleep(400);
    server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
    await waitForServer(baseUrl);
    const restored = await apiFetch(baseUrl, `/api/projects/${projectId}`);
    assert(restored.body.data.id === projectId, 'default file storage should persist projects across restart');
  } finally {
    try { server.kill('SIGTERM'); } catch {}
    await sleep(100);
    rmSync(tmpDataDir, { recursive: true, force: true });
  }
}

main()
  .then(checkDefaultFileStorage)
  .catch((err) => { console.error('❌ server smoke failed:', err.message); process.exit(1); });
