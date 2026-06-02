import assert from 'node:assert/strict';
import { apiClient } from '../apps/studio/src/api-client/index.js';

async function run() {
  global.window = { BOUNDARYML_API_BASE_URL: '/window-api' };
  assert.equal(apiClient.resolveBaseUrl(), '/window-api');

  let lastUrl = '';
  global.fetch = async (url) => {
    lastUrl = url;
    return {
      ok: true,
      status: 200,
      async json() { return { ok: true, data: { hello: 'world' }, meta: { requestId: 'req_1', generatedAt: '2026-01-01T00:00:00Z' } }; },
    };
  };
  const success = await apiClient.request('/health');
  assert.equal(lastUrl, '/window-api/health');
  assert.equal(success.data.hello, 'world');
  assert.equal(success.meta.requestId, 'req_1');

  global.fetch = async () => ({ ok: false, status: 400, async json() { return { ok: false, error: { code: 'BAD', message: 'bad req' }, meta: { requestId: 'req_bad' } }; } });
  await assert.rejects(() => apiClient.request('/x'), (err) => err.code === 'BAD' && err.requestId === 'req_bad');

  global.fetch = async () => ({ ok: true, status: 200, async json() { return { data: {} }; } });
  await assert.rejects(() => apiClient.request('/y'), (err) => err.code === 'HTTP_ERROR');

  global.fetch = async () => { throw new Error('network down'); };
  await assert.rejects(() => apiClient.request('/z'), (err) => err.code === 'SERVER_UNAVAILABLE');

  global.fetch = async () => ({ ok: true, status: 200, async json() { throw new Error('invalid json'); } });
  await assert.rejects(() => apiClient.request('/j'), (err) => err.code === 'INVALID_ENVELOPE');

  console.log('✅ studio api client checks passed');
}

run();
