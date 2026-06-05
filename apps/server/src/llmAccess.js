import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const defaultConfig = {
  provider: process.env.BOUNDARYML_LLM_PROVIDER || process.env.LLM_PROVIDER || 'mock',
  api_base_url: process.env.BOUNDARYML_LLM_BASE_URL || process.env.LLM_API_BASE_URL || 'https://api.openai.com/v1',
  api_key: process.env.BOUNDARYML_LLM_API_KEY || process.env.LLM_API_KEY || '',
  default_model: process.env.BOUNDARYML_LLM_DEFAULT_MODEL || process.env.LLM_MODEL || 'mock-planning-model',
  planning_model: process.env.BOUNDARYML_LLM_PLANNING_MODEL || process.env.BOUNDARYML_LLM_DEFAULT_MODEL || process.env.LLM_MODEL || 'mock-planning-model',
  prompt_model: process.env.BOUNDARYML_LLM_PROMPT_MODEL || process.env.BOUNDARYML_LLM_DEFAULT_MODEL || process.env.LLM_MODEL || 'mock-prompt-model',
  diff_model: process.env.BOUNDARYML_LLM_DIFF_MODEL || process.env.BOUNDARYML_LLM_DEFAULT_MODEL || process.env.LLM_MODEL || 'mock-diff-model',
  timeout_ms: Number(process.env.BOUNDARYML_LLM_TIMEOUT_MS || 60000),
  structured_output_enabled: String(process.env.BOUNDARYML_LLM_ENABLE_STRUCTURED_OUTPUT ?? 'true') !== 'false',
  allow_mock: String(process.env.BOUNDARYML_ALLOW_MOCK_MODEL ?? 'true') !== 'false',
  log_level: process.env.BOUNDARYML_LLM_LOG_LEVEL || 'summary',
};

const configPath = resolve(process.env.BOUNDARYML_MODEL_CONFIG_PATH || process.env.BOUNDARYML_LLM_CONFIG_PATH || `${process.env.BOUNDARYML_DATA_DIR || process.env.STORAGE_DIR || './data'}/model-config.json`);
const editableFields = new Set(['provider', 'api_base_url', 'api_key', 'default_model', 'planning_model', 'prompt_model', 'diff_model', 'timeout_ms', 'structured_output_enabled', 'allow_mock', 'log_level']);
const config = { ...defaultConfig, ...loadPersistedConfig() };

function loadPersistedConfig() {
  if (!existsSync(configPath)) return {};
  try {
    return normalizeConfig(JSON.parse(readFileSync(configPath, 'utf-8')), { keepExistingApiKey: false });
  } catch {
    return {};
  }
}

function persistConfig() {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function normalizeApiKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '');
}

function normalizeConfig(input = {}, { keepExistingApiKey = true } = {}) {
  const source = {
    ...input,
    api_base_url: input.api_base_url ?? input.apiBaseUrl ?? input.base_url ?? input.baseUrl,
    api_key: input.api_key ?? input.apiKey,
    default_model: input.default_model ?? input.defaultModel,
    planning_model: input.planning_model ?? input.planningModel,
    prompt_model: input.prompt_model ?? input.promptModel,
    diff_model: input.diff_model ?? input.diffModel,
    timeout_ms: input.timeout_ms ?? input.timeoutMs,
    structured_output_enabled: input.structured_output_enabled ?? input.structuredOutputEnabled,
    allow_mock: input.allow_mock ?? input.allowMock,
    log_level: input.log_level ?? input.logLevel,
  };
  const next = {};
  for (const [key, value] of Object.entries(source)) {
    if (!editableFields.has(key)) continue;
    if (value === undefined) continue;
    if (key === 'api_key') {
      const apiKey = normalizeApiKey(value);
      if (apiKey === '' && keepExistingApiKey) continue;
      next[key] = apiKey;
      continue;
    }
    if (key === 'timeout_ms') next[key] = Math.max(1000, Number(value || 60000));
    else if (key === 'structured_output_enabled' || key === 'allow_mock') next[key] = value === true || value === 'true' || value === 'on';
    else next[key] = String(value ?? '').trim();
  }
  if (next.api_key === '__CLEAR__') next.api_key = '';
  return next;
}

