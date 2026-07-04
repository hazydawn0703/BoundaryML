import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = resolve(rootDir, 'data');
const acceptanceDir = resolve(dataDir, 'open-source-acceptance');
const reportsDir = join(acceptanceDir, 'reports');
const logsDir = join(acceptanceDir, 'logs');
const modelConfigPath = join(acceptanceDir, 'model-config.json');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = join(reportsDir, `${runId}.md`);
const latestReportPath = join(acceptanceDir, 'latest-report.md');
const latestJsonPath = join(acceptanceDir, 'latest-report.json');
const docsReportPath = join(rootDir, 'docs/open-source-acceptance-report.md');
const projectName = `Open Source Acceptance Agentic Dev ${runId}`;
const results = [];
const artifacts = {};
const children = [];
let serverPort;
let modelPort;
let studioPort;
let baseUrl;
let studioUrl;
let projectId;
let projectFilePath;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDirs() {
  [dataDir, acceptanceDir, reportsDir, logsDir, dirname(docsReportPath)].forEach((dir) => mkdirSync(dir, { recursive: true }));
}

function normalizeForMarkdown(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function writeReport(status = 'running') {
  const passed = results.filter((item) => item.status === 'PASS').length;
  const failed = results.filter((item) => item.status === 'FAIL').length;
  const statusLabel = { running: '运行中', passed: '通过', failed: '失败' }[status] || status;
  const lines = [
    '# BoundaryML 开源部分功能验收报告',
    '',
    `- 运行 ID: \`${runId}\``,
    `- 验收状态: **${statusLabel}**`,
    `- 验收项目: \`${projectName}\`${projectId ? ` / \`${projectId}\`` : ''}`,
    `- 本地持久化数据目录: \`${dataDir}\``,
    `- 验收证据目录: \`${acceptanceDir}\``,
    projectFilePath ? `- 项目文件: \`${projectFilePath}\`` : '',
    `- 通过检查数: ${passed}`,
    `- 失败检查数: ${failed}`,
    `- Server URL: ${baseUrl || 'n/a'}`,
    `- Studio URL: ${studioUrl || 'n/a'}`,
    '',
    '## 验收范围',
    '',
    '本报告使用一个真实创建并通过 FileStorage 持久化到本地的项目，验收开源 Community Core Phase 0-9 的主要能力：Local Server API、Project Agent 创建项目、Context Pack、Workflow 编辑、Agent / Sandbox 配置、Workflow Agent Diff、Execution Assets、Execution Kit 导出、Jobs / History、Model Access、模型调用日志持久化、模板 / 示例，以及 Studio 静态页面和 API proxy 可用性。',
    '',
    '## 验收结果',
    '',
    '| 模块 | 检查项 | 状态 | 证据 |',
    '| --- | --- | --- | --- |',
    ...results.map((item) => `| ${item.area} | ${item.name} | ${item.status} | ${normalizeForMarkdown(item.evidence || item.error).replace(/\r?\n/g, '<br>')} |`),
    '',
    '## 验收产物',
    '',
    ...Object.entries(artifacts).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## 结论',
    '',
    failed === 0
      ? '开源 Community Core Phase 0-9 的真实项目验收全部通过。验收项目和日志已保留在本地持久化目录，后续可直接用于复查或缺陷修复。'
      : '存在未通过的验收项。请保留本地持久化项目目录用于定位问题，修复后重新运行验收脚本。',
    '',
  ].filter(Boolean);
  const markdown = lines.join('\n');
  writeFileSync(reportPath, markdown, 'utf-8');
  writeFileSync(latestReportPath, markdown, 'utf-8');
  writeFileSync(docsReportPath, markdown, 'utf-8');
  writeFileSync(latestJsonPath, JSON.stringify({ runId, status, projectName, projectId, dataDir, acceptanceDir, projectFilePath, artifacts, results }, null, 2), 'utf-8');
}

async function check(area, name, fn) {
  const startedAt = Date.now();
  try {
    const evidence = await fn();
    results.push({ area, name, status: 'PASS', duration_ms: Date.now() - startedAt, evidence });
    writeReport('running');
    return evidence;
  } catch (error) {
    results.push({ area, name, status: 'FAIL', duration_ms: Date.now() - startedAt, error: error.stack || error.message || String(error) });
    writeReport('failed');
    throw error;
  }
}

function requestUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request(target, {
      method: options.method || 'GET',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
        resolve({ status: res.statusCode || 0, body, raw });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function request(base, path, options = {}) {
  return requestUrl(new URL(path, base).toString(), options);
}

async function apiFetch(path, options = {}, { expectOk = true } = {}) {
  const { status, body } = await request(baseUrl, path, options);
  assert(body && typeof body === 'object', `Response must be JSON object: ${path}`);
  assert('ok' in body, `Response envelope must include ok: ${path}`);
  assert(body.meta && body.meta.requestId, `Response envelope must include meta.requestId: ${path}`);
  if (expectOk) {
    assert(status >= 200 && status < 300 && body.ok, `Expected ok response for ${path}: ${status} ${JSON.stringify(body.error || body)}`);
    assert('data' in body, `Success envelope must include data: ${path}`);
  } else {
    assert(!body.ok && body.error?.code, `Expected error envelope for ${path}`);
  }
  return { status, body };
}

async function waitForHttp(url, predicate = (res) => res.status >= 200 && res.status < 500, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await requestUrl(url);
      if (predicate(response)) return response;
    } catch {}
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.once('error', reject);
  });
}

function fakeModelOutput(task, payload) {
  if (task === 'project_creation_plan') {
    return {
      intent: 'complete_blueprint',
      assistant_reply: 'I prepared a reviewable open-source acceptance blueprint.',
      reasoning_summary: 'Open-source acceptance scope, Agentic Development boundaries, evidence, and approvals',
      changed_fields: [],
      project: {
        name: projectName,
        goal: 'Verify BoundaryML open-source Community Core Phase 0-9 end to end with persisted evidence.',
        project_type: 'AI Feature',
        current_stage: 'Acceptance',
        risk_level: 'high',
        target_deliverables: ['Acceptance workflow', 'Agent-ready execution kit', 'Validation report'],
        expected_ai_scope: ['Generate workflow diff', 'Prepare prompts and checklists', 'Draft execution evidence'],
        sensitive_areas: ['Customer data', 'Production release', 'Secrets'],
        context_pack: {
          request_sources: ['Open-source acceptance team'],
          team_roles: ['Product Owner', 'Tech Lead', 'QA Lead', 'Release Manager'],
          approval_process: ['Tech Lead Review', 'Release Manager Approval'],
          tool_stack: ['GitHub', 'npm', 'Playwright', 'BoundaryML Studio'],
          risk_constraints: ['No production deployment without human approval', 'No production secrets in sandbox'],
          historical_process_materials: 'Acceptance runbook v1',
        },
      },
      confidence: 'high',
      missing_fields: [],
    };
  }
  if (task === 'workflow_generate') {
    return {
      workflow: {
        phases: [
          { id: 'phase-discovery', name: 'Discovery', order: 1 },
          { id: 'phase-design', name: 'Technical Design', order: 2 },
          { id: 'phase-development', name: 'Development', order: 3 },
          { id: 'phase-testing', name: 'Testing', order: 4 },
          { id: 'phase-launch', name: 'Launch', order: 5 },
        ],
        nodes: [
          { id: 'node-context-intake', phase_id: 'phase-discovery', name: 'Context Intake', goal: 'Collect open-source acceptance context and constraints', execution_mode: 'human_lead_ai_assist', risk_level: 'medium', human_owner_role: 'Product Owner', ai_role: 'Context Analyst', inputs: ['Acceptance request'], outputs: ['Reviewed context pack'] },
          { id: 'node-boundary-design', phase_id: 'phase-design', name: 'Boundary Blueprint Review', goal: 'Review workflow boundaries, review gates, and evidence requirements', execution_mode: 'ai_draft_human_review', risk_level: 'high', human_owner_role: 'Tech Lead', ai_role: 'Boundary Reviewer', inputs: ['Reviewed context pack'], outputs: ['Boundary blueprint'] },
          { id: 'node-code-generation', phase_id: 'phase-development', name: 'Code Generation', goal: 'Prepare code changes within sandbox boundaries', execution_mode: 'ai_draft_human_review', risk_level: 'high', human_owner_role: 'Tech Lead', ai_role: 'Coding Agent Planner', inputs: ['Boundary blueprint'], outputs: ['Patch plan and implementation notes'] },
          { id: 'node-test-automation', phase_id: 'phase-testing', name: 'Test Automation', goal: 'Run npm test and build verification without external network access', execution_mode: 'ai_execute_human_approval', risk_level: 'medium', human_owner_role: 'QA Lead', ai_role: 'Test Runner', inputs: ['Patch plan and implementation notes'], outputs: ['Test report'] },
          { id: 'node-production-release', phase_id: 'phase-launch', name: 'Production Release Approval', goal: 'Approve or reject release after human review', execution_mode: 'human_only', risk_level: 'high', human_owner_role: 'Release Manager', inputs: ['Test report'], outputs: ['Release decision'] },
        ],
        edges: [
          { id: 'edge-1', from: 'node-context-intake', to: 'node-boundary-design', required_outputs: ['Reviewed context pack'] },
          { id: 'edge-2', from: 'node-boundary-design', to: 'node-code-generation', required_outputs: ['Boundary blueprint'] },
          { id: 'edge-3', from: 'node-code-generation', to: 'node-test-automation', required_outputs: ['Patch plan and implementation notes'] },
          { id: 'edge-4', from: 'node-test-automation', to: 'node-production-release', required_outputs: ['Test report'] },
        ],
      },
    };
  }
  if (task === 'workflow_context_plan') {
    return { intent: 'workflow_edit', targets: [], operation_scope: ['node_detail_update'], needed_fields: ['nodes', 'assets'], confidence: 'high' };
  }
  if (task === 'workflow_diff' || task === 'workflow_diff_repair') {
    return { changes: [], summary: 'Use deterministic open-source acceptance fallback after a successful model call.' };
  }
  return { summary: `acceptance fake response for ${task}` };
}

