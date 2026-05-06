import { EXECUTION_MODES, AI_EDIT_SUGGESTIONS } from '../../../packages/schema/src/constants.js';
import { getState, setState, subscribe, getActiveProject, replaceActiveProject, recomputeValidation, setRuntimeMode } from './state/store.js';
import { apiClient } from './api-client/index.js';
import {
  modelGenerateWorkflowDraft,
  recommendExecutionMode,
  modelGeneratePrompt,
  modelGenerateChecklist,
  modelGenerateWorkflowDiff,
  modelGenerateExecutionKit,
  buildContextSummary,
} from './services/mockModelService.js';
import { applyWorkflowDiff } from '../../../packages/core/src/diff.js';

const app = document.getElementById('app');

function countProjectStats(project) {
  const nodes = project.workflow.nodes;
  return {
    nodes: nodes.length,
    aiNodes: nodes.filter((node) => EXECUTION_MODES[node.executionMode]?.ai).length,
    gates: nodes.filter((node) => node.reviewGate?.required).length,
  };
}

function markProjectWorkflowChanged(project, reason, affectedNodeIds = []) {
  project.workflow.updatedAt = new Date().toISOString();
  if (project.executionKit && project.executionKit.snapshotVersion !== project.workflow.version) {
    project.executionKit.status = 'stale';
    project.executionKit.canExportFinal = false;
  }

  if (affectedNodeIds.length) {
    project.assets.prompts = project.assets.prompts.map((asset) => (
      affectedNodeIds.includes(asset.nodeId)
        ? { ...asset, status: 'outdated', outdatedReason: reason }
        : asset
    ));
    project.assets.checklists = project.assets.checklists.map((asset) => (
      affectedNodeIds.includes(asset.nodeId)
        ? { ...asset, status: 'outdated', outdatedReason: reason }
        : asset
    ));

    project.workflow.nodes.forEach((node) => {
      if (affectedNodeIds.includes(node.id)) {
        node.promptStatus = node.executionMode === 'human_only' ? 'missing' : 'outdated';
        node.checklistStatus = 'outdated';
      }
    });
  }
}

function badge(text, cls = '') {
  return `<span class="badge ${cls}">${text}</span>`;
}

function renderSidebar(state) {
  const pages = [
    ['projects', 'Projects'],
    ['create', 'Create Project'],
    ['context', 'Context Pack'],
    ['studio', 'Studio'],
    ['assets', 'Execution Assets'],
    ['export', 'Export'],
    ['settings', 'Settings'],
  ];

  return `<aside class="sidebar"><div class="logo">Boundary<span>ML</span></div>
    <nav>${pages.map(([id, label]) => `<button class="nav-item ${state.currentPage === id ? 'active' : ''}" data-action="goto" data-page="${id}">${label}</button>`).join('')}</nav>
  </aside>`;
}

function renderTopbar(state) {
  const project = getActiveProject(state);
  const stats = project ? countProjectStats(project) : { nodes: 0, aiNodes: 0, gates: 0 };
  const runtimeBadge = state.serverAvailable
    ? `<span class="badge">Mode: Local Server</span>`
    : `<span class="badge risk-high">Mode: Local Demo / Mock Model</span>`;
  return `<header class="topbar"><div><h1>${project?.name || 'BoundaryML'}</h1><p>Workflow ${project?.workflow?.status || 'draft'} · ${stats.nodes} Nodes · ${stats.aiNodes} AI Nodes · ${stats.gates} Review Gates</p></div>
  <div class="row">${runtimeBadge}<button class="primary" data-action="goto" data-page="export">Generate Execution Kit</button></div></header>`;
}

function renderProjects(state) {
  if (!state.projects.length) {
    return `<section class="page"><div class="card panel"><h2>Projects</h2><p>Start with a project goal.<br/>BoundaryML will generate a human-AI workflow boundary draft.</p><button class="primary" data-action="goto" data-page="create">Create First Project</button></div></section>`;
  }
  return `<section class="page"><div class="page-head"><h2>Projects</h2><button class="primary" data-action="goto" data-page="create">+ New Project</button></div>
  <p class="muted">Data-driven projects powered by BoundaryML domain model.</p>
  <div class="project-grid">${state.projects.map((project) => {
    const stats = countProjectStats(project);
    return `<article class="card project"><h3>${project.name}</h3><p>${project.project_type || project.type} · ${(project.risk_level || project.riskLevel)} risk · ${(project.workflow?.status || 'draft')}</p>
      <div class="kv-row"><span>Nodes ${stats.nodes}</span><span>AI ${stats.aiNodes}</span><span>Gates ${stats.gates}</span></div>
      <div class="kv-row"><span>Stage</span><strong>${project.current_stage || project.currentStage || 'n/a'}</strong></div>
      <div class="kv-row"><span>Execution Kit</span><strong>${project.execution_kit?.status || project.executionKit?.status || 'not generated'}</strong></div>
      <button data-action="open-project" data-project-id="${project.id}">Open Studio</button></article>`;
  }).join('')}</div></section>`;
}

function renderCreatePage() {
  return `<section class="page"><h2>Create Project</h2>
  <form class="card form" data-form="create-project">
    <div class="grid-2">
      <label>Project Name<input name="name" value="AI SaaS Feature MVP v2" required/></label>
      <label>Project Goal<input name="goal" value="Deliver AI feature with explicit review gates" required/></label>
      <label>Project Type<select name="type"><option>AI Feature</option><option>Internal Tool</option><option>Legacy Modernization</option></select></label>
      <label>Current Stage<input name="currentStage" value="Planning" required/></label>
      <label>Target Deliverables<input name="deliveryScope" value="PRD,Prototype,Technical Design,API Contract,Source Code,Test Cases,Launch Plan"/></label>
      <label>Expected AI Scope<input name="expectedAiScope" value="PRD,Code,Test,Docs,Review"/></label>
      <label>Sensitive Areas<input name="sensitiveAreas" value="Customer Data,Production Release,Security"/></label>
      <label>Risk Level<select name="riskLevel"><option>low</option><option selected>medium</option><option>high</option></select></label>
      <label>Setup Mode<select name="setupMode"><option value="quick_start">Quick Start</option><option value="org_aware">Organization-Aware Setup</option></select></label>
    </div>
    <div class="actions"><button type="submit" class="primary">Generate Workflow Draft</button></div>
  </form></section>`;
}

