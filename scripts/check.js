import { createExampleProject } from '../src/domain/sampleProject.js';
import { validateWorkflow } from '../src/services/validationEngine.js';
import { generateExecutionKit } from '../src/services/executionKitGenerator.js';

const project = createExampleProject();

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

assert(project.workflow.nodes.length >= 12, 'example workflow should contain at least 12 nodes');

const broken = structuredClone(project);
const highRiskNode = broken.workflow.nodes.find((n) => n.riskLevel === 'high');
highRiskNode.reviewGate.required = false;

const humanOnlyNode = broken.workflow.nodes.find((n) => n.executionMode === 'human_only');
broken.assets.prompts.push({ id: 'prompt-bad', nodeId: humanOnlyNode.id, name: 'invalid', status: 'draft', content: '' });

const autonomousNode = broken.workflow.nodes.find((n) => n.executionMode !== 'human_only');
autonomousNode.executionMode = 'ai_autonomous';
autonomousNode.riskLevel = 'high';

const validation = validateWorkflow(broken.workflow, broken.assets);

assert(validation.some((r) => r.id.includes('high_risk_requires_review_gate')), 'should detect high-risk missing review gate');
assert(validation.some((r) => r.id.includes('human_only_no_ai_prompt')), 'should detect human-only node with prompt');
assert(validation.some((r) => r.id.includes('ai_autonomous_low_risk_only')), 'should detect autonomous high-risk violation');

const kit = generateExecutionKit(project.workflow, project.assets, validateWorkflow(project.workflow, project.assets));
assert(kit.files.workflowSpec && kit.files.promptPack, 'execution kit generator should produce preview files');

console.log('✅ checks passed');
