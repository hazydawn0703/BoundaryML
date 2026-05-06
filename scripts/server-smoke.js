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

async function waitForServer(baseUrl, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await request(baseUrl, '/api/health'); if (res.status === 200) return; } catch {}
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
  const port = String(9950 + Math.floor(Math.random() * 40));
  const baseUrl = `http://127.0.0.1:${port}`;
  const tmpDataDir = `.tmp-server-smoke-${Date.now()}`;
  const env = { ...process.env, BOUNDARYML_SERVER_PORT: port, BOUNDARYML_STORAGE_ADAPTER: 'file', BOUNDARYML_DATA_DIR: tmpDataDir };
  let server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
  try {
    await waitForServer(baseUrl);
    const created = await apiFetch(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'smoke-project', goal: 'smoke goal' }) });
    const projectId = created.body.data.id;

    await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack`, { method: 'PUT', body: JSON.stringify({ team_roles:['PM'], approval_process:['Review'], tool_stack:['GitHub'], risk_constraints:['None'], historical_process_materials:'N/A' }) });

    const idKey = 'smoke-idem-1';
    const summary1 = await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack/summarize`, { method: 'POST', headers: { 'idempotency-key': idKey } });
    const summary2 = await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack/summarize`, { method: 'POST', headers: { 'idempotency-key': idKey } });
    assert(summary1.body.data.job_id === summary2.body.data.job_id, 'idempotency key should reuse summarize job');

    const wfGen = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/generate`, { method: 'POST' });
    const workflow = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    const node = workflow.body.data.nodes.find((n) => n.execution_mode !== 'human_only') || workflow.body.data.nodes[0];
    assert(node?.id, 'node must exist');

    await apiFetch(baseUrl, `/api/projects/${projectId}/nodes/${node.id}`, { method: 'PATCH', body: JSON.stringify({ goal: 'updated by smoke', workflow_version: workflow.body.data.version }) });
    if (node.execution_mode !== 'human_only') await apiFetch(baseUrl, `/api/projects/${projectId}/nodes/${node.id}/generate-prompt`, { method: 'POST' });
    await apiFetch(baseUrl, `/api/projects/${projectId}/nodes/${node.id}/generate-checklist`, { method: 'POST' });

    const diff = await apiFetch(baseUrl, `/api/projects/${projectId}/diffs/generate`, { method: 'POST', body: JSON.stringify({ request: 'add testing nodes before launch' }) });
    const diffId = diff.body.data.diff.id;
    const currentWf = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/diffs/${diffId}/apply`, { method: 'POST', body: JSON.stringify({ workflow_version: currentWf.body.data.version }) });

    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/mark-final`, { method: 'POST', body: JSON.stringify({ workflow_version: (await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`)).body.data.version }) });

    await apiFetch(baseUrl, `/api/projects/${projectId}/execution-kits/preview`, { method: 'POST' });
    await apiFetch(baseUrl, `/api/projects/${projectId}/execution-kits/generate`, { method: 'POST' });
    const projectAfterKit = await apiFetch(baseUrl, `/api/projects/${projectId}`);
    const kitId = (projectAfterKit.body.data.execution_kits || []).at(-1)?.id;
    if (kitId) {
      const kitDownload = await apiFetch(baseUrl, `/api/projects/${projectId}/execution-kits/${kitId}/download`);
      assert('stale' in kitDownload.body.data, 'kit download should return stale marker');
    }

    const jobs = await apiFetch(baseUrl, `/api/projects/${projectId}/jobs`);
    assert(jobs.body.data.length > 0, 'jobs should exist');
    const job = jobs.body.data.find((j) => j.type === 'generate_workflow_draft') || jobs.body.data[0];
    assert(job.input_snapshot && job.output_ref, 'job should include input_snapshot and output_ref');
    await apiFetch(baseUrl, `/api/projects/${projectId}/jobs/${job.id}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/jobs/${job.id}/retry`, { method: 'POST' });
    await apiFetch(baseUrl, `/api/projects/${projectId}/jobs/${job.id}/cancel`, { method: 'POST' });

    const history = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/history`);
    assert(history.body.data.length > 0, 'history should exist');
    const v = history.body.data[0].version;
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/versions/${v}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/undo`, { method: 'POST' });
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/restore`, { method: 'POST', body: JSON.stringify({ version: v }) });
    await apiFetch(baseUrl, `/api/projects/${projectId}/diffs/${diffId}/revert`, { method: 'POST' });

    server.kill('SIGTERM'); await sleep(400);
    server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
    await waitForServer(baseUrl);
    await apiFetch(baseUrl, `/api/projects/${projectId}`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/jobs`);
    await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/history`);

    console.log('✅ server smoke passed');
  } finally {
    try { server.kill('SIGTERM'); } catch {}
    await sleep(100);
    rmSync(tmpDataDir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error('❌ server smoke failed:', err.message); process.exit(1); });