function renderContextPage(state) {
  const project = getActiveProject(state);
  const summary = project?.contextPack?.summary;
  return `<section class="page"><h2>Context Pack</h2>
  <div class="split-2"><form class="card form" data-form="context-pack">
    <label>Team Roles<textarea name="teamRoles">${project?.contextPack?.teamRoles?.join(', ') || ''}</textarea></label>
    <label>Approval Process<textarea name="approvalProcess">${project?.contextPack?.approvalProcess?.join(', ') || ''}</textarea></label>
    <label>Tool Stack<textarea name="toolStack">${project?.contextPack?.toolStack?.join(', ') || ''}</textarea></label>
    <label>Risk Constraints<textarea name="riskConstraints">${project?.contextPack?.riskConstraints?.join(', ') || ''}</textarea></label>
    <label>Historical Process Materials<textarea name="historicalProcessMaterials">${project?.contextPack?.historicalProcessMaterials || ''}</textarea></label>
    <div class="actions"><button type="button" data-action="build-context-summary">Generate / Refresh Summary</button><button type="submit" class="primary">Generate Workflow Draft</button></div>
  </form>
  <article class="card panel"><h3>Context Summary</h3>
    ${summary ? `<h4>Recognized Roles</h4><ul>${summary.recognizedRoles.map((x) => `<li>${x}</li>`).join('')}</ul>
    <h4>Suggested Review Gates</h4><ul>${summary.suggestedReviewGates.map((x) => `<li>${x}</li>`).join('')}</ul>
    <h4>Missing Context</h4><ul>${summary.missingContext.map((x) => `<li>${x}</li>`).join('')}</ul>
    <h4>Risk Warnings</h4><ul>${summary.riskWarnings.map((x) => `<li>${x}</li>`).join('')}</ul>` : '<p class="muted">No summary yet.</p>'}
  </article></div></section>`;
}

function filteredNodes(state, project) {
  const modeFilter = state.studioFilter?.mode || 'all';
  const riskFilter = state.studioFilter?.risk || 'all';
  return project.workflow.nodes.map((node) => ({
    ...node,
    muted: (modeFilter !== 'all' && node.executionMode !== modeFilter) || (riskFilter !== 'all' && node.riskLevel !== riskFilter),
  }));
}

function renderNodeCard(node, selected) {
  const mode = EXECUTION_MODES[node.executionMode];
  return `<button class="node-card ${selected ? 'selected' : ''} ${node.muted ? 'muted-node' : ''}" data-action="select-node" data-node-id="${node.id}">
    <div class="node-head"><strong>${node.name}</strong>${badge(node.riskLevel, `risk-${node.riskLevel}`)}</div>
    <div class="mode-pill" style="border-color:${mode.color};color:${mode.color}">${mode.label}</div>
    <div class="meta">Gate: ${node.reviewGate?.name || 'none'} · Owner: ${node.humanOwnerRole || 'n/a'}</div>
    <div class="meta">Prompt: ${node.promptStatus} · Status: ${node.status}</div>
    <div class="meta">In: ${(node.inputs || []).join(', ') || 'none'} · Out: ${(node.outputs || []).join(', ') || 'none'}</div>
  </button>`;
}

function renderEdgeHints(project, phaseNodes) {
  const ids = phaseNodes.map((n) => n.id);
  return project.workflow.edges.filter((edge) => ids.includes(edge.from)).map((edge) => {
    const to = project.workflow.nodes.find((n) => n.id === edge.to);
    return `<li>${project.workflow.nodes.find((n) => n.id === edge.from)?.name} → ${to?.name || edge.to}</li>`;
  }).join('');
}

