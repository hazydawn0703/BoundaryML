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

async function startFakeModelServer(port) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}');
        if (/^qwen/i.test(body.model || '') && (body.enable_thinking !== true || body.stream !== true)) {
          throw new Error('DashScope Qwen Agent requests must keep thinking enabled and stream model activity');
        }
        const userMessage = (body.messages || []).find((message) => message.role === 'user');
        const envelope = JSON.parse(userMessage?.content || '{}');
        const task = envelope.task;
        const payload = envelope.payload || {};
        let output = { summary: `fake response for ${task}` };
        if (task === 'project_creation_plan') {
          const revisingRequestSource = /\u9700\u6c42.*(?:\u6765\u81ea|\u6765\u6e90)|\u6295\u653e\u56e2\u961f|\u8fd0\u8425\u56e2\u961f/i.test(payload.request || '');
          output = {
            intent: revisingRequestSource ? 'revise_blueprint' : 'complete_blueprint',
            assistant_reply: revisingRequestSource
              ? '\u662f\u7684\uff0c\u4f5c\u56fe\u9700\u6c42\u5e94\u7531\u6295\u653e\u56e2\u961f\u6216\u8fd0\u8425\u56e2\u961f\u53d1\u8d77\uff0c\u6211\u5df2\u636e\u6b64\u66f4\u65b0\u84dd\u56fe\u3002'
              : 'I prepared a reviewable project blueprint.',
            reasoning_summary: revisingRequestSource
              ? '\u9700\u6c42\u6765\u6e90\u3001\u53d1\u8d77\u56e2\u961f\u4e0e\u4e0a\u4e0b\u6e38\u8d23\u4efb\u8fb9\u754c'
              : 'Project goals, deliverables, AI boundaries, roles, and approvals',
            changed_fields: revisingRequestSource ? ['context_pack.request_sources', 'context_pack.team_roles'] : [],
            project: {
              name: 'Planned AI Project',
              goal: 'Deliver the requested domain workflow',
              project_type: 'Custom AI Workflow',
              current_stage: 'Discovery',
              risk_level: 'medium',
              target_deliverables: ['Domain workflow'],
              expected_ai_scope: ['Analyze project inputs and draft outputs'],
              sensitive_areas: ['Project data'],
              context_pack: {
                request_sources: revisingRequestSource ? ['\u6295\u653e\u56e2\u961f', '\u8fd0\u8425\u56e2\u961f'] : ['Project owner'],
                team_roles: revisingRequestSource ? ['\u6295\u653e\u56e2\u961f', '\u8fd0\u8425\u56e2\u961f', 'Domain reviewer'] : ['Project owner', 'Domain reviewer'],
                approval_process: ['Domain reviewer approval'],
                risk_constraints: ['Do not release unreviewed AI output'],
              },
            },
            confidence: 'high',
            missing_fields: [],
          };
        } else if (task === 'workflow_generate') {
          const project = payload.project || {};
          const domainText = `${project.name || ''} ${project.goal || ''}`;
          const contractDomain = /contract|\u5408\u540c/i.test(domainText);
          const phases = contractDomain
            ? [{ id: 'phase-intake', name: 'Contract Intake', order: 1 }, { id: 'phase-review', name: 'Risk Review', order: 2 }, { id: 'phase-approval', name: 'Legal Approval', order: 3 }]
            : [{ id: 'phase-intake', name: 'Goal Intake', order: 1 }, { id: 'phase-work', name: 'Domain Execution', order: 2 }, { id: 'phase-approval', name: 'Human Approval', order: 3 }];
          const nodes = contractDomain
            ? [
              { id: 'node-contract-intake', phase_id: 'phase-intake', name: 'Contract Intake and Classification', goal: 'Collect the contract and identify its type and parties', execution_mode: 'human_lead_ai_assist', risk_level: 'medium', human_owner_role: 'Legal Operations', ai_role: 'Contract Intake Assistant', inputs: ['Contract file'], outputs: ['Classified contract brief'] },
              { id: 'node-clause-risk', phase_id: 'phase-review', name: 'Clause and Risk Analysis', goal: 'Detect risky clauses and compare them with legal policy', execution_mode: 'ai_draft_human_review', risk_level: 'high', human_owner_role: 'Legal Counsel', ai_role: 'Clause Risk Analyst', inputs: ['Classified contract brief', 'Legal policy'], outputs: ['Risk-marked contract review'] },
              { id: 'node-legal-approval', phase_id: 'phase-approval', name: 'Legal Approval', goal: 'Approve, reject, or return the reviewed contract for revision', execution_mode: 'human_only', risk_level: 'high', human_owner_role: 'Legal Approver', inputs: ['Risk-marked contract review'], outputs: ['Legal approval decision'] },
            ]
            : [
              { id: 'node-goal-intake', phase_id: 'phase-intake', name: `${project.name || 'Project'} Goal Intake`, goal: project.goal || 'Clarify the project goal', execution_mode: 'human_lead_ai_assist', risk_level: 'medium', inputs: ['Project request'], outputs: ['Approved goal'] },
              { id: 'node-domain-work', phase_id: 'phase-work', name: 'Domain Workflow Execution', goal: `Execute the core workflow for ${project.name || 'the project'}`, execution_mode: 'ai_draft_human_review', risk_level: 'medium', inputs: ['Approved goal'], outputs: ['Domain result'] },
              { id: 'node-human-approval', phase_id: 'phase-approval', name: 'Human Approval', goal: 'Review and approve the domain result', execution_mode: 'human_only', risk_level: 'high', inputs: ['Domain result'], outputs: ['Approval decision'] },
            ];
          output = {
            workflow: {
              phases,
              nodes,
              edges: [
                { id: 'edge-1', from: nodes[0].id, to: nodes[1].id, required_outputs: nodes[0].outputs },
                { id: 'edge-2', from: nodes[1].id, to: nodes[2].id, required_outputs: nodes[1].outputs },
              ],
            },
          };
          if (/invalid workflow/i.test(domainText)) {
            output.workflow.nodes = [];
            output.workflow.edges = [];
          }
        } else if (task === 'workflow_context_plan') {
          output = { intent: 'workflow_edit', targets: [], operation_scope: [] };
        } else if (task === 'workflow_diff' || task === 'workflow_diff_repair') {
          output = { changes: [], summary: 'Use deterministic edit fixture after a successful model call.' };
        }
        if (body.stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'planning' } }] })}\n\n`);
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } })}\n\n`);
          res.end('data: [DONE]\n\n');
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
        }
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), '127.0.0.1', resolve);
  });
  return server;
}

