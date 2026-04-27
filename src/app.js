import { EXECUTION_MODES, AI_EDIT_SUGGESTIONS } from './domain/constants.js';
import { getState, setState, subscribe, getActiveProject, replaceActiveProject, recomputeValidation } from './state/store.js';
import {
  modelGenerateWorkflowDraft,
  recommendExecutionMode,
  modelGeneratePrompt,
  modelGenerateChecklist,
  modelGenerateWorkflowDiff,
  modelGenerateExecutionKit,
  buildContextSummary,
  getModelCallLogs,
} from './services/mockModelService.js';
import { applyWorkflowDiff } from './services/diffGenerator.js';

const app = document.getElementById('app');

function countProjectStats(project) {
  const nodes = project.workflow.nodes;
  return {
    nodes: nodes.length,
    aiNodes: nodes.filter((node) => EXECUTION_MODES[node.executionMode]?.ai).length,
    gates: nodes.filter((node) => node.reviewGate?.required).length,
  };
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
  return `<header class="topbar"><div><h1>${project?.name || 'BoundaryML'}</h1><p>Workflow ${project?.workflow?.status || 'draft'} · ${stats.nodes} Nodes · ${stats.aiNodes} AI Nodes · ${stats.gates} Review Gates</p></div>
  <button class="primary" data-action="goto" data-page="export">Generate Execution Kit</button></header>`;
}

function renderProjects(state) {
  return `<section class="page"><div class="page-head"><h2>Projects</h2><button class="primary" data-action="goto" data-page="create">+ New Project</button></div>
  <p class="muted">Data-driven projects powered by BoundaryML domain model.</p>
  <div class="project-grid">${state.projects.map((project) => {
    const stats = countProjectStats(project);
    return `<article class="card project"><h3>${project.name}</h3><p>${project.type} · ${project.riskLevel} risk · ${project.workflow.status}</p>
      <div class="kv-row"><span>Nodes ${stats.nodes}</span><span>AI ${stats.aiNodes}</span><span>Gates ${stats.gates}</span></div>
      <div class="kv-row"><span>Execution Kit</span><strong>${project.executionKit ? project.executionKit.status : 'not generated'}</strong></div>
      <button data-action="open-project" data-project-id="${project.id}">Open Studio</button></article>`;
  }).join('')}</div></section>`;
}