async function startFakeModelServer(port) {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}');
        const userMessage = (body.messages || []).find((message) => message.role === 'user');
        const envelope = JSON.parse(userMessage?.content || '{}');
        const output = fakeModelOutput(envelope.task, envelope.payload || {});
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: error.message } }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

function spawnLogged(name, command, args, env = {}) {
  const logPath = join(logsDir, `${name}-${runId}.log`);
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push(child);
  child.stdout.on('data', (chunk) => appendFileSync(logPath, chunk));
  child.stderr.on('data', (chunk) => appendFileSync(logPath, chunk));
  child.on('exit', (code, signal) => appendFileSync(logPath, `\n[exit] code=${code} signal=${signal}\n`));
  artifacts[`${name}_log`] = logPath;
  return child;
}

async function stopChild(child) {
  if (!child || child.killed) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      killer.on('exit', resolve);
      killer.on('error', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
}

async function stopAll() {
  await Promise.all(children.splice(0).map((child) => stopChild(child)));
}

async function startBoundaryServer() {
  serverPort = await getFreePort();
  baseUrl = `http://127.0.0.1:${serverPort}`;
  const child = spawnLogged('server', process.execPath, ['apps/server/src/server.js'], {
    BOUNDARYML_SERVER_PORT: String(serverPort),
    BOUNDARYML_STORAGE_ADAPTER: 'file',
    BOUNDARYML_DATA_DIR: dataDir,
    BOUNDARYML_MODEL_CONFIG_PATH: modelConfigPath,
  });
  await waitForHttp(`${baseUrl}/api/health`, (res) => res.status === 200 && res.body?.ok === true);
  artifacts.server_url = baseUrl;
  return child;
}

async function startStudioServer() {
  studioPort = await getFreePort();
  studioUrl = `http://127.0.0.1:${studioPort}/apps/studio/index.html`;
  const child = spawnLogged('studio', process.execPath, ['scripts/dev-studio.js'], {
    BOUNDARYML_STUDIO_PORT: String(studioPort),
    BOUNDARYML_API_BASE_URL: baseUrl,
  });
  await waitForHttp(studioUrl, (res) => res.status === 200 && String(res.raw).includes('BoundaryML'));
  await waitForHttp(`http://127.0.0.1:${studioPort}/api/health`, (res) => res.status === 200 && res.body?.ok === true);
  artifacts.studio_url = studioUrl;
  return child;
}

function listItems(value) {
  return Array.isArray(value) ? value : [];
}

function findNode(workflow, predicate, fallbackMessage) {
  const node = (workflow.nodes || []).find(predicate);
  assert(node, fallbackMessage);
  return node;
}

async function configureModel() {
  const saved = await apiFetch('/api/model/config', {
    method: 'PUT',
    body: JSON.stringify({
      provider: 'openai-compatible',
      api_base_url: `http://127.0.0.1:${modelPort}/v1`,
      api_key: 'sk-open-source-acceptance',
      default_model: 'acceptance-default',
      planning_model: 'acceptance-planning',
      prompt_model: 'acceptance-prompt',
      diff_model: 'acceptance-diff',
      timeout_ms: 5000,
      structured_output_enabled: true,
      allow_mock: true,
      log_level: 'debug',
    }),
  });
  const test = await apiFetch('/api/model/test', { method: 'POST' });
  return { mode: saved.body.data.status.mode, test_status: test.body.data.status };
}

async function createAcceptanceProject() {
  const first = await apiFetch('/api/project-agent/messages', {
    method: 'POST',
    body: JSON.stringify({
      output_language: 'zh-Hans',
      request: [
        `项目名称是 ${projectName}`,
        '目标是端到端验收 BoundaryML 开源 Community Core Phase 0-9',
        '当前阶段是开源验收',
        '目标交付物是验收工作流、Agent-ready Execution Kit、验收报告',
        '预期 AI 范围是生成 Workflow Diff、准备 Prompt 和 Checklist、生成执行证据',
        '敏感区域是客户数据、生产发布、密钥',
        '需求来源是开源验收团队',
        '团队角色有 Product Owner、Tech Lead、QA Lead、Release Manager',
        '审批流程是 Tech Lead Review 和 Release Manager Approval',
        '工具栈是 GitHub、npm、Playwright、BoundaryML Studio',
        '风险约束是不能在 sandbox 使用生产密钥，生产发布必须人工批准',
      ].join('，'),
    }),
  });
  assert(first.body.data.project_creation_session?.status === 'awaiting_confirmation', 'Project Agent should request confirmation before creation');
  const confirmed = await apiFetch('/api/project-agent/messages', {
    method: 'POST',
    body: JSON.stringify({
      output_language: 'zh-Hans',
      session_id: first.body.data.project_creation_session.id,
      request: '确认创建',
    }),
  });
  const project = confirmed.body.data.project;
  assert(project?.id, 'Project Agent confirmation should create a project');
  assert((project.workflow?.nodes || []).length > 0, 'Created project should include generated workflow nodes');
  projectId = project.id;
  projectFilePath = join(dataDir, 'workspaces', 'local_default', 'projects', `${projectId}.json`);
  artifacts.project_file = projectFilePath;
  return { project_id: project.id, workflow_nodes: project.workflow.nodes.length, generation_job: confirmed.body.data.generation_job?.status };
}

async function regenerateWorkflow() {
  const generated = await apiFetch(`/api/projects/${projectId}/workflow/generate`, { method: 'POST' });
  const workflow = generated.body.data.workflow;
  assert((workflow.phases || []).some((phase) => phase.name === 'Development'), 'Workflow generation should include Development phase');
  assert((workflow.nodes || []).some((node) => node.name === 'Code Generation'), 'Workflow generation should include Code Generation node');
  return { version: workflow.version, phases: workflow.phases.length, nodes: workflow.nodes.length };
}

async function configureAgentSandboxDirectly() {
  const workflowResult = await apiFetch(`/api/projects/${projectId}/workflow`);
  const workflow = workflowResult.body.data;
  const codeNode = findNode(workflow, (node) => node.name === 'Code Generation', 'Code Generation node missing');
  const contractId = `contract-${codeNode.id}-acceptance`;
  const save = await apiFetch(`/api/projects/${projectId}/nodes/${codeNode.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      workflow_version: workflow.version,
      agent_execution_plan: {
        node_id: codeNode.id,
        enabled: true,
        execution_level: 'L3',
        execution_target: 'codex',
        dispatch_mode: 'manual_confirmed',
        sandbox_execution_contract_id: contractId,
        status: 'ready',
      },
      sandbox_execution_contract: {
        id: contractId,
        node_id: codeNode.id,
        execution_target: 'codex',
        repo_scope: { repository: 'github.com/hazydawn0703/BoundaryML', base_branch: 'main', working_branch: `acceptance/${codeNode.id}`, allowed_paths: ['apps/**', 'packages/**', 'scripts/**'], forbidden_paths: ['secrets/**'] },
        runtime_scope: { allowed_commands: ['npm run check', 'npm run typecheck'], network_policy: 'blocked', external_network_approved: false, package_install_policy: 'allow_lockfile_only', max_runtime_minutes: 45 },
        secret_scope: { policy: 'sandbox_only', allowed_secret_refs: [] },
        cost_budget: { currency: 'USD', amount: 5 },
        acceptance_tests: { required: ['npm run check', 'npm run typecheck'], optional: [] },
        output_required: { evidence: ['diff', 'test_report', 'risk_summary', 'rollback_note'] },
        review_gate: codeNode.review_gate?.id || null,
        promotion_policy: { promotion_gates: ['sandbox', 'test', 'review'], target_environment: 'review', human_approval_required: true, agent_can_update_formal_workflow: false, production_auto_deploy_allowed: false, block_on_forbidden_paths: true },
        failure_handling: { retry_policy: 'manual_retry', rollback_required: true, escalation_role: 'Tech Lead' },
      },
      promotion_gate: { id: `promotion-${codeNode.id}`, node_id: codeNode.id, gate_type: 'review', required_checks: ['required_tests', 'human_approval'], human_approval_required: true, agent_auto_promote_allowed: false, status: 'draft' },
      execution_evidence_template: { id: `evidence-${codeNode.id}`, node_id: codeNode.id, required_items: ['diff', 'test_report', 'risk_summary', 'rollback_note'], status: 'draft' },
    }),
  });
  const savedNode = save.body.data.node;
  assert(savedNode.agent_execution_plan.execution_level === 'L3', 'Agent plan should save L3');
  assert(savedNode.sandbox_execution_contract.version >= 1, 'Sandbox contract should have version');
  const second = await apiFetch(`/api/projects/${projectId}/nodes/${codeNode.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      workflow_version: save.body.data.workflow_summary.version,
      sandbox_execution_contract: { ...savedNode.sandbox_execution_contract, runtime_scope: { ...savedNode.sandbox_execution_contract.runtime_scope, max_runtime_minutes: 60 } },
    }),
  });
  assert(second.body.data.node.sandbox_execution_contract.version > savedNode.sandbox_execution_contract.version, 'Contract version should increment');
  return { node_id: codeNode.id, workflow_version: second.body.data.workflow_summary.version, contract_version: second.body.data.node.sandbox_execution_contract.version };
}