function renderNodeDetail(state, project, node) {
  if (!node) return '<div class="card panel">Select a node</div>';
  const tab = state.activeNodeDetailTab;
  const upstream = project.workflow.edges.filter((edge) => edge.to === node.id).map((edge) => project.workflow.nodes.find((n) => n.id === edge.from)?.name).filter(Boolean);
  const downstream = project.workflow.edges.filter((edge) => edge.from === node.id).map((edge) => project.workflow.nodes.find((n) => n.id === edge.to)?.name).filter(Boolean);
  const rules = state.validationResults.filter((item) => item.targetId === node.id || item.targetId === `prompt-${node.id}`);

  const tabNav = ['overview', 'boundary', 'io', 'gate', 'assets', 'history'].map((t) => `<button class="tab ${tab === t ? 'active' : ''}" data-action="node-tab" data-tab="${t}">${t}</button>`).join('');
  const prompt = project.assets.prompts.find((item) => item.nodeId === node.id);
  const checklist = project.assets.checklists.find((item) => item.nodeId === node.id);

  const body = {
    overview: `<p><strong>${node.name}</strong></p><p>${node.goal}</p><p>Phase: ${project.workflow.phases.find((p) => p.id === node.phaseId)?.name}</p><p>Status: ${node.status} · Risk: ${node.riskLevel}</p><p>Upstream: ${upstream.join(', ') || 'none'}</p><p>Downstream: ${downstream.join(', ') || 'none'}</p><button data-action="delete-node" data-node-id="${node.id}">Delete Node</button>`,
    boundary: `<label>Execution Mode<select data-action="update-node-field" data-field="executionMode" data-node-id="${node.id}">${Object.entries(EXECUTION_MODES).map(([k, v]) => `<option value="${k}" ${node.executionMode === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <label>Human Owner<input data-action="update-node-field" data-field="humanOwnerRole" data-node-id="${node.id}" value="${node.humanOwnerRole}"/></label>
    <label>AI Role<input data-action="update-node-field" data-field="aiRole" data-node-id="${node.id}" value="${node.aiRole || ''}"/></label>
    <button data-action="recommend-mode" data-node-id="${node.id}">Recommend Execution Mode</button>${rules.map((r) => `<p class="inline-${r.level}">${r.title}</p>`).join('')}`,
    io: `<label>Inputs<textarea data-action="update-node-field" data-field="inputs" data-node-id="${node.id}">${node.inputs.join('\n')}</textarea></label>
    <label>Outputs<textarea data-action="update-node-field" data-field="outputs" data-node-id="${node.id}">${node.outputs.join('\n')}</textarea></label>
    <label>Artifact Output<input data-action="update-artifact-format" data-node-id="${node.id}" value="${node.artifactContract?.outputFormat || ''}"/></label>`,
    gate: `<p><strong>${node.reviewGate?.name || 'Missing Review Gate'}</strong></p>
    <label>Reviewer<input data-action="update-gate-field" data-node-id="${node.id}" data-field="reviewerRole" value="${node.reviewGate?.reviewerRole || ''}"/></label>
    <label>Criteria<textarea data-action="update-gate-field" data-node-id="${node.id}" data-field="criteria">${(node.reviewGate?.criteria || []).join('\n')}</textarea></label>
    <label class="check"><input type="checkbox" data-action="toggle-gate-required" data-node-id="${node.id}" ${node.reviewGate?.required ? 'checked' : ''}/>Required</label>`,
    assets: node.executionMode === 'human_only'
      ? `<p>Human-only node: no AI prompt.</p><pre>${(checklist?.items || []).join('\n')}</pre>`
      : `<label>Prompt<textarea data-action="update-prompt-content" data-node-id="${node.id}">${prompt?.content || ''}</textarea></label>
      <p>Status: ${prompt?.status || 'missing'} ${prompt?.outdatedReason ? `· ${prompt.outdatedReason}` : ''}</p>
      <button data-action="generate-prompt" data-node-id="${node.id}">${prompt ? 'Regenerate Prompt' : 'Generate Prompt'}</button>`,
    history: `<ul>${node.history.map((h) => `<li>${h.at}: ${h.action}</li>`).join('')}</ul>`,
  };

  return `<article class="card panel"><h3>Node Detail</h3><div class="tabs">${tabNav}</div><div class="tab-body">${body[tab]}</div></article>`;
}

function renderStudio(state) {
  const project = getActiveProject(state);
  const nodes = filteredNodes(state, project);
  const selectedNode = project.workflow.nodes.find((node) => node.id === state.selectedNodeId) || project.workflow.nodes[0];
  const summary = {
    errors: state.validationResults.filter((x) => x.level === 'error').length,
    warnings: state.validationResults.filter((x) => x.level === 'warning').length,
  };

  const recentJobs = (state.jobs || []).slice(0, 3);
  return `<section class="page"><div class="toolbar card"><div><strong>${project.name}</strong><p class="muted">v${project.workflow.version} · ${project.workflow.status}</p></div>
    <div class="row"><button data-action="add-node">Add Node</button><button data-action="undo-workflow">Undo</button><button data-action="toggle-history">History</button><button data-action="validate">Validate</button><button class="primary" data-action="goto" data-page="export">Generate Execution Kit</button></div></div>
  ${state.serverAvailable ? '' : '<div class="card panel inline-warning">Mode: Local Demo / Mock Model</div>'}
  ${state.serverError ? `<div class="card panel inline-error">${state.serverError}</div>` : ''}
  <div class="studio-grid">
    <aside class="card panel"><h3>Filters & Legend</h3>
      <label>Execution Mode<select data-action="set-filter-mode"><option value="all">All</option>${Object.entries(EXECUTION_MODES).map(([k, v]) => `<option value="${k}" ${(state.studioFilter?.mode || 'all') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label>Risk<select data-action="set-filter-risk"><option value="all">All</option>${['low', 'medium', 'high'].map((x) => `<option value="${x}" ${(state.studioFilter?.risk || 'all') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <p>Validation: ${summary.errors} errors, ${summary.warnings} warnings</p>
      <ul>${state.validationResults.slice(0, 4).map((x) => `<li class="inline-${x.level}">${x.title}</li>`).join('')}</ul>
      <h4>Phases</h4><ul>${project.workflow.phases.map((p) => `<li>${p.name}</li>`).join('')}</ul>
    </aside>
    <div class="card canvas">${project.workflow.phases.map((phase) => {
      const phaseNodes = nodes.filter((node) => node.phaseId === phase.id);
      return `<div class="lane"><h4>${phase.name}</h4><button data-action="add-node-phase" data-phase-id="${phase.id}">Add Node to this phase</button>${phaseNodes.map((node) => renderNodeCard(node, node.id === selectedNode.id)).join('')}<ul class="edge-hints">${renderEdgeHints(project, phaseNodes)}</ul></div>`;
    }).join('')}</div>
    ${renderNodeDetail(state, project, selectedNode)}
  </div>
  <article class="card panel"><h3>Recent Jobs</h3>
  <ul>${recentJobs.length ? recentJobs.map((job) => `<li>${job.id || job.job_id} · ${job.type} · ${job.status} · ${(job.progress?.stage || 'n/a')}
    <div class="row">
      <button data-action="job-retry" data-job-id="${job.id || job.job_id}">Retry</button>
      <button data-action="job-cancel" data-job-id="${job.id || job.job_id}" ${job.status === 'succeeded' ? 'disabled' : ''}>Cancel</button>
    </div></li>`).join('') : '<li>No jobs yet</li>'}</ul>
  </article>
  ${renderAiEdit(state)}
  ${renderDiffDrawer(state)}
  </section>`;
}

function renderAiEdit(state) {
  if (!state.aiEdit.open) return '';
  return `<div class="drawer"><div class="card panel"><h3>AI Assisted Edit</h3>
    <textarea data-action="set-ai-request" placeholder="Describe edits...">${state.aiEdit.request}</textarea>
    <div class="row">${AI_EDIT_SUGGESTIONS.map((s) => `<button data-action="use-ai-suggestion" data-suggestion="${s}">${s}</button>`).join('')}</div>
    <div class="actions"><button data-action="generate-diff">Generate Diff</button><button data-action="toggle-ai-edit">Close</button></div></div></div>`;
}

function renderDiffDrawer(state) {
  if (!state.aiEdit.diff) return '';
  const diff = state.aiEdit.diff;
  return `<div class="drawer"><div class="card panel"><h3>Diff Review</h3><p>${diff.request}</p>
  <ul>${diff.changes.map((change) => `<li><label class="check"><input type="checkbox" data-action="toggle-diff-change" data-change-id="${change.id}" ${change.selected ? 'checked' : ''}/> <strong>${change.type}</strong> ${change.targetType} ${change.targetId}<br/>Reason: ${change.reason}<br/>Impact: ${change.impact}</label></li>`).join('')}</ul>
  <div class="actions"><button data-action="apply-diff-all" class="primary">Apply All</button><button data-action="apply-diff-selected">Apply Selected</button><button data-action="reject-diff">Reject All</button></div></div></div>`;
}

async function refreshProjectRuntime(projectId) {
  const [workflowResult, jobsResult, assetsResult, historyResult] = await Promise.all([
    apiClient.workflowApi.get(projectId),
    apiClient.jobsApi.list(projectId),
    apiClient.assetsApi.list(projectId),
    apiClient.workflowApi.history(projectId),
  ]);
  const workflowEnvelope = workflowResult.data?.workflow || workflowResult.data || {};
  const workflow = workflowEnvelope.workflow || workflowEnvelope;
  updateActiveProject((draft) => {
    draft.workflow = workflow;
    draft.assets = workflowEnvelope.assets || assetsResult.data?.assets || assetsResult.data || draft.assets;
  });
  setState((prev) => ({ ...prev, jobs: jobsResult.data?.jobs || jobsResult.data || [], validationResults: workflowEnvelope.validation || prev.validationResults, workflowHistory: historyResult.data || [] }));
}

function getFilteredAssets(state, project) {
  const { type = 'prompt', phase = 'all', status = 'all' } = state.assetsFilter || {};
  const source = type === 'prompt' ? project.assets.prompts : type === 'checklist' ? project.assets.checklists : project.assets.artifactTemplates;
  return source.filter((asset) => (phase === 'all' || asset.phaseId === phase) && (status === 'all' || asset.status === status));
}

function renderAssetDetail(project, state) {
  const { type, id } = state.selectedAsset || {};
  if (!id) return 'Select asset from list.';
  const source = type === 'prompt' ? project.assets.prompts : type === 'checklist' ? project.assets.checklists : project.assets.artifactTemplates;
  const asset = source.find((item) => item.id === id);
  if (!asset) return 'Asset not found';

  if (type === 'prompt') {
    return `<p><strong>${asset.name}</strong></p><p>Status: ${asset.status}</p>${asset.outdatedReason ? `<p class="inline-warning">Reason: ${asset.outdatedReason}</p>` : ''}
      <textarea data-action="edit-asset-prompt" data-asset-id="${asset.id}">${asset.content}</textarea>
      <div class="actions">${asset.status === 'outdated' ? `<button data-action="regenerate-asset-prompt" data-asset-id="${asset.id}">Regenerate</button>` : ''}</div>`;
  }
  if (type === 'checklist') return `<p><strong>${asset.name}</strong></p><pre>${asset.items.join('\n')}</pre>`;
  return `<p><strong>${asset.name}</strong></p><pre>${asset.content}</pre>`;
}

function renderAssets(state) {
  const project = getActiveProject(state);
  const currentType = state.assetsFilter?.type || 'prompt';
  const filtered = getFilteredAssets(state, project);
  return `<section class="page"><h2>Execution Assets</h2>
  <div class="split-2"><article class="card panel"><h3>Asset List</h3>
    <label>Type<select data-action="asset-filter-type"><option value="prompt" ${currentType === 'prompt' ? 'selected' : ''}>Prompts</option><option value="checklist" ${currentType === 'checklist' ? 'selected' : ''}>Checklists</option><option value="template" ${currentType === 'template' ? 'selected' : ''}>Artifact Templates</option></select></label>
    <label>Phase<select data-action="asset-filter-phase"><option value="all">All</option>${project.workflow.phases.map((p) => `<option value="${p.id}" ${(state.assetsFilter?.phase || 'all') === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
    <label>Status<select data-action="asset-filter-status"><option value="all">All</option><option>draft</option><option>reviewed</option><option>outdated</option></select></label>
    <ul>${filtered.filter((asset) => currentType !== 'prompt' || project.workflow.nodes.find((n) => n.id === asset.nodeId)?.executionMode !== 'human_only').map((asset) => `<li><button data-action="select-asset" data-asset-type="${currentType}" data-asset-id="${asset.id}">${asset.name} ${badge(asset.status || 'draft', asset.status || 'draft')}</button></li>`).join('')}</ul>
  </article>
  <article class="card panel"><h3>Asset Detail</h3><div>${renderAssetDetail(project, state)}</div></article></div>
  </section>`;
}

function renderExport(state) {
  const project = getActiveProject(state);
  const preview = project.executionKit;
  return `<section class="page"><h2>Export Execution Kit</h2>
  <p class="muted">Blocking errors => Final kit disabled.</p>
  <div class="split-2"><article class="card panel"><h3>Export Options</h3>
    <div class="actions"><button data-action="generate-kit" class="primary">Generate Preview</button><button data-action="copy-kit">Copy Preview</button><button data-action="refresh-jobs">Refresh Jobs</button></div>
    <p>${preview ? `Kit status: ${preview.status} · snapshot v${preview.snapshotVersion}` : 'No preview yet.'}</p>
    <p>Blocking errors: ${preview?.blockingErrors ?? 'N/A'}</p>
  </article>
  <article class="card panel"><h3>Execution Kit Preview</h3>
    ${preview ? `<div class="tabs">${Object.keys(preview.files).map((k) => `<button class="tab ${state.exportPreviewType === k ? 'active' : ''}" data-action="preview-file" data-file="${k}">${k}</button>`).join('')}</div>
      <pre>${typeof preview.files[state.exportPreviewType] === 'string' ? preview.files[state.exportPreviewType] : JSON.stringify(preview.files[state.exportPreviewType], null, 2)}</pre>
      <div class="actions"><button ${preview.canExportFinal ? '' : 'disabled'}>Export Markdown</button><button ${preview.canExportFinal ? '' : 'disabled'}>Export YAML / JSON</button></div>`
      : '<pre>Generate preview to inspect execution kit artifacts.</pre>'}
  </article></div></section>`;
}

function renderSettings(state) {
  const logs = state.modelCalls || [];
  const modelStatus = state.modelStatus || {};
  const mode = modelStatus?.mode || modelStatus?.model_mode || (state.serverAvailable ? 'unknown' : 'mock');
  return `<section class="page"><h2>Settings / Model Access</h2><div class="card panel">
  <p>Model Mode: ${mode}</p>
  <p>Provider: ${modelStatus.provider || 'n/a'}</p>
  <p>Default Model: ${modelStatus.default_model || modelStatus.defaultModel || 'n/a'}</p>
  <p>Planning Model: ${modelStatus.planning_model || 'n/a'}</p>
  <p>Prompt Model: ${modelStatus.prompt_model || 'n/a'}</p>
  <p>Diff Model: ${modelStatus.diff_model || 'n/a'}</p>
  <p>Structured Output: ${(modelStatus.structured_output_enabled ?? modelStatus.structuredOutputEnabled) ? 'enabled' : 'disabled'}</p>
  <div class="actions"><button data-action="refresh-model-status">Refresh Model Status</button></div>
  <h3>Recent Model Calls</h3><ul>${logs.map((log) => `<li>${log.created_at || log.at} · ${log.purpose || log.name} · ${log.status}</li>`).join('') || '<li>No calls yet</li>'}</ul></div></section>`;
}

function renderPage(state) {
  switch (state.currentPage) {
    case 'projects': return renderProjects(state);
    case 'create': return renderCreatePage();
    case 'context': return renderContextPage(state);
    case 'studio': return renderStudio(state);
    case 'assets': return renderAssets(state);
    case 'export': return renderExport(state);
    case 'settings': return renderSettings(state);
    default: return renderProjects(state);
  }
}

function render() {
  const state = getState();
  app.innerHTML = `<div class="app-shell">${renderSidebar(state)}<div class="main">${renderTopbar(state)}<main>${renderPage(state)}</main></div></div>`;
}

function updateActiveProject(mutator, reason = 'Workflow updated', affectedNodeIds = []) {
  const state = getState();
  const project = getActiveProject(state);
  if (!project) return;
  const updated = structuredClone(project);
  mutator(updated);
  markProjectWorkflowChanged(updated, reason, affectedNodeIds);
  replaceActiveProject(updated);
}

function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'goto') setState((prev) => ({ ...prev, currentPage: target.dataset.page }));
  if (action === 'open-project') {
    const projectId = target.dataset.projectId;
    Promise.all([
      apiClient.projectsApi.getById(projectId),
      apiClient.workflowApi.get(projectId),
      apiClient.jobsApi.list(projectId),
      apiClient.assetsApi.list(projectId),
    ]).then(([projectResult, workflowResult, jobsResult, assetsResult]) => {
      const rawProject = projectResult.data?.project || projectResult.data;
      const workflow = workflowResult.data?.workflow || workflowResult.data || {};
      const jobs = jobsResult.data?.jobs || jobsResult.data || [];
      const assets = assetsResult.data?.assets || assetsResult.data || {};
      const merged = {
        ...rawProject,
        workflow: workflow.workflow || rawProject.workflow || workflow,
        assets: workflow.assets || assets || rawProject.assets || { prompts: [], checklists: [], artifactTemplates: [] },
      };
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => (p.id === projectId ? merged : p)),
        activeProjectId: projectId,
        currentPage: 'studio',
        jobs,
        validationResults: workflow.validation || prev.validationResults,
        selectedNodeId: merged.workflow?.nodes?.[0]?.id || prev.selectedNodeId,
      }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to load project workflow' })));
  }
  if (action === 'select-node') setState((prev) => ({ ...prev, selectedNodeId: target.dataset.nodeId }));
  if (action === 'node-tab') setState((prev) => ({ ...prev, activeNodeDetailTab: target.dataset.tab }));
  if (action === 'set-filter-mode') setState((prev) => ({ ...prev, studioFilter: { ...prev.studioFilter, mode: target.value } }));
  if (action === 'set-filter-risk') setState((prev) => ({ ...prev, studioFilter: { ...prev.studioFilter, risk: target.value } }));

  if (action === 'validate') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.validate(project.id)
      .then(({ data }) => setState((prev) => ({ ...prev, validationResults: data.validation || data.results || [] })))
      .catch(() => setState((prev) => ({ ...prev, validationResults: recomputeValidation(project) })));
  }
  if (action === 'toggle-history') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.history(project.id).then(({ data }) => {
      const latest = (data || []).slice(-1)[0];
      const msg = latest ? `History latest: v${latest.version} ${latest.summary || latest.change_source}` : 'No history yet';
      setState((prev) => ({ ...prev, serverError: msg, workflowHistory: data || [] }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to load history' })));
  }
  if (action === 'undo-workflow') {
    const st = getState();
    const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.undo(project.id).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to undo workflow' })));
  }

  if (action === 'toggle-ai-edit') setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, open: !prev.aiEdit.open } }));
  if (action === 'use-ai-suggestion') setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: target.dataset.suggestion } }));

  if (action === 'generate-diff') {
    const st = getState();
    const project = getActiveProject(st);
    const diff = modelGenerateWorkflowDiff(st.aiEdit.request, project.workflow, project.assets);
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff } }));
  }

  if (action === 'toggle-diff-change') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: { ...prev.aiEdit.diff, changes: prev.aiEdit.diff.changes.map((c) => (c.id === target.dataset.changeId ? { ...c, selected: !c.selected } : c)) } } }));
  }

  if (action === 'apply-diff-all' || action === 'apply-diff-selected') {
    const st = getState();
    const project = getActiveProject(st);
    const updated = applyWorkflowDiff(project, st.aiEdit.diff, action === 'apply-diff-selected');
    markProjectWorkflowChanged(updated, 'Diff applied', st.aiEdit.diff.changes.filter((c) => c.selected || action === 'apply-diff-all').map((c) => c.targetId));
    replaceActiveProject(updated);
    setState((prev) => ({ ...prev, aiEdit: { open: false, request: '', diff: null } }));
  }

  if (action === 'reject-diff') setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: null } }));

  if (action === 'generate-kit') {
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      apiClient.executionKitsApi.preview(project.id).then(({ data }) => {
        updateActiveProject((draft) => {
          draft.executionKit = data.execution_kit || data.kit || data;
        }, 'Execution kit generated');
      }).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Generation failed. View error details or retry from the job panel.' })));
    } else {
      const validationResults = recomputeValidation(project);
      const kit = modelGenerateExecutionKit(project.workflow, project.assets, validationResults);
      updateActiveProject((draft) => {
        draft.executionKit = kit;
      }, 'Execution kit generated');
    }
  }

  if (action === 'refresh-jobs') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.jobsApi.list(project.id).then(({ data }) => {
      setState((prev) => ({ ...prev, jobs: data.jobs || data || [] }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to refresh jobs' })));
  }

  if (action === 'refresh-model-status') {
    Promise.all([apiClient.modelApi.status(), apiClient.modelApi.calls()])
      .then(([statusResult, callsResult]) => {
        setState((prev) => ({ ...prev, modelStatus: statusResult.data || {}, modelCalls: callsResult.data?.calls || callsResult.data || [] }));
      })
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to refresh model status' })));
  }

  if (action === 'job-retry') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.jobsApi.retry(project.id, target.dataset.jobId)
      .then(() => apiClient.jobsApi.list(project.id))
      .then(({ data }) => setState((prev) => ({ ...prev, jobs: data.jobs || data || [] })))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to retry job' })));
  }

  if (action === 'job-cancel') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.jobsApi.cancel(project.id, target.dataset.jobId)
      .then(() => apiClient.jobsApi.list(project.id))
      .then(({ data }) => setState((prev) => ({ ...prev, jobs: data.jobs || data || [] })))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to cancel job' })));
  }

  if (action === 'preview-file') setState((prev) => ({ ...prev, exportPreviewType: target.dataset.file }));

  if (action === 'build-context-summary') {
    updateActiveProject((draft) => {
      draft.contextPack.summary = buildContextSummary(draft.contextPack);
    }, 'Context summary refreshed');
  }

  if (action === 'recommend-mode') {
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.executionMode = recommendExecutionMode(node, draft.contextPack, getState().validationResults);
      node.history.push({ at: new Date().toISOString(), action: 'Execution mode recommended by mock model' });
    }, 'Execution mode updated', [nodeId]);
  }

  if (action === 'generate-prompt') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      apiClient.nodesApi.generatePrompt(project.id, nodeId)
        .then(() => Promise.all([apiClient.assetsApi.list(project.id), apiClient.jobsApi.list(project.id)]))
        .then(([assetsResult, jobsResult]) => {
          const assets = assetsResult.data?.assets || assetsResult.data || {};
          const jobs = jobsResult.data?.jobs || jobsResult.data || [];
          updateActiveProject((draft) => {
            draft.assets = assets;
          }, 'Prompt generated', [nodeId]);
          setState((prev) => ({ ...prev, jobs }));
        })
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Generation failed. View error details or retry from the job panel.' })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        const prompt = modelGeneratePrompt(node);
        const index = draft.assets.prompts.findIndex((p) => p.nodeId === nodeId);
        if (index >= 0) draft.assets.prompts[index] = prompt;
        else if (prompt) draft.assets.prompts.push(prompt);
        node.promptStatus = 'draft';
      }, 'Prompt generated', [nodeId]);
    }
  }

  if (action === 'toggle-gate-required') {
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.reviewGate = node.reviewGate || { id: `gate-${node.id}`, name: 'Manual Gate', reviewerRole: node.humanOwnerRole, criteria: [], passCondition: '', rejectCondition: '', allowAiRevision: true, required: false };
      node.reviewGate.required = !node.reviewGate.required;
    }, 'Review gate changed', [nodeId]);
  }

  if (action === 'add-node' || action === 'add-node-phase') {
    const phaseId = target.dataset.phaseId;
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      const selectedPhase = phaseId || project.workflow.phases.at(-1)?.id;
      const id = `node-${Date.now()}`;
      const nextNodes = [...project.workflow.nodes, {
        id, phaseId: selectedPhase, name: 'New Node', goal: 'Describe node goal', executionMode: 'human_lead_ai_assist', riskLevel: 'medium', status: 'draft', humanOwnerRole: 'Project Manager', aiRole: 'Assistant', inputs: ['input'], outputs: ['output'], artifactContract: { id: `artifact-${id}`, format: 'markdown', outputFormat: 'markdown', acceptanceCriteria: ['complete'] }, reviewGate: { id: `gate-${id}`, name: 'Review', reviewerRole: 'Project Manager', criteria: ['quality'], passCondition: 'approved', rejectCondition: 'rework', allowAiRevision: true, required: true }, promptStatus: 'draft', checklistStatus: 'draft', history: [{ at: new Date().toISOString(), action: 'Added manually' }],
      }];
      apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, nodes: nextNodes }).then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : (error.message || 'Failed to add node') })));
      return;
    }
    updateActiveProject((draft) => {
      const phase = draft.workflow.phases.at(-1);
      const id = `node-${Date.now()}`;
      draft.workflow.nodes.push({
        id,
        phaseId: phase.id,
        name: 'New Node',
        goal: 'Describe node goal',
        executionMode: 'human_lead_ai_assist',
        riskLevel: 'medium',
        status: 'draft',
        humanOwnerRole: 'Project Manager',
        aiRole: 'Assistant',
        inputs: ['input'],
        outputs: ['output'],
        artifactContract: { id: `artifact-${id}`, format: 'markdown', outputFormat: 'markdown', acceptanceCriteria: ['complete'] },
        reviewGate: { id: `gate-${id}`, name: 'Review', reviewerRole: 'Project Manager', criteria: ['quality'], passCondition: 'approved', rejectCondition: 'rework', allowAiRevision: true, required: true },
        promptStatus: 'draft',
        checklistStatus: 'draft',
        history: [{ at: new Date().toISOString(), action: 'Added manually' }],
      });
      draft.workflow.version += 1;
    }, 'Node added');
  }

  if (action === 'delete-node') {
    const st = getState();
    const project = getActiveProject(st);
    const nodeId = target.dataset.nodeId;
    if (!project?.id || !nodeId || !st.serverAvailable) return;
    const downstream = project.workflow.edges.filter((e) => e.from === nodeId).map((e) => e.to);
    const edgeCount = project.workflow.edges.filter((e) => e.from === nodeId || e.to === nodeId).length;
    if (!window.confirm(`Delete node impact:\nrelated edges: ${edgeCount}\ndownstream nodes: ${downstream.join(', ') || 'none'}`)) return;
    const nextNodes = project.workflow.nodes.filter((n) => n.id !== nodeId);
    const nextEdges = project.workflow.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, nodes: nextNodes, edges: nextEdges }).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : (error.message || 'Failed to delete node') })));
  }

  if (action === 'copy-kit') {
    const project = getActiveProject();
    if (project.executionKit) navigator.clipboard?.writeText(JSON.stringify(project.executionKit.files, null, 2));
  }

  if (action === 'asset-filter-type') setState((prev) => ({ ...prev, assetsFilter: { ...prev.assetsFilter, type: target.value }, selectedAsset: null }));
  if (action === 'asset-filter-phase') setState((prev) => ({ ...prev, assetsFilter: { ...prev.assetsFilter, phase: target.value } }));
  if (action === 'asset-filter-status') setState((prev) => ({ ...prev, assetsFilter: { ...prev.assetsFilter, status: target.value } }));
  if (action === 'select-asset') setState((prev) => ({ ...prev, selectedAsset: { type: target.dataset.assetType, id: target.dataset.assetId } }));

  if (action === 'regenerate-asset-prompt') {
    const promptId = target.dataset.assetId;
    updateActiveProject((draft) => {
      const prompt = draft.assets.prompts.find((p) => p.id === promptId);
      const node = draft.workflow.nodes.find((n) => n.id === prompt?.nodeId);
      if (!prompt || !node) return;
      const regenerated = modelGeneratePrompt(node);
      Object.assign(prompt, regenerated, { status: 'draft', outdatedReason: '' });
      node.promptStatus = 'draft';
    }, 'Prompt regenerated');
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === 'set-ai-request') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: target.value } }));
    return;
  }

  if (target.dataset.action === 'update-node-field') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    const field = target.dataset.field;
    const value = (field === 'inputs' || field === 'outputs') ? target.value.split('\n').map((x) => x.trim()).filter(Boolean) : target.value;
    if (st.serverAvailable && project?.id) {
      apiClient.nodesApi.patch(project.id, nodeId, { [field]: value })
        .then(({ data }) => {
          const updatedProject = data.project || data;
          if (updatedProject?.id && updatedProject?.workflow) replaceActiveProject(updatedProject);
        })
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || `Failed to update ${field}` })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (field === 'inputs' || field === 'outputs') node[field] = value;
        else node[field] = value;
        node.history.push({ at: new Date().toISOString(), action: `${field} updated` });
      }, `${target.dataset.field} updated`, [nodeId]);
    }
  }

  if (target.dataset.action === 'update-artifact-format') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      apiClient.nodesApi.patch(project.id, nodeId, { artifactContract: { outputFormat: target.value } })
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to update artifact contract' })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.artifactContract.outputFormat = target.value;
      }, 'Artifact contract updated', [nodeId]);
    }
  }

  if (target.dataset.action === 'update-gate-field') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      const activeNode = project.workflow.nodes.find((n) => n.id === nodeId);
      if (!activeNode?.reviewGate) return;
      const nextGate = structuredClone(activeNode.reviewGate);
      if (target.dataset.field === 'criteria') nextGate.criteria = target.value.split('\n').filter(Boolean);
      else nextGate[target.dataset.field] = target.value;
      apiClient.nodesApi.patch(project.id, nodeId, { reviewGate: nextGate })
        .then(({ data }) => {
          const updatedProject = data.project || data;
          if (updatedProject?.id && updatedProject?.workflow) replaceActiveProject(updatedProject);
        })
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to update review gate' })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (!node.reviewGate) return;
        if (target.dataset.field === 'criteria') node.reviewGate.criteria = target.value.split('\n').filter(Boolean);
        else node.reviewGate[target.dataset.field] = target.value;
      }, 'Review gate updated', [nodeId]);
    }
  }

  if (target.dataset.action === 'update-prompt-content') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      const prompt = project.assets.prompts.find((p) => p.nodeId === nodeId || p.node_id === nodeId);
      if (!prompt?.id) return;
      apiClient.assetsApi.update(project.id, prompt.id, { content: target.value, status: 'draft' })
        .then(() => apiClient.assetsApi.list(project.id))
        .then(({ data }) => updateActiveProject((draft) => {
          draft.assets = data.assets || data || draft.assets;
        }, 'Prompt edited', [nodeId]))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to update prompt content' })));
    } else {
      updateActiveProject((draft) => {
        const prompt = draft.assets.prompts.find((p) => p.nodeId === nodeId);
        if (prompt) {
          prompt.content = target.value;
          prompt.status = 'draft';
          prompt.outdatedReason = '';
        }
      }, 'Prompt edited', [nodeId]);
    }
  }

  if (target.dataset.action === 'edit-asset-prompt') {
    const st = getState();
    const project = getActiveProject(st);
    const assetId = target.dataset.assetId;
    if (st.serverAvailable && project?.id) {
      apiClient.assetsApi.update(project.id, assetId, { content: target.value, status: 'draft' })
        .then(() => apiClient.assetsApi.list(project.id))
        .then(({ data }) => updateActiveProject((draft) => {
          draft.assets = data.assets || data || draft.assets;
        }, 'Prompt edited from assets'))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to edit asset prompt' })));
    } else {
      updateActiveProject((draft) => {
        const prompt = draft.assets.prompts.find((p) => p.id === assetId);
        if (prompt) {
          prompt.content = target.value;
          prompt.status = 'draft';
        }
      }, 'Prompt edited from assets', [getActiveProject().assets.prompts.find((p) => p.id === assetId)?.nodeId].filter(Boolean));
    }
  }
}