function renderCreatePage() {
  return `<section class="page"><h2>Create Project</h2>
  <p class="muted">Create project and generate workflow draft through mock planning model.</p>
  <form class="card form" data-form="create-project">
    <div class="grid-2">
      <label>Project Name<input name="name" value="AI SaaS Feature MVP v2" required/></label>
      <label>Project Goal<input name="goal" value="Deliver AI feature with explicit review gates" required/></label>
      <label>Project Type<input name="type" value="AI Feature" required/></label>
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

function renderNodeCard(node, selected) {
  const mode = EXECUTION_MODES[node.executionMode];
  return `<button class="node-card ${selected ? 'selected' : ''}" data-action="select-node" data-node-id="${node.id}">
    <div class="node-head"><strong>${node.name}</strong>${badge(node.riskLevel, `risk-${node.riskLevel}`)}</div>
    <div class="mode-pill" style="border-color:${mode.color};color:${mode.color}">${mode.label}</div>
    <div class="meta">Status: ${node.status} · Prompt: ${node.promptStatus} · Gate: ${node.reviewGate?.name || 'none'}</div>
  </button>`;
}

function renderNodeDetail(state, project, node) {
  if (!node) return '<div class="card panel">Select a node</div>';
  const tab = state.activeNodeDetailTab;
  const upstream = project.workflow.edges.filter((edge) => edge.to === node.id).map((edge) => project.workflow.nodes.find((n) => n.id === edge.from)?.name).filter(Boolean);
  const downstream = project.workflow.edges.filter((edge) => edge.from === node.id).map((edge) => project.workflow.nodes.find((n) => n.id === edge.to)?.name).filter(Boolean);
  const rules = state.validationResults.filter((item) => item.targetId === node.id || item.targetId === `prompt-${node.id}`);

  const tabNav = ['overview', 'boundary', 'io', 'gate', 'assets', 'history'].map((t) => `<button class="tab ${tab===t?'active':''}" data-action="node-tab" data-tab="${t}">${t}</button>`).join('');

  const prompt = project.assets.prompts.find((item) => item.nodeId === node.id);
  const checklist = project.assets.checklists.find((item) => item.nodeId === node.id);

  const bodies = {
    overview: `<p><strong>${node.name}</strong></p><p>${node.goal}</p><p>Phase: ${project.workflow.phases.find((p) => p.id === node.phaseId)?.name}</p><p>Status: ${node.status}</p><p>Risk: ${node.riskLevel}</p><p>Upstream: ${upstream.join(', ') || 'none'}</p><p>Downstream: ${downstream.join(', ') || 'none'}</p>`,
    boundary: `<label>Execution Mode<select data-action="update-node-field" data-field="executionMode" data-node-id="${node.id}">${Object.entries(EXECUTION_MODES).map(([k,v]) => `<option value="${k}" ${node.executionMode===k?'selected':''}>${v.label}</option>`).join('')}</select></label>
      <label>Human Owner Role<input data-action="update-node-field" data-field="humanOwnerRole" data-node-id="${node.id}" value="${node.humanOwnerRole}"/></label>
      <label>AI Role<input data-action="update-node-field" data-field="aiRole" data-node-id="${node.id}" value="${node.aiRole || ''}"/></label>
      <button data-action="recommend-mode" data-node-id="${node.id}">Recommend Execution Mode</button>
      ${rules.map((r) => `<p class="inline-${r.level}">${r.title}: ${r.message}</p>`).join('') || '<p class="muted">No boundary warnings.</p>'}`,
    io: `<label>Inputs<textarea data-action="update-node-field" data-field="inputs" data-node-id="${node.id}">${node.inputs.join('\n')}</textarea></label>
      <label>Outputs<textarea data-action="update-node-field" data-field="outputs" data-node-id="${node.id}">${node.outputs.join('\n')}</textarea></label>
      <label>Artifact Output Format<input data-action="update-artifact-format" data-node-id="${node.id}" value="${node.artifactContract?.outputFormat || ''}"/></label>
      <button data-action="mark-node-reviewed" data-node-id="${node.id}">Mark as Reviewed</button>`,
    gate: `<p><strong>${node.reviewGate?.name || 'Missing Review Gate'}</strong></p>
      <label>Reviewer Role<input data-action="update-gate-field" data-node-id="${node.id}" data-field="reviewerRole" value="${node.reviewGate?.reviewerRole || ''}"/></label>
      <label>Criteria<textarea data-action="update-gate-field" data-node-id="${node.id}" data-field="criteria">${(node.reviewGate?.criteria || []).join('\n')}</textarea></label>
      <label>Pass Condition<input data-action="update-gate-field" data-node-id="${node.id}" data-field="passCondition" value="${node.reviewGate?.passCondition || ''}"/></label>
      <label>Reject Condition<input data-action="update-gate-field" data-node-id="${node.id}" data-field="rejectCondition" value="${node.reviewGate?.rejectCondition || ''}"/></label>
      <label class="check"><input type="checkbox" data-action="toggle-gate-required" data-node-id="${node.id}" ${node.reviewGate?.required?'checked':''}/> Required Gate</label>`,
    assets: node.executionMode === 'human_only'
      ? `<p>Human-only node: show checklist only.</p><pre>${(checklist?.items || []).join('\n')}</pre><button data-action="generate-checklist" data-node-id="${node.id}">Generate Checklist</button>`
      : `<label>Prompt Editor<textarea data-action="update-prompt-content" data-node-id="${node.id}">${prompt?.content || ''}</textarea></label>
        <button data-action="generate-prompt" data-node-id="${node.id}">${prompt ? 'Regenerate Prompt' : 'Generate Prompt'}</button>
        <button data-action="mark-prompt-reviewed" data-node-id="${node.id}">Mark Reviewed</button>
        <button data-action="copy-prompt" data-node-id="${node.id}">Copy Prompt</button>
        <p>Output Format: ${prompt?.outputFormat || node.artifactContract?.outputFormat || 'N/A'}</p>
        <p>Acceptance Criteria: ${(prompt?.acceptanceCriteria || []).join('; ')}</p>`,
    history: `<ul>${node.history.map((h) => `<li>${h.at}: ${h.action}</li>`).join('')}</ul>`,
  };

  return `<article class="card panel"><h3>Node Detail</h3><div class="tabs">${tabNav}</div><div class="tab-body">${bodies[tab]}</div></article>`;
}

function renderStudio(state) {
  const project = getActiveProject(state);
  const nodes = project.workflow.nodes;
  const selectedNode = nodes.find((node) => node.id === state.selectedNodeId) || nodes[0];
  const summary = {
    errors: state.validationResults.filter((x) => x.level === 'error').length,
    warnings: state.validationResults.filter((x) => x.level === 'warning').length,
  };

  return `<section class="page"><div class="toolbar card"><div><strong>${project.name}</strong><p class="muted">v${project.workflow.version} · ${project.workflow.status}</p></div>
    <div class="row"><button data-action="set-studio-view" data-view="canvas">Canvas</button><button data-action="set-studio-view" data-view="table">Table</button><button data-action="set-studio-view" data-view="risk">Risk</button><button data-action="add-node">Add Node</button><button data-action="toggle-ai-edit">AI Edit</button><button data-action="validate">Validate</button><button class="primary" data-action="goto" data-page="export">Generate Execution Kit</button></div></div>
  <div class="studio-grid">
    <aside class="card panel"><h3>Filters & Legend</h3><label>Execution Mode<select data-action="set-filter-mode"><option value="all">All</option>${Object.entries(EXECUTION_MODES).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
    <label>Risk<select data-action="set-filter-risk"><option value="all">All</option><option>low</option><option>medium</option><option>high</option></select></label>
    <p>Validation: ${summary.errors} errors, ${summary.warnings} warnings</p>
    <ul>${state.validationResults.slice(0,4).map((x) => `<li class="inline-${x.level}">${x.title}</li>`).join('')}</ul>
    <h4>Phases</h4><ul>${project.workflow.phases.map((p) => `<li>${p.name} (${nodes.filter((n) => n.phaseId===p.id).length})</li>`).join('')}</ul></aside>
    <div class="card canvas">${project.workflow.phases.map((phase) => `<div class="lane"><h4>${phase.name}</h4>${nodes.filter((node) => node.phaseId === phase.id).map((node) => renderNodeCard(node, node.id === selectedNode.id)).join('')}</div>`).join('')}</div>
    ${renderNodeDetail(state, project, selectedNode)}
  </div>
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
  <ul>${diff.changes.map((change) => `<li><label class="check"><input type="checkbox" data-action="toggle-diff-change" data-change-id="${change.id}" ${change.selected?'checked':''}/> <strong>${change.type}</strong> ${change.targetType} ${change.targetId}
  <br/>Reason: ${change.reason}<br/>Impact: ${change.impact}<br/>Before: ${JSON.stringify(change.before)}<br/>After: ${JSON.stringify(change.after)}</label></li>`).join('')}</ul>
  <p>${diff.warnings.map((w) => `<span class="inline-warning">${w}</span>`).join(' ')}</p>
  <div class="actions"><button data-action="apply-diff-all" class="primary">Apply All</button><button data-action="apply-diff-selected">Apply Selected</button><button data-action="reject-diff">Reject All</button></div></div></div>`;
}

function renderAssets(state) {
  const project = getActiveProject(state);
  return `<section class="page"><h2>Execution Assets</h2>
  <div class="asset-tabs"><button data-action="asset-tab" data-tab="prompts">Prompts</button><button data-action="asset-tab" data-tab="checklists">Checklists</button><button data-action="asset-tab" data-tab="artifactTemplates">Artifact Templates</button></div>
  <div class="split-2"><article class="card panel"><h3>Asset List</h3>
    <label>Phase Filter<select data-action="asset-filter-phase"><option value="all">All</option>${project.workflow.phases.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
    <label>Status Filter<select data-action="asset-filter-status"><option value="all">All</option><option>draft</option><option>reviewed</option><option>outdated</option></select></label>
    <ul>${project.assets.prompts.map((item) => `<li><button data-action="select-asset" data-asset-type="prompt" data-asset-id="${item.id}">${item.name} ${badge(item.status, item.status)}</button></li>`).join('')}</ul>
    <ul>${project.assets.checklists.map((item) => `<li><button data-action="select-asset" data-asset-type="checklist" data-asset-id="${item.id}">${item.name} ${badge(item.status, item.status)}</button></li>`).join('')}</ul>
    <ul>${project.assets.artifactTemplates.map((item) => `<li><button data-action="select-asset" data-asset-type="template" data-asset-id="${item.id}">${item.name} ${badge(item.status, item.status)}</button></li>`).join('')}</ul>
  </article>
  <article class="card panel"><h3>Asset Detail</h3><div id="asset-detail">Select asset from list.</div></article></div>
  </section>`;
}

function renderExport(state) {
  const project = getActiveProject(state);
  const preview = project.executionKit;
  return `<section class="page"><h2>Export Execution Kit</h2>
  <p class="muted">Validation must pass for final export.</p>
  <div class="split-2"><article class="card panel"><h3>Export Options</h3>
    <label class="check"><input checked type="checkbox"/>Workflow Spec</label>
    <label class="check"><input checked type="checkbox"/>Task List</label>
    <label class="check"><input checked type="checkbox"/>Prompt Pack</label>
    <label class="check"><input checked type="checkbox"/>Review Checklist</label>
    <label class="check"><input checked type="checkbox"/>Artifact Templates</label>
    <label class="check"><input checked type="checkbox"/>Responsibility Map</label>
    <label class="check"><input checked type="checkbox"/>Risk Report</label>
    <div class="actions"><button data-action="generate-kit" class="primary">Generate Preview</button><button data-action="copy-kit">Copy Preview</button></div>
    <p>${preview ? `Kit status: ${preview.status}` : 'No preview yet.'}</p>
  </article>
  <article class="card panel"><h3>Execution Kit Preview</h3>
    ${preview ? `<div class="tabs">${Object.keys(preview.files).map((k) => `<button class="tab ${state.exportPreviewType===k?'active':''}" data-action="preview-file" data-file="${k}">${k}</button>`).join('')}</div>
      <pre>${typeof preview.files[state.exportPreviewType] === 'string' ? preview.files[state.exportPreviewType] : JSON.stringify(preview.files[state.exportPreviewType], null, 2)}</pre>
      <div class="actions"><button ${preview.canExportFinal ? '' : 'disabled'}>Export Markdown</button><button ${preview.canExportFinal ? '' : 'disabled'}>Export YAML / JSON</button></div>`
      : '<pre>Generate preview to inspect execution kit artifacts.</pre>'}
  </article></div></section>`;
}

function renderSettings() {
  const logs = getModelCallLogs();
  return `<section class="page"><h2>Settings / Model Access</h2><div class="card panel"><p>Provider: OpenAI-compatible (mock connected)</p>
  <p>Default Model: mock-default</p><p>Planning Model: mock-planning-model</p><p>Prompt Model: mock-prompt-model</p><p>Diff Model: mock-diff-model</p><p>Structured Output: enabled</p><p>Log Level: debug</p>
  <h3>Recent Model Calls</h3><ul>${logs.map((log) => `<li>${log.at} · ${log.name}</li>`).join('') || '<li>No calls yet</li>'}</ul></div></section>`;
}

function renderPage(state) {
  switch (state.currentPage) {
    case 'projects': return renderProjects(state);
    case 'create': return renderCreatePage();
    case 'context': return renderContextPage(state);
    case 'studio': return renderStudio(state);
    case 'assets': return renderAssets(state);
    case 'export': return renderExport(state);
    case 'settings': return renderSettings();
    default: return renderProjects(state);
  }
}

function render() {
  const state = getState();
  app.innerHTML = `<div class="app-shell">${renderSidebar(state)}<div class="main">${renderTopbar(state)}<main>${renderPage(state)}</main></div></div>`;
}

function updateActiveProject(mutator) {
  const state = getState();
  const project = getActiveProject(state);
  if (!project) return;
  const updated = structuredClone(project);
  mutator(updated);
  updated.workflow.updatedAt = new Date().toISOString();
  replaceActiveProject(updated);
}

function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (action === 'goto') {
    setState((prev) => ({ ...prev, currentPage: target.dataset.page }));
  }

  if (action === 'open-project') {
    setState((prev) => ({ ...prev, activeProjectId: target.dataset.projectId, currentPage: 'studio' }));
  }

  if (action === 'select-node') {
    setState((prev) => ({ ...prev, selectedNodeId: target.dataset.nodeId }));
  }

  if (action === 'node-tab') {
    setState((prev) => ({ ...prev, activeNodeDetailTab: target.dataset.tab }));
  }

  if (action === 'validate') {
    const project = getActiveProject();
    setState((prev) => ({ ...prev, validationResults: recomputeValidation(project) }));
  }

  if (action === 'toggle-ai-edit') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, open: !prev.aiEdit.open } }));
  }

  if (action === 'use-ai-suggestion') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: target.dataset.suggestion } }));
  }

  if (action === 'set-ai-request') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: event.target.value } }));
  }

  if (action === 'generate-diff') {
    const state = getState();
    const project = getActiveProject(state);
    const diff = modelGenerateWorkflowDiff(state.aiEdit.request, project.workflow, project.assets);
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff } }));
  }

  if (action === 'toggle-diff-change') {
    setState((prev) => ({
      ...prev,
      aiEdit: {
        ...prev.aiEdit,
        diff: {
          ...prev.aiEdit.diff,
          changes: prev.aiEdit.diff.changes.map((change) => (change.id === target.dataset.changeId ? { ...change, selected: !change.selected } : change)),
        },
      },
    }));
  }

  if (action === 'apply-diff-all' || action === 'apply-diff-selected') {
    const st = getState();
    const project = getActiveProject(st);
    const updated = applyWorkflowDiff(project, st.aiEdit.diff, action === 'apply-diff-selected');
    replaceActiveProject(updated);
    setState((prev) => ({ ...prev, aiEdit: { open: false, request: '', diff: null } }));
  }

  if (action === 'reject-diff') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: null } }));
  }

  if (action === 'generate-kit') {
    const st = getState();
    const project = getActiveProject(st);
    const validationResults = recomputeValidation(project);
    const kit = modelGenerateExecutionKit(project.workflow, project.assets, validationResults);
    updateActiveProject((draft) => { draft.executionKit = kit; });
  }

  if (action === 'preview-file') {
    setState((prev) => ({ ...prev, exportPreviewType: target.dataset.file }));
  }

  if (action === 'build-context-summary') {
    updateActiveProject((draft) => {
      draft.contextPack.summary = buildContextSummary(draft.contextPack);
    });
  }

  if (action === 'recommend-mode') {
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.executionMode = recommendExecutionMode(node, draft.contextPack, getState().validationResults);
      node.history.push({ at: new Date().toISOString(), action: 'Execution mode recommended by mock model' });
    });
  }

  if (action === 'generate-prompt') {
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const prompt = modelGeneratePrompt(node);
      const index = draft.assets.prompts.findIndex((p) => p.nodeId === nodeId);
      if (index >= 0) draft.assets.prompts[index] = prompt;
      else if (prompt) draft.assets.prompts.push(prompt);
      node.promptStatus = 'draft';
      node.history.push({ at: new Date().toISOString(), action: 'Prompt generated' });
    });
  }

  if (action === 'generate-checklist') {
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const checklist = modelGenerateChecklist(node);
      const idx = draft.assets.checklists.findIndex((c) => c.nodeId === nodeId);
      if (idx >= 0) draft.assets.checklists[idx] = checklist;
      else draft.assets.checklists.push(checklist);
      node.checklistStatus = 'draft';
    });
  }

  if (action === 'copy-prompt') {
    const nodeId = target.dataset.nodeId;
    const project = getActiveProject();
    const prompt = project.assets.prompts.find((p) => p.nodeId === nodeId);
    if (prompt) navigator.clipboard?.writeText(prompt.content);
  }

  if (action === 'mark-prompt-reviewed') {
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const prompt = draft.assets.prompts.find((p) => p.nodeId === nodeId);
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (prompt) prompt.status = 'reviewed';
      if (node) node.promptStatus = 'reviewed';
    });
  }

  if (action === 'mark-node-reviewed') {
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === target.dataset.nodeId);
      if (!node) return;
      node.status = 'reviewed';
      node.history.push({ at: new Date().toISOString(), action: 'Node marked reviewed' });
    });
  }

  if (action === 'toggle-gate-required') {
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === target.dataset.nodeId);
      if (!node) return;
      node.reviewGate = node.reviewGate || { id: `gate-${node.id}`, name: 'Manual Gate', reviewerRole: node.humanOwnerRole, criteria: [], passCondition: '', rejectCondition: '', allowAiRevision: true, required: false };
      node.reviewGate.required = !node.reviewGate.required;
    });
  }

  if (action === 'add-node') {
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
    });
  }

  if (action === 'copy-kit') {
    const project = getActiveProject();
    if (project.executionKit) navigator.clipboard?.writeText(JSON.stringify(project.executionKit.files, null, 2));
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === 'set-ai-request') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: target.value } }));
    return;
  }

  if (target.dataset.action === 'update-node-field') {
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === target.dataset.nodeId);
      if (!node) return;
      const field = target.dataset.field;
      if (field === 'inputs' || field === 'outputs') node[field] = target.value.split('\n').map((x) => x.trim()).filter(Boolean);
      else node[field] = target.value;
      if (field === 'executionMode') {
        node.promptStatus = EXECUTION_MODES[node.executionMode]?.ai ? 'outdated' : 'missing';
      }
      node.history.push({ at: new Date().toISOString(), action: `${field} updated` });
    });
  }

  if (target.dataset.action === 'update-artifact-format') {
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === target.dataset.nodeId);
      if (!node) return;
      node.artifactContract.outputFormat = target.value;
    });
  }

  if (target.dataset.action === 'update-gate-field') {
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === target.dataset.nodeId);
      if (!node) return;
      node.reviewGate = node.reviewGate || { id: `gate-${node.id}`, name: 'Review', reviewerRole: node.humanOwnerRole, criteria: [], passCondition: '', rejectCondition: '', allowAiRevision: true, required: true };
      if (target.dataset.field === 'criteria') node.reviewGate.criteria = target.value.split('\n').filter(Boolean);
      else node.reviewGate[target.dataset.field] = target.value;
    });
  }

  if (target.dataset.action === 'update-prompt-content') {
    updateActiveProject((draft) => {
      const prompt = draft.assets.prompts.find((p) => p.nodeId === target.dataset.nodeId);
      if (prompt) {
        prompt.content = target.value;
        prompt.status = 'draft';
      }
    });
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

    if (data.setupMode === 'org_aware') {
      const project = modelGenerateWorkflowDraft(projectInput, {});
      setState((prev) => ({ ...prev, projects: [...prev.projects, project], activeProjectId: project.id, currentPage: 'context' }));
      return;
    }

    const project = modelGenerateWorkflowDraft(projectInput, {});
    setState((prev) => ({ ...prev, projects: [...prev.projects, project], activeProjectId: project.id, currentPage: 'studio', selectedNodeId: project.workflow.nodes[0]?.id }));
  }

  if (event.target.dataset.form === 'context-pack') {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.target));
    const contextPack = {
      teamRoles: raw.teamRoles.split(',').map((x) => x.trim()).filter(Boolean),
      approvalProcess: raw.approvalProcess.split(',').map((x) => x.trim()).filter(Boolean),
      toolStack: raw.toolStack.split(',').map((x) => x.trim()).filter(Boolean),
      riskConstraints: raw.riskConstraints.split(',').map((x) => x.trim()).filter(Boolean),
      historicalProcessMaterials: raw.historicalProcessMaterials,
    };

    updateActiveProject((draft) => {
      draft.contextPack = { ...draft.contextPack, ...contextPack, summary: buildContextSummary(contextPack) };
      const regenerated = modelGenerateWorkflowDraft({
        name: draft.name,
        goal: draft.goal,
        type: draft.type,
        currentStage: draft.currentStage,
        riskLevel: draft.riskLevel,
        deliveryScope: draft.deliveryScope,
        expectedAiScope: draft.expectedAiScope,
        sensitiveAreas: draft.sensitiveAreas,
        setupMode: 'org_aware',
      }, draft.contextPack);
      draft.workflow = regenerated.workflow;
      draft.assets = regenerated.assets;
      draft.workflow.version += 1;
    });

    setState((prev) => ({ ...prev, currentPage: 'studio' }));
  }
}

subscribe(render);
render();

document.addEventListener('click', handleAction);
document.addEventListener('input', handleInput);
document.addEventListener('submit', handleSubmit);