async function runWorkflowAgentRequest(requestText, applyMode = 'session') {
  const before = await apiFetch(`/api/projects/${projectId}/workflow`);
  const message = await apiFetch(`/api/projects/${projectId}/edit-sessions/messages`, {
    method: 'POST',
    body: JSON.stringify({ request: requestText, batch_size: 10 }),
  });
  const diff = message.body.data.diff;
  const session = message.body.data.edit_session;
  assert(diff?.changes?.length > 0, `Workflow Agent should generate diff for: ${requestText}`);
  assert(diff.changes.every((change) => change.reason && change.impact), 'Diff changes should include review reason and impact');
  if (applyMode === 'reject') {
    await apiFetch(`/api/projects/${projectId}/edit-sessions/${session.id}/reject`, { method: 'POST' });
    return { diff_id: diff.id, session_id: session.id, changes: diff.changes.length, rejected: true, before_version: before.body.data.version };
  }
  const apply = applyMode === 'session'
    ? await apiFetch(`/api/projects/${projectId}/edit-sessions/${session.id}/apply`, { method: 'POST', body: JSON.stringify({ workflow_version: before.body.data.version }) })
    : await apiFetch(`/api/projects/${projectId}/diffs/${diff.id}/apply`, { method: 'POST', body: JSON.stringify({ workflow_version: before.body.data.version }) });
  assert((apply.body.data.validation_results || apply.body.data.validation || []).every((item) => item.level !== 'error'), 'Applied diff should not introduce blocking validation errors');
  return { diff_id: diff.id, session_id: session.id, changes: diff.changes.length, workflow_version: apply.body.data.workflow.version };
}

