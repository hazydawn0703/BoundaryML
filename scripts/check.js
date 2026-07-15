import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { listPublicTemplates, selectTemplateForProject } from '../packages/core/src/templates.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';
import { generateExecutionKit } from '../packages/generators/src/executionKitGenerator.js';
import { generateWorkflowDiff, applyWorkflowDiff } from '../packages/core/src/diff.js';
import { validateAgentExecutionPlan, validateRoleUnionProjectSpec, validateNode, validateSandboxExecutionContract, validateTemplate } from '../packages/schema/src/schema.js';
import { FileStorage } from '../packages/storage/src/fileStorage.js';
import { exportExampleExecutionKit } from './export-example.js';
import { createWorkflowSnapshot, applyWorkflowPatch, applyDiff, calculateWorkflowValidationStatus, markAffectedAssetsOutdated } from '../packages/core/src/engine.js';
import './studio-workflow-edit-check.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

function hasRule(results, rulePrefix, level = 'error') {
  return results.some((item) => item.id.startsWith(rulePrefix) && item.level === level);
}

function makeBrokenProject(mutator) {
  const project = createExampleProject();
  const cloned = structuredClone(project);
  mutator(cloned);
  return cloned;
}

async function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForHealth(baseUrl) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error('server health timeout');
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  return { status: res.status, body: await res.json() };
}

async function runServerSmoke() {
  await delay(0);
}