async function main() {
  const port = String(9900 + Math.floor(Math.random() * 80));
  const modelPort = String(10800 + Math.floor(Math.random() * 80));
  const baseUrl = `http://127.0.0.1:${port}`;
  const fakeModelServer = await startFakeModelServer(modelPort);
  const tmpDataDir = `.tmp-server-smoke-${Date.now()}`;
  const env = { ...process.env, BOUNDARYML_SERVER_PORT: port, BOUNDARYML_STORAGE_ADAPTER: 'file', BOUNDARYML_DATA_DIR: tmpDataDir };
  let server = spawn('node', ['apps/server/src/server.js'], { env, stdio: 'pipe' });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  try {
    await waitForServer(baseUrl);
    const health = await apiFetch(baseUrl, '/api/health'); assert(health.status === 200, 'health should return 200');
    const modelConfigSave = await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ provider: 'openai-compatible', api_base_url: `http://127.0.0.1:${modelPort}/v1`, api_key: 'sk-smoke-secret', default_model: 'smoke-default', planning_model: 'smoke-planning', prompt_model: 'smoke-prompt', diff_model: 'smoke-diff', timeout_ms: 12345, structured_output_enabled: false, allow_mock: true, log_level: 'debug' }) });
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
    const generatedProjectList = await apiFetch(baseUrl, '/api/projects');
    const generatedProjectSummary = generatedProjectList.body.data.find((project) => project.id === projectId);
    assert(generatedProjectSummary.workflow_stats?.nodes === generated.body.data.workflow.nodes.length, 'project list should expose node counts before Studio runtime is opened');
    assert(generatedProjectSummary.workflow_stats?.ai_nodes >= 0 && generatedProjectSummary.workflow_stats?.gates >= 0, 'project list should expose AI node and review gate counts');
    const contextSummary = await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack/summarize`, { method: 'POST' });
    assert(contextSummary.body.data.summary.security_boundary.secret_policy, 'context summary should include a security boundary');
    assert(!(contextSummary.body.data.summary.risk_warnings || []).includes('mock_summary_warning'), 'context summary should not use mock warning placeholder');
    const contextSummaryJob = await apiFetch(baseUrl, `/api/projects/${projectId}/jobs/${contextSummary.body.data.job_id}`);
    assert((contextSummaryJob.body.data.stage_history || []).some((stage) => stage.stage === 'analyzing_context'), 'context summary job should retain stage history');
    const retriedSummary = await apiFetch(baseUrl, `/api/projects/${projectId}/jobs/${contextSummary.body.data.job_id}/retry`, { method: 'POST' });
    assert(retriedSummary.body.data.output_ref.type === 'context_pack_summary', 'context summary retry should rerun the real job handler');
    assert(retriedSummary.body.data.output_ref.type !== 'retry_placeholder', 'job retry must not return the old placeholder output');
    const contextImpact = await apiFetch(baseUrl, `/api/projects/${projectId}/context-pack/refresh-impact`, { method: 'POST' });
    assert(contextImpact.body.data.affected_nodes.length > 0, 'context impact should identify affected workflow nodes');
    assert(contextImpact.body.data.affected_assets.length > 0, 'context impact should identify affected execution assets');
    const impactedAssets = await apiFetch(baseUrl, `/api/projects/${projectId}/assets`);
    assert((impactedAssets.body.data.prompts || []).some((asset) => asset.generated_from?.stale === true), 'context impact should mark generated assets stale with source metadata');
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
    const workflowForAgentTab = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow`);
    const agentTabNode = workflowForAgentTab.body.data.nodes.find((node) => node.execution_mode !== 'human_only') || workflowForAgentTab.body.data.nodes[0];
    const smokeContractId = `contract-${agentTabNode.id}-smoke`;
    const agentTabSave = await apiFetch(baseUrl, `/api/projects/${projectId}/nodes/${agentTabNode.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workflow_version: workflowForAgentTab.body.data.version,
        agent_execution_plan: {
          node_id: agentTabNode.id,
          enabled: true,
          execution_level: 'L3',
          execution_target: 'codex',
          dispatch_mode: 'manual_confirmed',
          sandbox_execution_contract_id: smokeContractId,
          status: 'ready',
        },
        sandbox_execution_contract: {
          id: smokeContractId,
          node_id: agentTabNode.id,
          version: 1,
          execution_target: 'codex',
          repo_scope: { repository: 'github.com/example/smoke', base_branch: 'main', working_branch: `agent/${agentTabNode.id}`, allowed_paths: ['apps/**'], forbidden_paths: ['infra/**'] },
          runtime_scope: { allowed_commands: ['npm test', 'npm run build'], network_policy: 'blocked', external_network_approved: false, package_install_policy: 'allow_lockfile_only', max_runtime_minutes: 30 },
          secret_scope: { policy: 'production_forbidden', allowed_secret_refs: [] },
          cost_budget: { amount: 10, currency: 'USD' },
          acceptance_tests: { required: ['npm test', 'npm run build'], optional: [] },
          output_required: { evidence: ['diff', 'test_report', 'risk_summary'] },
          review_gate: agentTabNode.review_gate?.id || null,
          promotion_policy: { promotion_gates: ['sandbox', 'test', 'review'], target_environment: 'review', human_approval_required: true, agent_can_update_formal_workflow: false, production_auto_deploy_allowed: false, block_on_forbidden_paths: true },
          failure_handling: { on_failure: 'stop_and_report', rollback_required: true },
          status: 'draft',
        },
        execution_evidence_template: { id: `evidence-${agentTabNode.id}`, node_id: agentTabNode.id, required_items: ['diff', 'test_report', 'risk_summary'], status: 'draft' },
      }),
    });
    assert(agentTabSave.body.data.node.agent_execution_plan.execution_level === 'L3', 'Agent / Sandbox Tab save should persist L3 agent plan');
    const firstContractVersion = agentTabSave.body.data.node.sandbox_execution_contract.version;
    const nextContract = structuredClone(agentTabSave.body.data.node.sandbox_execution_contract);
    nextContract.runtime_scope.max_runtime_minutes = 31;
    const agentTabSecondSave = await apiFetch(baseUrl, `/api/projects/${projectId}/nodes/${agentTabNode.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        workflow_version: agentTabSave.body.data.workflow_summary.version,
        sandbox_execution_contract: nextContract,
      }),
    });
    assert(agentTabSecondSave.body.data.node.sandbox_execution_contract.version > firstContractVersion, 'Sandbox Contract save should increment contract version');
    const agentKitPreview = await apiFetch(baseUrl, `/api/projects/${projectId}/execution-kits/preview`, { method: 'POST', body: JSON.stringify({ kit_type: 'draft' }) });
    assert(agentKitPreview.body.data.preview.files['sandbox_execution_contracts.yaml']?.includes(smokeContractId), 'agent-ready kit preview should include saved sandbox contract');
    await apiFetch(baseUrl, `/api/projects/${projectId}/jobs`);

    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ clear_api_key: true, allow_mock: true }) });
    const blockedProjectAgent = await apiFetch(baseUrl, '/api/project-agent/messages', { method: 'POST', body: JSON.stringify({ request: 'create a project' }) });
    assert(blockedProjectAgent.status === 428 && blockedProjectAgent.body.error.code === 'LLM_CONFIGURATION_REQUIRED', 'project creation Agent should require a configured LLM in Local Server mode');
    const blockedWorkflowGeneration = await apiFetch(baseUrl, `/api/projects/${projectId}/workflow/generate`, { method: 'POST' });
    assert(blockedWorkflowGeneration.status === 428 && blockedWorkflowGeneration.body.error.code === 'LLM_CONFIGURATION_REQUIRED', 'workflow generation should require a configured LLM in Local Server mode');
    const blockedWorkflowEdit = await apiFetch(baseUrl, `/api/projects/${projectId}/edit-sessions/messages`, { method: 'POST', body: JSON.stringify({ request: 'make this workflow more conservative' }) });
    assert(blockedWorkflowEdit.status === 428 && blockedWorkflowEdit.body.error.code === 'LLM_CONFIGURATION_REQUIRED', 'Workflow Edit Agent should require a configured LLM in Local Server mode');
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ provider: 'aliyun', api_base_url: `http://127.0.0.1:${modelPort}/v1`, api_key: 'sk-agent-smoke', planning_model: 'qwen3.6-max-preview', timeout_ms: 1000, allow_mock: true }) });
    const projectAgentPlan = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        output_language: 'zh-Hans',
        request: '\u9879\u76ee\u540d\u79f0\u662f\u5ba2\u6237\u5165\u95e8\u52a9\u624b\uff0c\u76ee\u6807\u662f\u7f29\u77ed\u5ba2\u6237\u4e0a\u7ebf\u65f6\u95f4\uff0c\u5f53\u524d\u9636\u6bb5\u662f\u63a2\u7d22\uff0c\u76ee\u6807\u4ea4\u4ed8\u7269\u662f PRD\u3001\u5de5\u4f5c\u6d41\u8349\u7a3f\u548c\u53d1\u5e03\u6e05\u5355\uff0c\u9884\u671f AI \u8303\u56f4\u662f\u751f\u6210\u63d0\u793a\u8bcd\u548c\u68c0\u67e5\u6e05\u5355\uff0c\u654f\u611f\u533a\u57df\u662f\u5ba2\u6237\u9690\u79c1\uff0c\u56e2\u961f\u89d2\u8272\u6709 PM\u3001\u8bbe\u8ba1\u5e08\uff0c\u5ba1\u6279\u6d41\u7a0b\u662f PM Review\uff0c\u5de5\u5177\u6808\u662f GitHub\uff0c\u98ce\u9669\u7ea6\u675f\u662f\u4e0d\u80fd\u66b4\u9732\u5ba2\u6237\u6570\u636e\u3002',
      }),
    });
    assert(!projectAgentPlan.body.data.project, 'project Agent should not create a project before blueprint confirmation');
    assert(projectAgentPlan.body.data.project_creation_session.status === 'awaiting_confirmation', 'complete project details should produce an awaiting-confirmation blueprint');
    assert(projectAgentPlan.body.data.project_creation_session.slots.context_pack.team_roles[0] === 'PM', `project agent should remove Chinese linking words from Context Pack values: ${JSON.stringify(projectAgentPlan.body.data.project_creation_session.slots.context_pack.team_roles)}`);
    const projectAgentRevision = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        output_language: 'zh-Hans',
        session_id: projectAgentPlan.body.data.project_creation_session.id,
        request: '\u76ee\u6807\u662f\u5728\u4eba\u5de5\u5ba1\u6279\u524d\u63d0\u4f9b\u53ef\u8ffd\u6eaf\u7684\u5ba2\u6237\u5165\u95e8\u8349\u6848',
      }),
    });
    assert(!projectAgentRevision.body.data.project && projectAgentRevision.body.data.project_creation_session.status === 'awaiting_confirmation', 'editing a blueprint should continue the conversation instead of creating immediately');
    assert(projectAgentRevision.body.data.project_creation_session.slots.goal.includes('\u53ef\u8ffd\u6eaf'), 'explicit follow-up details should update the pending project blueprint');
    const projectAgentSourceRevision = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        output_language: 'zh-Hans',
        session_id: projectAgentRevision.body.data.project_creation_session.id,
        request: '\u4f5c\u56fe\u7684\u9700\u6c42\u6765\u81ea\u54ea\u91cc\uff1f\u4e0d\u5e94\u8be5\u6765\u81ea\u6295\u653e\u56e2\u961f\uff0c\u6216\u8005\u8fd0\u8425\u56e2\u961f\u5417\uff1f',
      }),
    });
    const sourceRevisionSession = projectAgentSourceRevision.body.data.project_creation_session;
    assert(sourceRevisionSession.status === 'awaiting_confirmation', 'a blueprint challenge should remain conversational until confirmation');
    assert(sourceRevisionSession.slots.context_pack.request_sources.includes('\u6295\u653e\u56e2\u961f') && sourceRevisionSession.slots.context_pack.request_sources.includes('\u8fd0\u8425\u56e2\u961f'), 'model-declared changed fields should revise request sources without explicit field labels');
    assert(sourceRevisionSession.slots.context_pack.team_roles.includes('\u6295\u653e\u56e2\u961f'), 'model-declared role changes should update the pending blueprint');
    assert(sourceRevisionSession.messages.at(-1).content.includes('\u6211\u5df2\u636e\u6b64\u66f4\u65b0\u84dd\u56fe'), 'Agent should directly answer the latest blueprint question before showing the revised blueprint');
    const projectAgent = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        output_language: 'zh-Hans',
        session_id: sourceRevisionSession.id,
        request: '\u786e\u8ba4\u521b\u5efa',
      }),
    });
    const agentProject = projectAgent.body.data.project;
    assert(agentProject.goal.includes('\u53ef\u8ffd\u6eaf'), 'confirmed project should use the revised multi-turn blueprint');
    assert(agentProject.context_pack.request_sources.includes('\u6295\u653e\u56e2\u961f'), 'confirmed project should persist conversational request-source revisions');
    assert(agentProject?.name === '\u5ba2\u6237\u5165\u95e8\u52a9\u624b', 'project agent should isolate the project name from a multi-field request');
    assert(agentProject.target_deliverables.length > 0 && !agentProject.target_deliverables.join(' ').includes('AI \u8303\u56f4'), `project agent should stop deliverables at the next labeled field: ${JSON.stringify(agentProject.target_deliverables)}`);
    assert(agentProject.expected_ai_scope.length === 1 && !agentProject.expected_ai_scope[0].includes('\u654f\u611f\u533a\u57df'), 'project agent should isolate AI scope from sensitive areas');
    assert(agentProject.context_pack.team_roles.includes('\u8fd0\u8425\u56e2\u961f'), 'confirmed project should persist conversational role revisions');
    assert(agentProject.context_pack.tool_stack[0] === 'GitHub', 'project agent should isolate tool stack from following constraints');
    assert(projectAgent.body.data.generation_job.status === 'succeeded' && agentProject.workflow.nodes.length >= 3, 'project Agent should return an atomically generated non-empty workflow');

    const contractProjectPlan = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        output_language: 'zh-Hans',
        request: '\u9879\u76ee\u540d\u79f0\u662f\u5408\u540c\u5ba1\u6838AI\uff0c\u76ee\u6807\u662f\u964d\u4f4e\u5408\u540c\u6cd5\u52a1\u5ba1\u6838\u65f6\u95f4\uff0c\u5f53\u524d\u9636\u6bb5\u662f\u63a2\u7d22\uff0c\u56e2\u961f\u89d2\u8272\u6709\u6cd5\u52a1\u548c\u4e1a\u52a1\u8d1f\u8d23\u4eba\uff0c\u5ba1\u6279\u6d41\u7a0b\u662f\u6cd5\u52a1\u5ba1\u6279\uff0c\u98ce\u9669\u7ea6\u675f\u662f\u5408\u540c\u6570\u636e\u4e0d\u80fd\u5916\u53d1\u3002',
      }),
    });
    assert(contractProjectPlan.body.data.project_creation_session.status === 'awaiting_confirmation', 'contract project should wait for explicit user confirmation');
    const contractProjectAgent = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({
        output_language: 'zh-Hans',
        session_id: contractProjectPlan.body.data.project_creation_session.id,
        request: '\u786e\u8ba4\u521b\u5efa',
      }),
    });
    const contractProject = contractProjectAgent.body.data.project;
    assert(contractProject.created_from_template === 'template-custom-ai-workflow', 'domain projects should use the neutral custom scaffold instead of the AI SaaS fallback template');
    assert(contractProject.workflow.nodes.length === 3, 'contract review Agent creation should persist generated workflow nodes before returning');
    assert(contractProject.workflow.nodes.some((node) => node.name === 'Clause and Risk Analysis'), 'contract review workflow should contain domain-specific review nodes');
    assert(!contractProject.workflow.nodes.some((node) => node.name === 'PRD Draft Generation'), 'contract review workflow should not copy the AI SaaS MVP node set');

    const projectsBeforeInvalidPlan = await apiFetch(baseUrl, '/api/projects');
    const invalidWorkflowPlan = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ request: 'name: Invalid Workflow; goal: test atomic project creation; current stage: discovery' }),
    });
    assert(invalidWorkflowPlan.body.data.project_creation_session.status === 'awaiting_confirmation', 'invalid workflow fixture should still require blueprint confirmation first');
    const invalidWorkflowProject = await apiFetch(baseUrl, '/api/project-agent/messages', {
      method: 'POST',
      body: JSON.stringify({ session_id: invalidWorkflowPlan.body.data.project_creation_session.id, request: 'Confirm creation' }),
    });
    assert(invalidWorkflowProject.status === 502 && invalidWorkflowProject.body.error.code === 'PROJECT_WORKFLOW_GENERATION_FAILED', 'invalid model workflow output should fail project creation explicitly');
    const projectsAfterInvalidPlan = await apiFetch(baseUrl, '/api/projects');
    assert(projectsAfterInvalidPlan.body.data.length === projectsBeforeInvalidPlan.body.data.length, 'failed Agent generation must not persist an empty project shell');

    const agentEditProject = await apiFetch(baseUrl, '/api/projects', { method: 'POST', body: JSON.stringify({ name: 'agent-replan-project', goal: 'exercise multi-batch replanning' }) });
    const agentEditProjectId = agentEditProject.body.data.id;
    const agentGenerated = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/workflow/generate`, { method: 'POST' });
    const agentWorkflow = structuredClone(agentGenerated.body.data.workflow);
    agentWorkflow.nodes = agentWorkflow.nodes.map((node, index) => index < 3
      ? { ...node, risk_level: 'high', review_gate: null, reviewGate: null }
      : node);
    const agentPrepared = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/workflow`, {
      method: 'PATCH',
      body: JSON.stringify({ workflow_version: agentWorkflow.version, nodes: agentWorkflow.nodes }),
    });
    const firstBatch = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/edit-sessions/messages`, {
      method: 'POST',
      body: JSON.stringify({ request: 'add review gates to all high-risk nodes', batch_size: 1 }),
    });
    const firstBatchDiff = firstBatch.body.data.diff;
    const firstBatchSession = firstBatch.body.data.edit_session;
    assert(firstBatchDiff?.changes?.length === 1, 'workflow agent should expose only the first planned batch for review');
    assert(firstBatchSession.all_changes.length >= 3, 'workflow agent should retain the complete multi-step plan behind the first batch');
    const firstBatchApplied = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/diffs/${firstBatchDiff.id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ workflow_version: agentPrepared.body.data.workflow.version }),
    });
    assert(firstBatchApplied.body.data.edit_session.status === 'awaiting_next_batch', 'applying the first batch should preserve remaining planned work');
    const previousPendingIds = firstBatchApplied.body.data.edit_session.pending_change_ids;
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ clear_api_key: true }) });
    const blockedNextBatch = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/edit-sessions/${firstBatchSession.id}/next`, { method: 'POST' });
    assert(blockedNextBatch.status === 428 && blockedNextBatch.body.error.code === 'LLM_CONFIGURATION_REQUIRED', 'continuing Workflow Agent batches should require the LLM configuration to remain available');
    await apiFetch(baseUrl, '/api/model/config', { method: 'PUT', body: JSON.stringify({ api_key: 'sk-agent-smoke' }) });
    const replanned = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/edit-sessions/messages`, {
      method: 'POST',
      body: JSON.stringify({ request: 'add phase Security Review', batch_size: 1 }),
    });
    assert(replanned.body.data.edit_session.id === firstBatchSession.id, 'replanning should continue the active edit session');
    assert(replanned.body.data.edit_session.status === 'diff_ready', 'a replacement plan should return to diff review');
    assert(replanned.body.data.diff?.changes?.[0]?.targetId === 'phase-security-review', 'replanning should replace pending work with the newly requested workflow change');
    assert(previousPendingIds.every((id) => replanned.body.data.edit_session.skipped_change_ids.includes(id)), 'replanning should mark the superseded pending changes as skipped');
    assert(replanned.body.data.edit_session.agent_trace.some((item) => item.stage === 'replanner'), 'replanning should record a traceable planner transition');
    const replannedApplied = await apiFetch(baseUrl, `/api/projects/${agentEditProjectId}/diffs/${replanned.body.data.diff.id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ workflow_version: firstBatchApplied.body.data.workflow.version }),
    });
    assert(replannedApplied.body.data.workflow.phases.some((phase) => phase.id === 'phase-security-review'), 'the replacement workflow batch should remain applicable');
    assert(replannedApplied.body.data.edit_session.status === 'applied', 'the replanned session should finish after its replacement work is applied');

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
    await new Promise((resolve) => fakeModelServer.close(resolve));
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