async function exerciseWorkflowAgent() {
  let workflow = (await apiFetch(`/api/projects/${projectId}/workflow`)).body.data;
  const codeNode = findNode(workflow, (node) => node.name === 'Code Generation', 'Code Generation node missing');
  const testNode = findNode(workflow, (node) => node.name === 'Test Automation', 'Test Automation node missing');
  const releaseNode = findNode(workflow, (node) => node.name === 'Production Release Approval', 'Production Release node missing');

  const sandbox = await runWorkflowAgentRequest(`把 ${codeNode.name} 改成 L3 Sandbox，禁止访问 infra 目录。`, 'session');
  workflow = (await apiFetch(`/api/projects/${projectId}/workflow`)).body.data;
  const sandboxNode = findNode(workflow, (node) => node.id === codeNode.id, 'Sandbox node missing after apply');
  assert((sandboxNode.sandbox_execution_contract?.repo_scope?.forbidden_paths || []).includes('infra/**'), 'Workflow Agent should add infra/** forbidden path');

  const testCommands = await runWorkflowAgentRequest(`允许 ${testNode.name} 运行 npm test 和 npm run build，但禁止联网。`, 'diff');
  workflow = (await apiFetch(`/api/projects/${projectId}/workflow`)).body.data;
  const updatedTestNode = findNode(workflow, (node) => node.id === testNode.id, 'Test node missing after apply');
  assert((updatedTestNode.sandbox_execution_contract?.runtime_scope?.allowed_commands || []).includes('npm test'), 'Test node contract should include npm test');
  assert(updatedTestNode.sandbox_execution_contract?.runtime_scope?.network_policy === 'blocked', 'Test node network should be blocked');

  const production = await runWorkflowAgentRequest(`给 ${releaseNode.name} 增加 production gate，不能由 Agent 自动发布。`, 'diff');
  workflow = (await apiFetch(`/api/projects/${projectId}/workflow`)).body.data;
  const updatedReleaseNode = findNode(workflow, (node) => node.id === releaseNode.id, 'Release node missing after apply');
  assert(updatedReleaseNode.agent_execution_plan?.execution_level === 'L0', 'Production release should remain L0');
  assert(updatedReleaseNode.promotion_gate?.human_approval_required === true, 'Production gate should require human approval');

  const phasesBeforeReject = workflow.phases.length;
  const reject = await runWorkflowAgentRequest('add phase Security Review', 'reject');
  workflow = (await apiFetch(`/api/projects/${projectId}/workflow`)).body.data;
  assert(workflow.phases.length === phasesBeforeReject, 'Rejecting a diff should not mutate formal workflow');
  assert(!workflow.phases.some((phase) => phase.id === 'phase-security-review'), 'Rejected phase should not appear in workflow');
  return { sandbox, testCommands, production, reject };
}