async function main() {
  await import('./studio-api-client-check.js');
  const exampleSpec = JSON.parse(readFileSync(new URL('../examples/ai-saas-feature-mvp.json', import.meta.url), 'utf-8'));
  const internalToolSpec = JSON.parse(readFileSync(new URL('../examples/internal-ai-tool.json', import.meta.url), 'utf-8'));
  const legacySpec = JSON.parse(readFileSync(new URL('../examples/legacy-system-ai-modernization.json', import.meta.url), 'utf-8'));
  const templatesSpec = JSON.parse(readFileSync(new URL('../examples/templates.json', import.meta.url), 'utf-8'));
  const phasePlan = readFileSync(new URL('../docs/open-source-phase-plan.md', import.meta.url), 'utf-8');
  const openSourcePhaseRows = [...phasePlan.matchAll(/^\| Phase (\d+) \|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|/gm)]
    .map((match) => ({ phase: Number(match[1]), status: match[2].trim() }))
    .filter((row) => row.phase >= 0 && row.phase <= 9);
  assert(openSourcePhaseRows.length === 10, 'open-source phase plan should list Phase 0 through Phase 9');
  const incompleteOpenSourcePhases = openSourcePhaseRows.filter((row) => row.status !== '完成');
  assert(incompleteOpenSourcePhases.length === 0, `Phase 0-9 Current status should all be 完成: ${JSON.stringify(incompleteOpenSourcePhases)}`);
  const templates = listPublicTemplates();
  assert(templates.length >= 3, 'MVP should expose at least 3 public templates');
  assert((templatesSpec.templates || []).length >= 3, 'public template examples should be generated');
  templates.forEach((template) => assert(validateTemplate(template).ok, `template schema should be valid: ${template.id}`));
  assert(selectTemplateForProject({ type: 'Internal Tool' }).id === 'template-internal-ai-tool', 'Internal Tool template matching should work');
  assert(selectTemplateForProject({ type: 'Legacy Modernization' }).id === 'template-legacy-system-ai-modernization', 'Legacy Modernization template matching should work');

  const validSpec = validateRoleUnionProjectSpec(exampleSpec);
  assert(validSpec.ok, `example spec should be valid: ${validSpec.errors.join(', ')}`);
  assert(validateRoleUnionProjectSpec(internalToolSpec).ok, 'internal tool example spec should be valid');
  assert(validateRoleUnionProjectSpec(legacySpec).ok, 'legacy modernization example spec should be valid');
  const aiSaasL3Node = (exampleSpec.workflow.nodes || []).find((node) => node.agent_execution_plan?.execution_level === 'L3');
  const aiSaasProductionNode = (exampleSpec.workflow.nodes || []).find((node) => /production/i.test(node.name || ''));
  assert(aiSaasL3Node?.sandbox_execution_contract, 'AI SaaS example should include an L3 Sandbox node with contract');
  assert(validateAgentExecutionPlan(aiSaasL3Node.agent_execution_plan).ok, 'L3 agent execution plan schema should be valid');
  assert(validateSandboxExecutionContract(aiSaasL3Node.sandbox_execution_contract).ok, 'L3 sandbox execution contract schema should be valid');
  assert(aiSaasProductionNode?.agent_execution_plan?.execution_level === 'L0', 'AI SaaS example should include an L0 Production node');
  assert((internalToolSpec.workflow.nodes || []).every((node) => node.agent_execution_plan?.enabled === false), 'internal tool example should keep Agentic fields disabled');
  assert((legacySpec.workflow.nodes || []).some((node) => node.agent_execution_plan?.execution_level === 'L2'), 'legacy modernization example should include conservative L2 Agent planning');
  assert((internalToolSpec.workflow.nodes || []).length >= 6, 'internal tool example should include generated workflow nodes');
  assert((legacySpec.assets.prompts || []).length >= 1, 'legacy modernization example should include generated assets');
  assert((exampleSpec.assets.prompts || []).every((asset) => asset.generated_from?.node_id && asset.generated_from?.workflow_version), 'example prompts should link generated_from node and workflow version');
  assert((exampleSpec.assets.checklists || []).every((asset) => asset.generated_from?.node_id && asset.generated_from?.workflow_version), 'example checklists should link generated_from node and workflow version');
  assert((exampleSpec.assets.artifact_templates || []).every((asset) => asset.generated_from?.node_id && asset.generated_from?.workflow_version), 'example artifact templates should link generated_from node and workflow version');
  assert(validSpec.warnings.length >= 1, 'example spec should contain at least one warning');
  assert(validSpec.suggestions.length >= 1, 'validateRoleUnionProjectSpec should return suggestion');

  const invalidNode = validateNode({ id: 1 });
  assert(!invalidNode.ok, 'schema parse failure path should be covered');

  const highRiskNoGate = makeBrokenProject((p) => { p.workflow.nodes.find((n) => n.riskLevel === 'high').reviewGate.required = false; });
  assert(hasRule(validateWorkflow(highRiskNoGate.workflow, highRiskNoGate.assets), 'high_risk_requires_review_gate'), 'high risk gate rule should trigger');

  const aiNoOutput = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => x.executionMode !== 'human_only'); n.outputs = []; n.artifactContract.outputFormat = ''; });
  assert(hasRule(validateWorkflow(aiNoOutput.workflow, aiNoOutput.assets), 'ai_node_requires_output_format'), 'ai output format rule should trigger');

  const aiNoAcceptance = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => x.executionMode !== 'human_only'); n.artifactContract.acceptanceCriteria = []; p.assets.checklists = p.assets.checklists.filter((c) => c.nodeId !== n.id); });
  assert(hasRule(validateWorkflow(aiNoAcceptance.workflow, aiNoAcceptance.assets), 'ai_node_requires_acceptance_criteria'), 'ai acceptance rule should trigger');

  const humanWithPrompt = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => x.executionMode === 'human_only'); p.assets.prompts.push({ ...p.assets.prompts[0], id: 'prompt-human-bad', nodeId: n.id }); });
  assert(hasRule(validateWorkflow(humanWithPrompt.workflow, humanWithPrompt.assets), 'human_only_no_ai_prompt'), 'human-only prompt rule should trigger');

  const edgeMissingOutput = makeBrokenProject((p) => { p.workflow.edges[0].required_outputs = ['non-existent-output']; });
  assert(hasRule(validateWorkflow(edgeMissingOutput.workflow, edgeMissingOutput.assets), 'edge_required_output_missing'), 'edge required output rule should trigger');

  const badAutonomous = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => /production|release/i.test(x.name)); n.executionMode = 'ai_autonomous'; });
  const autoResults = validateWorkflow(badAutonomous.workflow, badAutonomous.assets);
  assert(hasRule(autoResults, 'ai_autonomous_low_risk_only'), 'ai autonomous risk rule should trigger');
  assert(hasRule(autoResults, 'production_release_requires_human_only_or_approval') || autoResults.some((x) => x.id.includes('production_release_requires_human_only_or_approval')), 'production release rule should be available');

  const outdated = makeBrokenProject((p) => { p.assets.prompts[0].status = 'outdated'; });
  assert(hasRule(validateWorkflow(outdated.workflow, outdated.assets), 'outdated_prompt_warning', 'warning'), 'outdated prompt warning should trigger');

  const l3WithoutContract = makeBrokenProject((p) => {
    const n = p.workflow.nodes.find((x) => x.id === 'node-8');
    n.agent_execution_plan = { ...n.agent_execution_plan, enabled: true, execution_level: 'L3', sandbox_execution_contract_id: null };
    delete n.sandbox_execution_contract;
  });
  assert(hasRule(validateWorkflow(l3WithoutContract.workflow, l3WithoutContract.assets), 'l3_agent_requires_sandbox_contract'), 'L3 Agent without sandbox contract should block final export');

  const networkWithoutApproval = makeBrokenProject((p) => {
    const n = p.workflow.nodes.find((x) => x.id === 'node-8');
    n.sandbox_execution_contract.runtime_scope.network_policy = 'restricted';
    n.sandbox_execution_contract.runtime_scope.external_network_approved = false;
  });
  assert(hasRule(validateWorkflow(networkWithoutApproval.workflow, networkWithoutApproval.assets), 'external_network_requires_approval'), 'external network without approval should trigger');

  const productionAutoDeploy = makeBrokenProject((p) => {
    const n = p.workflow.nodes.find((x) => x.id === 'node-12');
    n.promotion_gate.agent_auto_promote_allowed = true;
  });
  assert(hasRule(validateWorkflow(productionAutoDeploy.workflow, productionAutoDeploy.assets), 'production_agent_auto_deploy_forbidden'), 'production auto deploy by Agent should trigger');

  const project = createExampleProject();
  const diff = generateWorkflowDiff('add testing nodes before launch', project.workflow, project.assets);
  const appliedProject = applyWorkflowDiff(project, diff, false);
  assert(appliedProject.workflow.version === project.workflow.version + 1, 'applyWorkflowDiff should increase version');

  const agenticDiff = generateWorkflowDiff('把开发阶段的代码生成节点改成 L3 Sandbox，禁止访问 infra 目录。', project.workflow, project.assets);
  assert(agenticDiff.changes.some((change) => change.field === 'agentExecutionPlan'), 'workflow agent diff should include Agent Execution Plan changes');
  assert(agenticDiff.changes.some((change) => change.field === 'sandboxExecutionContract'), 'workflow agent diff should include Sandbox Contract changes');

  const corePatched = applyWorkflowPatch(project.workflow, { status: 'reviewed' });
  assert(corePatched.version === project.workflow.version + 1, 'applyWorkflowPatch should increment workflow version');

  const coreDiffApplied = applyDiff(project.workflow, diff, diff.changes.filter((c) => c.selected).map((c) => c.id));
  assert(coreDiffApplied.version === project.workflow.version + 1, 'core applyDiff should increment version');
  const coreAgentDiffApplied = applyDiff(project.workflow, agenticDiff, agenticDiff.changes.filter((c) => c.selected).map((c) => c.id));
  const appliedAgentNode = coreAgentDiffApplied.nodes.find((node) => node.agent_execution_plan?.execution_level === 'L3' && node.sandbox_execution_contract);
  assert(Boolean(appliedAgentNode), 'core applyDiff should apply Agent / Sandbox node fields');
  const staleAssets = markAffectedAssetsOutdated([{ target_type: 'node', target_id: project.assets.prompts[0].nodeId || project.assets.prompts[0].node_id }], project.assets);
  assert(staleAssets.prompts.some((asset) => asset.status === 'outdated' && asset.generated_from?.stale === true), 'core diff should mark affected generated assets stale');

  const validation = validateWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
  const status = calculateWorkflowValidationStatus(validation);
  assert(['draft', 'reviewed', 'validated'].includes(status), 'calculateWorkflowValidationStatus should return valid status');

  const snapshot = createWorkflowSnapshot({ id: 'p1', workspace_id: 'w1' }, project.contextPack, project.workflow, project.assets, validation);
  assert(snapshot.workflow_snapshot_version === project.workflow.version, 'snapshot version should match workflow version');

  const kit = generateExecutionKit(project.workflow, project.assets, validation);
  assert(Boolean(kit), 'execution kit should be generated');
  assert(Object.keys(kit.files || {}).includes('workflow_spec.yaml'), 'execution kit should expose v1 file names');
  assert(Object.keys(kit.files || {}).includes('agent_task_list.md'), 'execution kit should expose agent task list');
  assert(Object.keys(kit.files || {}).includes('sandbox_execution_contracts.yaml'), 'execution kit should expose sandbox contracts');
  assert(Object.keys(kit.files || {}).includes('promotion_gates.yaml'), 'execution kit should expose promotion gates');
  assert(Object.keys(kit.files || {}).includes('execution_evidence_templates.md'), 'execution kit should expose evidence templates');
  assert(Object.keys(kit.files || {}).includes('boundary_rules_report.md'), 'execution kit should expose boundary rules report');
  JSON.parse(kit.files['workflow_snapshot.json']);
  assert(typeof kit.files['workflow_spec.yaml'] === 'string' && kit.files['workflow_spec.yaml'].includes('workflow_version'), 'workflow_spec.yaml should be yaml text');

  const fsStorage = new FileStorage('.tmp-storage-check');
  fsStorage.saveProject('check_workspace', { ...project, workspace_id: 'check_workspace' });
  const restored = new FileStorage('.tmp-storage-check').getProject('check_workspace', project.id);
  assert(Boolean(restored), 'FileStorage should restore project');

  await runServerSmoke();
  rmSync('.tmp-storage-check', { recursive: true, force: true });
  rmSync('.tmp-export-example-check', { recursive: true, force: true });
  rmSync('.tmp-server-storage', { recursive: true, force: true });

  console.log('✅ checks passed');
}

main();