function handleSubmit(event) {
  if (event.target.dataset.form === 'create-project') {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const projectInput = {
      ...data,
      deliveryScope: data.deliveryScope.split(',').map((x) => x.trim()),
      expectedAiScope: data.expectedAiScope.split(',').map((x) => x.trim()),
      sensitiveAreas: data.sensitiveAreas.split(',').map((x) => x.trim()),
    };

    apiClient.projectsApi.create({
      name: data.name,
      goal: data.goal,
      project_type: data.type,
      current_stage: data.currentStage,
      risk_level: data.riskLevel,
      target_deliverables: projectInput.deliveryScope,
      expected_ai_scope: projectInput.expectedAiScope,
      sensitive_areas: projectInput.sensitiveAreas,
      setup_mode: data.setupMode,
      output_language: 'en',
    }).then(async ({ data: createdProject }) => {
      if (data.setupMode === 'quick_start') {
        const generateResult = await apiClient.workflowApi.generate(createdProject.id);
        setState((prev) => ({ ...prev, jobs: [generateResult.data, ...prev.jobs].slice(0, 10) }));
      }
      const projectsResult = await apiClient.projectsApi.list();
      const projects = projectsResult.data?.projects || projectsResult.data || [];
      setState((prev) => ({ ...prev, projects, activeProjectId: createdProject.id, currentPage: data.setupMode === 'org_aware' ? 'context' : 'studio' }));
    }).catch((error) => {
      setState((prev) => ({ ...prev, serverError: error.message || 'Failed to create project' }));
    });
  }

  if (event.target.dataset.form === 'context-pack') {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.target));
    const state = getState();
    const active = getActiveProject(state);
    apiClient.contextPackApi.save(active.id, {
      roles: raw.teamRoles.split(',').map((x) => x.trim()).filter(Boolean),
      approval_processes: raw.approvalProcess.split(',').map((x) => x.trim()).filter(Boolean),
      tool_stack: raw.toolStack.split(',').map((x) => x.trim()).filter(Boolean),
      risk_constraints: raw.riskConstraints.split(',').map((x) => x.trim()).filter(Boolean),
      source_materials: [{ type: 'text', content: raw.historicalProcessMaterials }],
    }).then(async () => {
      await apiClient.workflowApi.generate(active.id);
      const projectResult = await apiClient.projectsApi.getById(active.id);
      const updatedProject = projectResult.data?.project || projectResult.data;
      replaceActiveProject(updatedProject);
      setState((prev) => ({ ...prev, currentPage: 'studio' }));
    }).catch((error) => {
      setState((prev) => ({ ...prev, serverError: error.message || 'Failed to save context pack' }));
    });
  }
}

subscribe(render);
render();

async function bootstrapRuntimeMode() {
  try {
    await apiClient.healthApi.check();
    const [{ data: projectsData }, { data: modelStatus }] = await Promise.all([
      apiClient.projectsApi.list(),
      apiClient.modelApi.status(),
    ]);
    const projects = projectsData?.projects || projectsData || [];
    if (projects.length) {
      setState((prev) => ({ ...prev, projects, activeProjectId: projects[0].id, modelStatus }));
    }
    setRuntimeMode('local_server', true);
  } catch (error) {
    setState((prev) => ({ ...prev, serverError: error.message || 'Server disconnected' }));
    setRuntimeMode('local_demo', false);
  }
}

bootstrapRuntimeMode();

document.addEventListener('click', handleAction);
document.addEventListener('input', handleInput);
document.addEventListener('change', handleAction);
document.addEventListener('submit', handleSubmit);