async function exerciseAssets() {
  const assets = (await apiFetch(`/api/projects/${projectId}/assets`)).body.data;
  const prompt = (assets.prompts || [])[0];
  const checklist = (assets.checklists || [])[0];
  assert(prompt?.generated_from?.workflow_version, 'Prompt should include generated_from workflow version');
  assert(checklist?.generated_from?.workflow_version, 'Checklist should include generated_from workflow version');
  const promptGet = await apiFetch(`/api/projects/${projectId}/assets/${prompt.id}`);
  assert(promptGet.body.data.id === prompt.id, 'Asset detail should be readable');
  const regenChecklist = await apiFetch(`/api/projects/${projectId}/assets/${checklist.id}/regenerate`, { method: 'POST' });
  assert(regenChecklist.body.data.regenerated === true, 'Checklist should regenerate');
  await apiFetch(`/api/projects/${projectId}/assets/${prompt.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content: `${prompt.content}\n\nAcceptance manual edit.` }),
  });
  const blockedRegen = await apiFetch(`/api/projects/${projectId}/assets/${prompt.id}/regenerate`, { method: 'POST' }, { expectOk: false });
  assert(blockedRegen.body.error.code === 'ASSET_MANUAL_EDIT_WARNING', 'Manual prompt regenerate should require confirmation');
  return { prompt_id: prompt.id, checklist_id: checklist.id, manual_regen_code: blockedRegen.body.error.code };
}

async function exerciseExecutionKit() {
  const validation = await apiFetch(`/api/projects/${projectId}/workflow/validate`, { method: 'POST' });
  const validationResults = validation.body.data.validation || validation.body.data.validation_results || [];
  assert(validationResults.every((item) => item.level !== 'error'), `Workflow should have no blocking validation errors: ${JSON.stringify(validationResults.filter((item) => item.level === 'error'))}`);
  const preview = await apiFetch(`/api/projects/${projectId}/execution-kits/preview`, { method: 'POST', body: JSON.stringify({ kit_type: 'draft' }) });
  const files = preview.body.data.preview?.files || {};
  const requiredFiles = ['workflow_spec.yaml', 'agent_task_list.md', 'sandbox_execution_contracts.yaml', 'promotion_gates.yaml', 'execution_evidence_templates.md', 'prompt_pack.md', 'review_checklists.md', 'artifact_templates.md', 'responsibility_map.md', 'risk_report.md', 'boundary_rules_report.md'];
  requiredFiles.forEach((file) => assert(typeof files[file] === 'string', `Execution Kit preview missing ${file}`));
  assert(files.sandbox_execution_contracts_yaml || files['sandbox_execution_contracts.yaml'].includes('contract-'), 'Sandbox contracts should be present in kit preview');
  const finalKit = await apiFetch(`/api/projects/${projectId}/execution-kits/generate`, { method: 'POST', body: JSON.stringify({ kit_type: 'final' }) });
  const kit = finalKit.body.data.kit;
  assert(kit?.id && kit.status === 'generated_final', 'Final kit should be generated');
  const downloaded = await apiFetch(`/api/projects/${projectId}/execution-kits/${kit.id}/download`);
  assert(downloaded.body.data.filename.endsWith('.json'), 'Kit download should expose JSON filename');
  return { kit_id: kit.id, files: requiredFiles.length, download: downloaded.body.data.filename };
}

async function exerciseHistoryAndJobs() {
  const workflow = (await apiFetch(`/api/projects/${projectId}/workflow`)).body.data;
  const firstNode = workflow.nodes[0];
  const patchedNodes = workflow.nodes.map((node) => (node.id === firstNode.id ? { ...node, status: 'reviewed' } : node));
  const patched = await apiFetch(`/api/projects/${projectId}/workflow`, {
    method: 'PATCH',
    body: JSON.stringify({ workflow_version: workflow.version, nodes: patchedNodes }),
  });
  assert(patched.body.data.workflow.version > workflow.version, 'Workflow patch should increment version');
  const undone = await apiFetch(`/api/projects/${projectId}/workflow/undo`, { method: 'POST' });
  assert(undone.body.data.workflow.nodes.find((node) => node.id === firstNode.id)?.status === firstNode.status, 'Undo should restore prior node status');
  const saved = await apiFetch(`/api/projects/${projectId}/workflow/history`, { method: 'POST', body: JSON.stringify({ workflow_version: undone.body.data.workflow.version, summary: 'Open-source acceptance checkpoint' }) });
  assert(saved.body.data.history.length >= 1, 'Workflow history should save checkpoint');
  const version = await apiFetch(`/api/projects/${projectId}/workflow/versions/${undone.body.data.workflow.version}`);
  assert(version.body.data.workflow_version === undone.body.data.workflow.version, 'Saved workflow version should be readable');

  const jobs = await apiFetch(`/api/projects/${projectId}/jobs`);
  assert((jobs.body.data || []).length > 0, 'Jobs list should include generated jobs');
  const retryable = jobs.body.data.find((job) => job.type === 'summarize_context_pack') || jobs.body.data.find((job) => job.type === 'generate_execution_kit_preview');
  assert(retryable, 'A retryable job should exist');
  const retried = await apiFetch(`/api/projects/${projectId}/jobs/${retryable.id}/retry`, { method: 'POST' });
  assert(retried.body.data.retry_of === retryable.id && retried.body.data.status === 'succeeded', 'Retry should create succeeded retry job');
  const retriedGet = await apiFetch(`/api/projects/${projectId}/jobs/${retried.body.data.id}`);
  assert((retriedGet.body.data.stage_history || []).length >= 2, 'Retried job should retain stage history');
  return { history_entries: saved.body.data.history.length, jobs: jobs.body.data.length, retried_job: retried.body.data.id };
}

async function verifyPersistence(serverChild) {
  assert(existsSync(projectFilePath), 'Project file should exist before restart');
  const savedProject = JSON.parse(readFileSync(projectFilePath, 'utf-8'));
  assert(savedProject.id === projectId, 'Project file should contain acceptance project');
  await stopChild(serverChild);
  children.splice(children.indexOf(serverChild), 1);
  await sleep(500);
  const restarted = await startBoundaryServer();
  const restored = await apiFetch(`/api/projects/${projectId}`);
  assert(restored.body.data.id === projectId, 'Project should load after server restart');
  const calls = await apiFetch('/api/model/calls');
  assert((calls.body.data || []).length > 0, 'Model call log should persist after restart');
  artifacts.model_calls_file = join(dataDir, 'model-calls.json');
  return { restarted_server: restarted.pid, restored_project: restored.body.data.id, model_calls: calls.body.data.length };
}

async function main() {
  ensureDirs();
  artifacts.acceptance_dir = acceptanceDir;
  artifacts.data_dir = dataDir;
  artifacts.model_config_file = modelConfigPath;
  modelPort = await getFreePort();
  const fakeModelServer = await startFakeModelServer(modelPort);
  artifacts.fake_model_url = `http://127.0.0.1:${modelPort}/v1`;
  let serverChild;
  try {
    serverChild = await startBoundaryServer();
    await startStudioServer();

    await check('Phase 1 / API', 'Health envelope and Studio proxy are reachable', async () => {
      const health = await apiFetch('/api/health');
      const studioHealth = await requestUrl(`http://127.0.0.1:${studioPort}/api/health`);
      assert(studioHealth.body?.ok === true, 'Studio API proxy should reach server health');
      return { server: health.body.data.status, studio_proxy: studioHealth.body.data.status };
    });

    await check('Phase 7 / Model Access', 'Configure OpenAI-compatible model and run model test', configureModel);

    await check('Phase 9 / Templates', 'Public templates are present and no commercial templates leak', async () => {
      const templates = await apiFetch('/api/templates');
      const list = templates.body.data.templates || [];
      assert(list.length >= 3, 'Expected at least three public templates');
      assert(list.every((template) => !/pro|enterprise|billing/i.test(`${template.id} ${template.name}`)), 'Commercial templates should not be public');
      return { templates: list.map((template) => template.id) };
    });

    await check('Phase 1 / Project Agent', 'Create a real persisted project through Project Agent confirmation', createAcceptanceProject);

    await check('Phase 0-2 / Workflow Generation', 'Regenerate workflow and assets for the acceptance project', regenerateWorkflow);

    await check('Context Pack', 'Save, summarize, and refresh impact with security boundary', async () => {
      await apiFetch(`/api/projects/${projectId}/context-pack`, {
        method: 'PUT',
        body: JSON.stringify({
          team_roles: ['Product Owner', 'Tech Lead', 'QA Lead', 'Release Manager'],
          approval_process: ['Tech Lead Review', 'Release Manager Approval'],
          tool_stack: ['GitHub', 'npm', 'Playwright', 'BoundaryML Studio'],
          risk_constraints: ['No production deployment without human approval', 'No production secrets in sandbox'],
          historical_process_materials: 'Acceptance runbook v1',
        }),
      });
      const summary = await apiFetch(`/api/projects/${projectId}/context-pack/summarize`, { method: 'POST' });
      assert(summary.body.data.summary.security_boundary.secret_policy, 'Summary should include security boundary');
      const impact = await apiFetch(`/api/projects/${projectId}/context-pack/refresh-impact`, { method: 'POST' });
      assert(impact.body.data.affected_nodes.length > 0, 'Impact should include affected nodes');
      assert(impact.body.data.affected_assets.length > 0, 'Impact should include affected assets');
      return { summary_source: summary.body.data.summary.summary_source, affected_nodes: impact.body.data.affected_nodes.length, affected_assets: impact.body.data.affected_assets.length };
    });

    await check('Phase 4 / Agent Sandbox Tab', 'Persist Agent Execution Plan, Sandbox Contract, Promotion Gate, and Evidence Template', configureAgentSandboxDirectly);

    await check('Phase 8 / Workflow Agent', 'Generate, apply, and reject natural-language Agent/Sandbox diffs', exerciseWorkflowAgent);

    await check('Phase 5 / Execution Assets', 'Read, regenerate, edit, and protect generated assets', exerciseAssets);

    await check('Phase 6 / Execution Kit', 'Preview, generate, and download Agent-ready Final Kit', exerciseExecutionKit);

    await check('Phase 2 / Jobs and History', 'Exercise workflow versioning, undo, history, jobs, and retry', exerciseHistoryAndJobs);

    await check('Storage / Traceability', 'Restart server and verify persisted project plus model-call logs', async () => verifyPersistence(serverChild));

    await check('Phase Plan / Release Hardening', 'Phase 0-9 statuses are all complete and check script guards them', async () => {
      const phasePlan = readFileSync(join(rootDir, 'docs/open-source-phase-plan.md'), 'utf-8');
      const rows = [...phasePlan.matchAll(/^\| Phase (\d+) \|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|/gm)]
        .map((match) => ({ phase: Number(match[1]), status: match[2].trim() }))
        .filter((row) => row.phase >= 0 && row.phase <= 9);
      assert(rows.length === 10, 'Phase 0-9 rows should exist');
      assert(rows.every((row) => row.status === '完成'), `Incomplete rows: ${JSON.stringify(rows.filter((row) => row.status !== '完成'))}`);
      const checkScript = readFileSync(join(rootDir, 'scripts/check.js'), 'utf-8');
      assert(checkScript.includes('Phase 0-9 Current status should all be 完成'), 'scripts/check.js should guard phase completion status');
      return { phases: rows.map((row) => `Phase ${row.phase}: ${row.status}`) };
    });

    writeReport('passed');
    console.log(`✅ open-source acceptance passed: ${latestReportPath}`);
  } finally {
    fakeModelServer.close();
    await stopAll();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
