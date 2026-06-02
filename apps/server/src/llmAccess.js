const config = {
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

function modelForTask(task) {
  if (task.includes('diff')) return config.diff_model;
  if (task.includes('prompt')) return config.prompt_model;
  return config.planning_model || config.default_model;
}

export function getModelStatus() {
  const usingMock = !config.api_key;
  return {
    mode: usingMock ? 'mock' : 'real',
    provider: usingMock ? 'mock' : config.provider,
    configured: Boolean(config.api_key),
    using_mock: usingMock,
    default_model: config.default_model,
    planning_model: config.planning_model,
    prompt_model: config.prompt_model,
    diff_model: config.diff_model,
    structured_output_enabled: config.structured_output_enabled,
    log_level: config.log_level,
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
  if (!config.api_key) {
    if (!config.allow_mock) throw new Error('MODEL_NOT_CONFIGURED');
    return {
      task,
      provider: 'mock',
      model: modelForTask(task),
      status: 'mock',
      output: { mode: 'mock', summary: `mock-output-for-${task}` },
    };
  }

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
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message || `MODEL_HTTP_${response.status}`);
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
