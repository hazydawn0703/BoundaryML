const config = {
  provider: process.env.LLM_PROVIDER || 'mock',
  model: process.env.LLM_MODEL || 'mock-planning-model',
  api_base_url: process.env.LLM_API_BASE_URL || '',
  api_key: process.env.LLM_API_KEY || '',
};

export function getModelStatus() {
  const usingMock = !config.api_key;
  return {
    provider: usingMock ? 'mock' : config.provider,
    model: config.model,
    using_mock: usingMock,
    configured: Boolean(config.api_key),
  };
}

export async function runModel(task, payload) {
  if (!config.api_key) {
    return {
      task,
      payload,
      output: { mode: 'mock', summary: `mock-output-for-${task}` },
    };
  }

  return {
    task,
    payload,
    output: { mode: 'real', summary: 'real-model-call-not-implemented' },
  };
}