function publicConfig() {
  const apiKey = String(config.api_key || '').trim();
  return {
    ...config,
    api_key: '',
    api_key_configured: Boolean(apiKey),
    api_key_masked: apiKey ? `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}` : '',
    config_path: configPath,
  };
}

export function getModelConfig() {
  return publicConfig();
}

export function updateModelConfig(input = {}) {
  Object.assign(config, normalizeConfig(input, { keepExistingApiKey: !input.clear_api_key }));
  if (input.clear_api_key) config.api_key = '';
  persistConfig();
  return getModelStatus();
}

function hasApiKey() {
  return Boolean(String(config.api_key || '').trim());
}

function validateModelConfigForRequest() {
  const apiKey = String(config.api_key || '').trim();
  if (!apiKey) return;
  if (/[^\x20-\x7E]/.test(apiKey)) throw new Error('MODEL_API_KEY_INVALID_CHARACTERS: API key must use ASCII characters only. Keys such as sk-... are supported; check for pasted labels, full-width characters, or hidden text.');
  if (!/^https?:\/\//i.test(String(config.api_base_url || ''))) throw new Error('MODEL_BASE_URL_INVALID: Base URL must start with http:// or https://');
}

function modelForTask(task) {
  if (task.includes('diff')) return config.diff_model;
  if (task.includes('prompt')) return config.prompt_model;
  return config.planning_model || config.default_model;
}

export function getModelStatus() {
  const usingMock = !hasApiKey();
  return {
    mode: usingMock ? 'mock' : 'real',
    provider: usingMock ? 'mock' : config.provider,
    configured: hasApiKey(),
    using_mock: usingMock,
    default_model: config.default_model,
    planning_model: config.planning_model,
    prompt_model: config.prompt_model,
    diff_model: config.diff_model,
    structured_output_enabled: config.structured_output_enabled,
    log_level: config.log_level,
    timeout_ms: config.timeout_ms,
    allow_mock: config.allow_mock,
    config: publicConfig(),
  };
}

function parseStructuredContent(content) {
  if (!content) return null;
  try { return JSON.parse(content); } catch {}
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  return null;
}

export async function runModel(task, payload) {
  if (!hasApiKey()) {
    if (!config.allow_mock) throw new Error('MODEL_API_KEY_NOT_CONFIGURED: Save an API key in Settings / Model Access before testing a real model, or enable Mock fallback.');
    return {
      task,
      provider: 'mock',
      model: modelForTask(task),
      status: 'mock',
      output: { mode: 'mock', summary: `mock-output-for-${task}` },
    };
  }

  validateModelConfigForRequest();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms);
  try {
    const response = await fetch(`${config.api_base_url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.api_key}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: modelForTask(task),
        messages: [
          { role: 'system', content: 'You are BoundaryML Model Access Layer. Return strict JSON only.' },
          { role: 'user', content: JSON.stringify({ task, payload }) },
        ],
        temperature: 0.2,
        ...(config.structured_output_enabled ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const rawBody = await response.text();
    let body = null;
    try { body = rawBody ? JSON.parse(rawBody) : null; } catch {}
    if (!response.ok) throw new Error(body?.error?.message || rawBody.slice(0, 240) || `MODEL_HTTP_${response.status}`);
    if (!body) throw new Error('MODEL_INVALID_JSON_RESPONSE');
    const content = body?.choices?.[0]?.message?.content || '';
    return {
      task,
      provider: config.provider,
      model: modelForTask(task),
      status: 'succeeded',
      output: parseStructuredContent(content) || { raw: content, summary: 'model returned unstructured content' },
      usage: body.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
