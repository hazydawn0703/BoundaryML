import { EXECUTION_MODES, AI_EDIT_SUGGESTIONS } from '../../../packages/schema/src/constants.js';
import { getState, setState, subscribe, getActiveProject, replaceActiveProject, replaceActiveProjectSilently, recomputeValidation, setRuntimeMode, updateUiStateSilently } from './state/store.js';
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

const UI_LANGUAGES = {
  en: 'English',
  'zh-Hans': '简体中文',
};

const ZH_HANS_REPLACEMENTS = [
  ['Search projects', '搜索项目'],
  ['Search by project name', '按项目名搜索'],
  ['Search jobs', '搜索任务'],
  ['Search by task type, status, stage, or message', '按任务类型、状态、阶段或消息搜索'],
  ['No jobs match your search.', '没有匹配搜索的任务。'],
  ['Rename Project', '重命名项目'],
  ['Delete Project', '删除项目'],
  ['No projects match your search.', '没有匹配搜索的项目。'],
  ['Model Access', '模型访问'],
  ['Manage model provider, keys, and runtime test calls', '管理模型服务商、密钥和运行时测试调用'],
  ['Model Configuration', '模型配置'],
  ['Runtime Status', '运行时状态'],
  ['Base URL', '基础 URL'],
  ['Timeout MS', '超时时间（毫秒）'],
  ['Allow Mock Fallback', '允许 Mock 兜底'],
  ['Log Level', '日志级别'],
  ['Clear saved API key', '清除已保存的 API key'],
  ['Saved to local server config', '保存到本地服务配置'],
  ['Test Model', '测试模型'],
  ['Save Configuration', '保存配置'],
  ['Testing...', '测试中...'],
  ['Recent Model Calls', '最近模型调用'],
  ['No calls yet', '暂无调用'],
  ['Generate Workflow Draft', '生成工作流草稿'],
  ['Organization-Aware Setup', '组织上下文设置'],
  ['Historical Process Materials', '历史流程材料'],
  ['Generate / Refresh Summary', '生成/刷新摘要'],
  ['Generate Execution Kit', '生成执行包'],
  ['Generate Final Kit', '生成最终包'],
  ['Generate Draft Kit', '生成草稿包'],
  ['Generate preview to inspect execution kit artifacts.', '生成预览以检查执行包产物。'],
  ['Selected workflow context may be sent to the configured LLM provider.', '选中的工作流上下文可能会发送到已配置的 LLM 服务。'],
  ['Server Mode generates a Workflow Diff for review; it never edits the formal workflow directly.', 'Server 模式会生成用于审核的工作流 Diff，不会直接修改正式工作流。'],
  ['Mode: Local Demo / Mock Model. Server persistence is disabled.', '模式：Local Demo / Mock Model。服务端持久化已禁用。'],
  ['Mode: Local Demo / Mock Model', '模式：Local Demo / Mock Model'],
  ['Mode: Local Server', '模式：Local Server'],
  ['Reconnect Server', '重新连接服务'],
  ['Open Source Theme', '开源主题'],
  ['Context Pack', '上下文包'],
  ['Context Management', '上下文管理'],
  ['Execution Assets', '执行资产'],
  ['Create First Project', '创建第一个项目'],
  ['Start with a project goal.', '从项目目标开始。'],
  ['BoundaryML will generate a human-AI workflow boundary draft.', 'BoundaryML 会生成一份人机协作边界工作流草稿。'],
  ['Data-driven projects powered by BoundaryML domain model.', '由 BoundaryML 领域模型驱动的数据化项目。'],
  ['Current Stage', '当前阶段'],
  ['Target Deliverables', '目标交付物'],
  ['Expected AI Scope', '预期 AI 范围'],
  ['Sensitive Areas', '敏感区域'],
  ['Project Name', '项目名称'],
  ['Project Goal', '项目目标'],
  ['Project Type', '项目类型'],
  ['Discovery / Design / Development / Testing / Launch', '探索 / 设计 / 开发 / 测试 / 发布'],
  ['PRD, prototype, API spec, launch plan', 'PRD、原型、API 规格、发布计划'],
  ['PRD, code, tests, docs, review', 'PRD、代码、测试、文档、评审'],
  ['Customer data, production release, security', '客户数据、生产发布、安全'],
  ['Risk Level', '风险等级'],
  ['Setup Mode', '设置模式'],
  ['Quick Start', '快速开始'],
  ['Internal Tool', '内部工具'],
  ['Legacy Modernization', '遗留系统现代化'],
  ['AI Feature', 'AI 功能'],
  ['Team Roles', '团队角色'],
  ['Approval Process', '审批流程'],
  ['Tool Stack', '工具栈'],
  ['Risk Constraints', '风险约束'],
  ['Context Summary', '上下文摘要'],
  ['Recognized Roles', '识别出的角色'],
  ['Suggested Review Gates', '建议的审核门禁'],
  ['Missing Context', '缺失上下文'],
  ['Risk Warnings', '风险提醒'],
  ['No summary yet.', '暂无摘要。'],
  ['Loading project', '正在加载项目'],
  ['Loading workflow, assets, validation, and history from BoundaryML Server.', '正在从 BoundaryML Server 加载工作流、资产、校验和历史。'],
  ['Back to Projects', '返回项目'],
  ['Loading Studio', '正在加载 Studio'],
  ['Loading Execution Assets', '正在加载执行资产'],
  ['Loading Export', '正在加载导出'],
  ['Execution Mode', '执行模式'],
  ['Human Owner', '人工负责人'],
  ['Project Manager', '项目经理'],
  ['Assistant', '助手'],
  ['Recommend Execution Mode', '推荐执行模式'],
  ['Delete Node', '删除节点'],
  ['Add Edge', '添加连线'],
  ['Edit Edge', '编辑连线'],
  ['Save Edge', '保存连线'],
  ['Dependency', '依赖关系'],
  ['Required outputs', '必需输出'],
  ['Human-only node: no AI prompt.', '纯人工节点：无 AI 提示词。'],
  ['Regenerate Checklist', '重新生成检查清单'],
  ['Generate Checklist', '生成检查清单'],
  ['Regenerate Prompt', '重新生成提示词'],
  ['Generate Prompt', '生成提示词'],
  ['Prompt Status', '提示词状态'],
  ['Checklist Status', '检查清单状态'],
  ['Artifact Contract', '产物契约'],
  ['Required Sections', '必填章节'],
  ['Completion Criteria', '完成标准'],
  ['Review Gate', '审核门禁'],
  ['Review Gates', '审核门禁'],
  ['Missing Review Gate', '缺少审核门禁'],
  ['Remove Review Gate', '移除审核门禁'],
  ['Pass Condition', '通过条件'],
  ['Reject Condition', '驳回条件'],
  ['Reviewer Role', '审核角色'],
  ['Reviewer', '审核人'],
  ['Criteria', '标准'],
  ['Gate Name', '门禁名称'],
  ['Required', '必需'],
  ['Node Detail', '节点详情'],
  ['Select a node', '选择一个节点'],
  ['Workflow', '工作流'],
  ['Validation', '校验'],
  ['Zoom', '缩放'],
  ['Reset View', '重置视图'],
  ['Manage BoundaryML projects', '管理 BoundaryML 项目'],
  ['Create a new BoundaryML project', '创建新的 BoundaryML 项目'],
  ['Manage model and runtime settings', '管理模型和运行时设置'],
  ['Add Node to this phase', '向此阶段添加节点'],
  ['Add Phase', '添加阶段'],
  ['Rename Phase', '重命名阶段'],
  ['Delete Phase', '删除阶段'],
  ['Save Phase', '保存阶段'],
  ['Phase actions', '阶段操作'],
  ['Add Node', '添加节点'],
  ['Undo', '撤销'],
  ['History', '历史'],
  ['Validate', '校验'],
  ['Jobs', '任务'],
  ['Monitor recent generation tasks', '监控最近生成任务'],
  ['Recent Jobs', '最近任务'],
  ['No jobs yet', '暂无任务'],
  ['AI Assisted Edit', 'AI 辅助编辑'],
  ['Describe edits...', '描述修改...'],
  ['Generate Diff', '生成 Diff'],
  ['Diff Review', 'Diff 审核'],
  ['Apply Selected', '应用选中项'],
  ['Apply All', '全部应用'],
  ['Reject All', '全部拒绝'],
  ['Close', '关闭'],
  ['Asset List', '资产列表'],
  ['Asset Detail', '资产详情'],
  ['Select asset from list.', '从列表中选择资产。'],
  ['Asset not found', '未找到资产'],
  ['Prompts', '提示词'],
  ['Prompt Content', '提示词内容'],
  ['Copy Prompt', '复制提示词'],
  ['Checklists', '检查清单'],
  ['Checklist Items', '检查项'],
  ['Copy Checklist', '复制检查清单'],
  ['Artifact Templates', '产物模板'],
  ['Copy Template', '复制模板'],
  ['Regenerate Asset', '重新生成资产'],
  ['Regenerate', '重新生成'],
  ['Output Format', '输出格式'],
  ['Acceptance Criteria', '验收标准'],
  ['Context Required', '所需上下文'],
  ['Artifact Name', '产物名称'],
  ['Template Content', '模板内容'],
  ['No node', '无节点'],
  ['Export Execution Kit', '导出执行包'],
  ['Draft Kit may include warnings/errors. Final Kit is blocked by blocking validation errors.', '草稿包可包含警告/错误；最终包会被阻塞性校验错误拦截。'],
  ['Export Options', '导出选项'],
  ['Kit Type', '执行包类型'],
  ['Draft Kit', '草稿包'],
  ['Final Kit', '最终包'],
  ['Generate Preview', '生成预览'],
  ['Copy Preview JSON', '复制预览 JSON'],
  ['Copy Preview', '复制预览'],
  ['Download Latest', '下载最新'],
  ['Refresh Jobs', '刷新任务'],
  ['Execution Kit Preview', '执行包预览'],
  ['Preview status', '预览状态'],
  ['Latest generated kit', '最近生成的执行包'],
  ['Settings / Model Access', '设置 / 模型访问'],
  ['Model Configuration', '模型配置'],
  ['Model Mode', '模型模式'],
  ['Base URL', '基础 URL'],
  ['API Key', 'API Key'],
  ['Timeout MS', '超时时间（毫秒）'],
  ['Allow Mock Fallback', '允许 Mock 兜底'],
  ['Log Level', '日志级别'],
  ['Clear saved API key', '清除已保存的 API key'],
  ['Saved to local server config', '保存到本地服务配置'],
  ['Test Model', '测试模型'],
  ['Save Configuration', '保存配置'],
  ['Runtime Status', '运行时状态'],
  ['Provider', '提供商'],
  ['Default Model', '默认模型'],
  ['Planning Model', '规划模型'],
  ['Prompt Model', '提示词模型'],
  ['Diff Model', 'Diff 模型'],
  ['Structured Output', '结构化输出'],
  ['Refresh Model Status', '刷新模型状态'],
  ['Recent Model Calls', '最近模型调用'],
  ['No calls yet', '暂无调用'],
  ['Human Only', '纯人工'],
  ['AI Draft + Human Review', 'AI 起草 + 人工审核'],
  ['Human Lead + AI Assist', '人工主导 + AI 辅助'],
  ['AI Execute + Human Approval', 'AI 执行 + 人工批准'],
  ['AI Autonomous', 'AI 自主执行'],
  ['Outdated prompt', '提示词已过期'],
  ['Discovery', '探索'],
  ['Product Design', '产品设计'],
  ['Technical Design', '技术设计'],
  ['Development', '开发'],
  ['Testing', '测试'],
  ['Launch', '发布'],
  ['Projects', '项目'],
  ['Create Project', '创建项目'],
  ['Open Studio', '打开工作台'],
  ['Studio', '工作台'],
  ['Export', '导出'],
  ['Settings', '设置'],
  ['New Project', '新建项目'],
  ['Language', '语言'],
  ['Project', '项目'],
  ['Stage', '阶段'],
  ['Execution Kit', '执行包'],
  ['Nodes', '节点'],
  ['nodes', '节点'],
  ['Node', '节点'],
  ['Gates', '门禁'],
  ['Gate', '门禁'],
  ['Risk', '风险'],
  ['Status', '状态'],
  ['Owner', '负责人'],
  ['Upstream', '上游'],
  ['Downstream', '下游'],
  ['Inputs', '输入'],
  ['Outputs', '输出'],
  ['Input', '输入'],
  ['Output', '输出'],
  ['Name', '名称'],
  ['Goal', '目标'],
  ['Phase', '阶段'],
  ['Type', '类型'],
  ['Format', '格式'],
  ['Role', '角色'],
  ['Objective', '目标'],
  ['Prompt', '提示词'],
  ['Checklist', '检查清单'],
  ['Overview', '概览'],
  ['Boundary', '边界'],
  ['IO', '输入/输出'],
  ['Assets', '资产'],
  ['All', '全部'],
  ['Unassigned', '未分配'],
  ['errors', '错误'],
  ['warnings', '警告'],
  ['high-risk', '高风险'],
  ['validation', '校验'],
  ['status', '状态'],
  ['high', '高'],
  ['medium', '中'],
  ['low', '低'],
  ['draft', '草稿'],
  ['reviewed', '已审核'],
  ['final', '最终'],
  ['outdated', '已过期'],
  ['enabled', '已启用'],
  ['disabled', '已禁用'],
  ['none', '无'],
  ['n/a', '不适用'],
  ['missing', '缺失'],
  ['complete', '完成'],
];

const TRANSLATION_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'PRE', 'CODE']);
const WORKFLOW_MIN_SCALE = 0.25;
const WORKFLOW_MAX_SCALE = 4;
let workflowPan = null;
let workflowViewportCommitTimer = null;

const ICONS = {
  addPhase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/><path d="M4 4h6v6H4zM14 14h6v6h-6z"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 1 1 0 12h-3"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>',
  validate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12h.01M19 12h.01M5 12h.01"/></svg>',
};

function translateText(text, language) {
  if (language !== 'zh-Hans') return text;
  return [...ZH_HANS_REPLACEMENTS]
    .sort(([left], [right]) => right.length - left.length)
    .reduce((value, [source, translated]) => value.split(source).join(translated), text);
}

function localizeDom(language) {
  document.documentElement.lang = language === 'zh-Hans' ? 'zh-Hans' : 'en';
  const walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return TRANSLATION_SKIP_TAGS.has(node.parentElement?.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    node.nodeValue = translateText(node.nodeValue, language);
  });
  app.querySelectorAll('[placeholder]').forEach((node) => {
    node.setAttribute('placeholder', translateText(node.getAttribute('placeholder') || '', language));
  });
  app.querySelectorAll('[title]').forEach((node) => {
    node.setAttribute('title', translateText(node.getAttribute('title') || '', language));
  });
  app.querySelectorAll('[aria-label]').forEach((node) => {
    node.setAttribute('aria-label', translateText(node.getAttribute('aria-label') || '', language));
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getWorkflowViewport(state = getState()) {
  const source = state.workflowViewport || {};
  return {
    x: Number.isFinite(source.x) ? source.x : 0,
    y: Number.isFinite(source.y) ? source.y : 0,
    scale: clamp(Number.isFinite(source.scale) ? source.scale : 1, WORKFLOW_MIN_SCALE, WORKFLOW_MAX_SCALE),
  };
}

function workflowTransform(viewport) {
  return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
}

function applyWorkflowViewport(viewport) {
  const content = app.querySelector('.workflow-canvas-content');
  if (!content) return;
  content.style.transform = workflowTransform(viewport);
  const scaleText = app.querySelector('[data-workflow-zoom]');
  if (scaleText) scaleText.textContent = `${Math.round(viewport.scale * 100)}%`;
}

function closestElement(target, selector) {
  const element = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  return element?.closest(selector) || null;
}

function commitWorkflowViewport(viewport, delay = 0) {
  window.clearTimeout(workflowViewportCommitTimer);
  updateUiStateSilently((state) => {
    state.workflowViewport = viewport;
  });
  if (delay > 0) workflowViewportCommitTimer = window.setTimeout(() => {}, delay);
}

function countProjectStats(project) {
  const nodes = project.workflow?.nodes || [];
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

function escapeAttr(value = '') {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function showToast(message, type = 'info') {
  const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setState((prev) => ({ ...prev, toasts: [...(prev.toasts || []), { id, message, type }].slice(-4) }));
  window.setTimeout(() => {
    setState((prev) => ({ ...prev, toasts: (prev.toasts || []).filter((toast) => toast.id !== id) }));
  }, 3600);
}

function renderToasts(state) {
  const toasts = state.toasts || [];
  if (!toasts.length) return '';
  return `<div class="toast-stack" role="status" aria-live="polite">${toasts.map((toast) => `<div class="toast ${toast.type || 'info'}">${toast.message}</div>`).join('')}</div>`;
}

function renderModelCallList(logs) {
  if (!logs.length) return '<li>No calls yet</li>';
  return logs.map((log) => {
    const failed = log.status === 'failed';
    const summary = failed && log.summary ? `<p class="inline-error">${log.summary}</p>` : '';
    return `<li>${log.created_at || log.at} - ${log.purpose || log.name} - ${log.status}${summary}</li>`;
  }).join('');
}

function renderSidebar(state) {
  const pages = [
    ['projects', 'Projects'],
    ['jobs', 'Jobs'],
  ];
  const settingsSelected = state.currentPage === 'settings-model' || state.currentPage === 'settings';
  const settingsOpen = state.settingsNavOpen || settingsSelected;

  return `<aside class="sidebar"><div class="logo">Boundary<span>ML</span></div><div class="theme-strip">Open Source Theme<div class="theme-swatch-row"><span class="theme-swatch primary"></span><span class="theme-swatch accent"></span><span class="theme-swatch violet"></span></div></div>
    <nav>${pages.map(([id, label]) => `<button class="nav-item ${state.currentPage === id ? 'active' : ''}" data-action="goto" data-page="${id}">${label}</button>`).join('')}
      <button class="nav-item ${settingsSelected ? 'active' : ''}" data-action="toggle-settings-nav" aria-expanded="${settingsOpen}">Settings</button>
      <div class="subnav ${settingsOpen ? 'open' : ''}"><button class="subnav-item ${settingsSelected ? 'active' : ''}" data-action="goto" data-page="settings-model">Model Access</button></div>
    </nav>
  </aside>`;
}

function renderTopbar(state) {
  const project = getActiveProject(state);
  const stats = project ? countProjectStats(project) : { nodes: 0, aiNodes: 0, gates: 0 };
  const validationSummary = {
    errors: (state.validationResults || []).filter((item) => item.level === 'error').length,
    warnings: (state.validationResults || []).filter((item) => item.level === 'warning').length,
  };
  const outdatedPromptCount = (project?.assets?.prompts || []).filter((prompt) => prompt.status === 'outdated' || prompt.outdatedReason || prompt.outdated_reason).length;
  const pageCopy = {
    projects: ['Projects', 'Manage BoundaryML projects'],
    create: ['Create Project', 'Create a new BoundaryML project'],
    jobs: ['Jobs', 'Monitor recent generation tasks'],
    settings: ['Settings', 'Manage model and runtime settings'],
    'settings-model': ['Model Access', 'Manage model provider, keys, and runtime test calls'],
  };
  const isProjectTopbar = !pageCopy[state.currentPage] && Boolean(project?.id);
  const [title, subtitle] = pageCopy[state.currentPage] || [
    project?.name || 'BoundaryML',
    `Workflow ${project?.workflow?.status || 'draft'} · ${stats.nodes} Nodes · ${stats.aiNodes} AI Nodes · ${stats.gates} Review Gates · Validation: ${validationSummary.errors} errors, ${validationSummary.warnings} warnings`,
  ];
  const titleBadge = isProjectTopbar && outdatedPromptCount
    ? `<span class="topbar-title-badge warning">Outdated prompt ${outdatedPromptCount}</span>`
    : '';
  const runtimeBadge = state.serverAvailable
    ? `<span class="badge">Mode: Local Server</span>`
    : `<span class="badge risk-high">Mode: Local Demo / Mock Model</span><button data-action="refresh-server-mode">Reconnect Server</button>`;
  const language = state.language || 'en';
  const languageSwitcher = `<label class="language-switcher"><span>Language</span><select data-action="set-language" aria-label="Language">${Object.entries(UI_LANGUAGES).map(([id, label]) => `<option value="${id}" ${language === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
  const canGenerateExecutionKit = Boolean(project?.id) && ['context', 'studio', 'assets', 'export'].includes(state.currentPage);
  const executionKitAction = canGenerateExecutionKit ? '<button class="primary" data-action="goto" data-page="export">Generate Execution Kit</button>' : '';
  return `<header class="topbar"><div><h1>${title}${titleBadge}</h1><p>${subtitle}</p></div>
  <div class="row">${runtimeBadge}${languageSwitcher}${executionKitAction}</div></header>`;
}

function renderProjects(state) {
  if (!state.projects.length) {
    return `<section class="page"><div class="card panel"><p>Start with a project goal.<br/>BoundaryML will generate a human-AI workflow boundary draft.</p><button class="primary" data-action="goto" data-page="create">Create First Project</button></div></section>`;
  }
  return `<section class="page"><div class="page-head"><label class="project-search"><span>Search projects</span><input data-action="search-projects" value="${escapeAttr(state.projectSearch || '')}" placeholder="Search by project name"/></label><button class="primary" data-action="goto" data-page="create">+ New Project</button></div>
  <div data-project-results>${renderProjectGrid(state)}</div></section>`;
}

function renderProjectGrid(state) {
  const query = (state.projectSearch || '').trim().toLowerCase();
  const projects = query ? state.projects.filter((project) => String(project.name || '').toLowerCase().includes(query)) : state.projects;
  if (!projects.length) return '<div class="card panel"><p>No projects match your search.</p></div>';
  return `<div class="project-grid">${projects.map((project) => {
    const stats = countProjectStats(project);
    const menuOpen = state.activeProjectMenuId === project.id;
    return `<article class="card project"><div class="project-card-head"><h3>${project.name}</h3><div class="project-menu-control"><button class="icon-button project-menu-trigger ${menuOpen ? 'active' : ''}" data-action="toggle-project-menu" data-project-id="${project.id}" aria-label="Project actions" aria-expanded="${menuOpen ? 'true' : 'false'}">${ICONS.more}</button><div class="project-menu" data-project-menu="${project.id}" ${menuOpen ? '' : 'hidden'}><button data-action="rename-project" data-project-id="${project.id}">Rename Project</button><button data-action="delete-project" data-project-id="${project.id}" class="danger-text">Delete Project</button></div></div></div><p>${project.project_type || project.type} - ${(project.risk_level || project.riskLevel)} risk - ${(project.workflow?.status || 'draft')}</p>
      <div class="kv-row"><span>Nodes ${stats.nodes}</span><span>AI ${stats.aiNodes}</span><span>Gates ${stats.gates}</span></div>
      <div class="kv-row"><span>Stage</span><strong>${project.current_stage || project.currentStage || 'n/a'}</strong></div>
      <div class="kv-row"><span>Execution Kit</span><strong>${project.execution_kit?.status || project.executionKit?.status || 'not generated'}</strong></div>
      <div class="actions"><button data-action="open-project" data-project-id="${project.id}">Open Studio</button><button data-action="open-project-page" data-page="context" data-project-id="${project.id}">Context Management</button><button data-action="open-project-page" data-page="assets" data-project-id="${project.id}">Execution Assets</button></div></article>`;
  }).join('')}</div>`;
}

function renderCreatePage() {
  return `<section class="page"><form class="card form" data-form="create-project">
    <div class="grid-2">
      <label>Project Name<input name="name" required/></label>
      <label>Project Goal<input name="goal" required/></label>
      <label>Project Type<select name="type"><option>AI Feature</option><option>Internal Tool</option><option>Legacy Modernization</option></select></label>
      <label>Current Stage<input name="currentStage" required placeholder="Discovery / Design / Development / Testing / Launch"/></label>
      <label>Target Deliverables<input name="deliveryScope" placeholder="PRD, prototype, API spec, launch plan"/></label>
      <label>Expected AI Scope<input name="expectedAiScope" placeholder="PRD, code, tests, docs, review"/></label>
      <label>Sensitive Areas<input name="sensitiveAreas" placeholder="Customer data, production release, security"/></label>
      <label>Risk Level<select name="riskLevel"><option>low</option><option>medium</option><option>high</option></select></label>
      <label>Setup Mode<select name="setupMode"><option value="quick_start">Quick Start</option><option value="org_aware">Organization-Aware Setup</option></select></label>
    </div>
    <div class="actions"><button type="button" data-action="goto" data-page="projects">Cancel</button><button type="submit" class="primary">Generate Workflow Draft</button></div>
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
  return (project.workflow?.nodes || []).map((node) => ({
    ...node,
    muted: (modeFilter !== 'all' && node.executionMode !== modeFilter) || (riskFilter !== 'all' && node.riskLevel !== riskFilter),
  }));
}

function hasProjectRuntime(project) {
  return Boolean(project?.workflow?.nodes && project?.workflow?.phases && project?.workflow?.edges && project?.assets);
}

function renderProjectLoading(state, title = 'Loading project') {
  const message = state.serverError || 'Loading workflow, assets, validation, and history from BoundaryML Server.';
  return `<section class="page"><div class="card panel"><h2>${title}</h2><p class="muted">${message}</p><div class="actions"><button data-action="goto" data-page="projects">Back to Projects</button><button data-action="refresh-server-mode" class="primary">Reconnect Server</button></div></div></section>`;
}

function camelKey(key) {
  return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function withCamelAliases(value) {
  if (Array.isArray(value)) return value.map((item) => withCamelAliases(item));
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((acc, [key, item]) => {
    const normalizedValue = withCamelAliases(item);
    acc[key] = normalizedValue;
    const alias = camelKey(key);
    if (!(alias in acc)) acc[alias] = normalizedValue;
    return acc;
  }, {});
}

function renderNodeCard(node, selected) {
  const mode = EXECUTION_MODES[node.executionMode] || EXECUTION_MODES.human_lead_ai_assist;
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

  const tabLabels = { overview: 'Overview', boundary: 'Boundary', io: 'IO', gate: 'Gate', assets: 'Assets', history: 'History' };
  const tabNav = Object.entries(tabLabels).map(([key, label]) => `<button class="tab ${tab === key ? 'active' : ''}" data-action="node-tab" data-tab="${key}">${label}</button>`).join('');
  const prompt = project.assets.prompts.find((item) => item.nodeId === node.id);
  const checklist = project.assets.checklists.find((item) => item.nodeId === node.id);

  const nodeEdges = project.workflow.edges.filter((e) => e.from === node.id || e.to === node.id);
  const body = {
    overview: `<label>Name<input data-action="update-node-field" data-field="name" data-node-id="${node.id}" value="${node.name}"/></label><label>Goal<textarea data-action="update-node-field" data-field="goal" data-node-id="${node.id}">${node.goal || ''}</textarea></label><label>Phase<select data-action="update-node-field" data-field="phaseId" data-node-id="${node.id}">${project.workflow.phases.map((p) => `<option value="${p.id}" ${p.id === node.phaseId ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label><label>Status<input data-action="update-node-field" data-field="status" data-node-id="${node.id}" value="${node.status || 'draft'}"/></label><label>Risk<select data-action="update-node-field" data-field="riskLevel" data-node-id="${node.id}">${['low', 'medium', 'high'].map((r) => `<option value="${r}" ${r === node.riskLevel ? 'selected' : ''}>${r}</option>`).join('')}</select></label><p>Upstream: ${upstream.join(', ') || 'none'}</p><p>Downstream: ${downstream.join(', ') || 'none'}</p><button data-action="delete-node" data-node-id="${node.id}">Delete Node</button>`,
    boundary: `<label>Execution Mode<select data-action="update-node-field" data-field="executionMode" data-node-id="${node.id}">${Object.entries(EXECUTION_MODES).map(([k, v]) => `<option value="${k}" ${node.executionMode === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <label>Human Owner<input data-action="update-node-field" data-field="humanOwnerRole" data-node-id="${node.id}" value="${node.humanOwnerRole}"/></label>
    <label>AI Role<input data-action="update-node-field" data-field="aiRole" data-node-id="${node.id}" value="${node.aiRole || ''}"/></label>
    <button data-action="recommend-mode" data-node-id="${node.id}">Recommend Execution Mode</button>${rules.map((r) => `<p class="inline-${r.level}">${r.title}</p>`).join('')}`,
    io: `<label>Inputs<textarea data-action="update-node-field" data-field="inputs" data-node-id="${node.id}">${node.inputs.join('\n')}</textarea></label>
    <label>Outputs<textarea data-action="update-node-field" data-field="outputs" data-node-id="${node.id}">${node.outputs.join('\n')}</textarea></label>
    <h4>Artifact Contract</h4>
    <label>ID<input data-action="update-artifact-contract-field" data-node-id="${node.id}" data-field="id" value="${node.artifactContract?.id || ''}"/></label>
    <label>Name<input data-action="update-artifact-contract-field" data-node-id="${node.id}" data-field="name" value="${node.artifactContract?.name || ''}"/></label>
    <label>Type<input data-action="update-artifact-contract-field" data-node-id="${node.id}" data-field="type" value="${node.artifactContract?.type || ''}"/></label>
    <label>Format<input data-action="update-artifact-contract-field" data-node-id="${node.id}" data-field="format" value="${node.artifactContract?.format || node.artifactContract?.outputFormat || ''}"/></label>
    <label>Required Sections<textarea data-action="update-artifact-contract-field" data-node-id="${node.id}" data-field="required_sections">${(node.artifactContract?.required_sections || []).join('\n')}</textarea></label>
    <label>Completion Criteria<textarea data-action="update-artifact-contract-field" data-node-id="${node.id}" data-field="completion_criteria">${(node.artifactContract?.completion_criteria || node.artifactContract?.acceptanceCriteria || []).join('\n')}</textarea></label>`,
    gate: `<p><strong>${node.reviewGate?.name || 'Missing Review Gate'}</strong></p>
    ${node.riskLevel === 'high' && !node.reviewGate?.required ? '<p class="inline-error">This node is high risk but has no required Review Gate.</p>' : ''}
    <label>Reviewer<input data-action="update-gate-field" data-node-id="${node.id}" data-field="reviewerRole" value="${node.reviewGate?.reviewerRole || ''}"/></label>
    <label>Criteria<textarea data-action="update-gate-field" data-node-id="${node.id}" data-field="criteria">${(node.reviewGate?.criteria || []).join('\n')}</textarea></label>
    <label>Gate Name<input data-action="update-gate-field" data-node-id="${node.id}" data-field="name" value="${node.reviewGate?.name || ''}"/></label>
    <label>Pass Condition<input data-action="update-gate-field" data-node-id="${node.id}" data-field="passCondition" value="${node.reviewGate?.passCondition || ''}"/></label>
    <label>Reject Condition<input data-action="update-gate-field" data-node-id="${node.id}" data-field="rejectCondition" value="${node.reviewGate?.rejectCondition || ''}"/></label>
    <label class="check"><input type="checkbox" data-action="toggle-gate-required" data-node-id="${node.id}" ${node.reviewGate?.required ? 'checked' : ''}/>Required</label>
    <button data-action="remove-review-gate" data-node-id="${node.id}">Remove Review Gate</button>`,
    assets: node.executionMode === 'human_only'
      ? `<p>Human-only node: no AI prompt.</p><p>Checklist: ${checklist?.status || 'missing'}</p><pre>${(checklist?.items || []).join('\n')}</pre><button data-action="generate-checklist" data-node-id="${node.id}">${checklist ? 'Regenerate Checklist' : 'Generate Checklist'}</button>`
      : `<label>Prompt<textarea data-action="update-prompt-content" data-node-id="${node.id}">${prompt?.content || ''}</textarea></label>
      <p>Prompt Status: ${prompt?.status || 'missing'} ${prompt?.outdatedReason ? `· ${prompt.outdatedReason}` : ''}</p>
      <p>Checklist Status: ${checklist?.status || 'missing'} ${checklist?.outdatedReason ? `· ${checklist.outdatedReason}` : ''}</p>
      <button data-action="generate-prompt" data-node-id="${node.id}">${prompt ? 'Regenerate Prompt' : 'Generate Prompt'}</button><button data-action="generate-checklist" data-node-id="${node.id}">${checklist ? 'Regenerate Checklist' : 'Generate Checklist'}</button>`,
    history: `<ul>${node.history.map((h) => `<li>${h.at}: ${h.action}</li>`).join('')}</ul><h4>Edges</h4><ul>${nodeEdges.map((e) => `<li>${e.id || `${e.from}-${e.to}`} ${e.from}→${e.to} (${e.dependencyType || e.dependency_type || 'sequential_dependency'}) req:${(e.required_outputs || []).join(',') || '-'} gate:${e.gate_id || '-'} <button data-action="start-edge-edit" data-edge-id="${e.id || `${e.from}-${e.to}`}">Edit</button> <button data-action="delete-edge" data-edge-id="${e.id || `${e.from}-${e.to}`}">Delete</button></li>`).join('') || '<li>none</li>'}</ul><button data-action="add-edge-from-node" data-node-id="${node.id}">Add Edge</button>
    ${state.edgeEdit?.id ? `<div class="card panel"><h5>Edit Edge ${state.edgeEdit.id}</h5><label>Dependency<select data-action="edge-edit-field" data-field="dependency_type"><option value="artifact_dependency">artifact_dependency</option><option value="approval_dependency">approval_dependency</option><option value="context_dependency">context_dependency</option><option value="sequential_dependency">sequential_dependency</option></select></label><label>Required outputs<textarea data-action="edge-edit-field" data-field="required_outputs">${(state.edgeEdit.required_outputs || []).join('\n')}</textarea></label><label>Gate ID<input data-action="edge-edit-field" data-field="gate_id" value="${state.edgeEdit.gate_id || ''}"/></label><button data-action="save-edge-edit">Save Edge</button></div>` : ''}`,
  };

  return `<article class="card panel"><h3>Node Detail</h3><div class="tabs">${tabNav}</div><div class="tab-body">${body[tab]}</div></article>`;
}

function renderCanvasTool(action, label, icon) {
  return `<button class="canvas-tool-button" data-action="${action}" aria-label="${label}" title="${label}"><span class="canvas-tool-icon">${icon}</span><span class="canvas-tool-tip">${label}</span></button>`;
}

function renderWorkflowCanvasTools(viewport) {
  return `<div class="workflow-canvas-tools" aria-label="Workflow tools">
    <span class="badge">Zoom <span data-workflow-zoom>${Math.round(viewport.scale * 100)}%</span></span>
    ${renderCanvasTool('add-phase', 'Add Phase', ICONS.addPhase)}
    ${renderCanvasTool('undo-workflow', 'Undo', ICONS.undo)}
    ${renderCanvasTool('toggle-history', 'History', ICONS.history)}
    ${renderCanvasTool('validate', 'Validate', ICONS.validate)}
  </div>`;
}

function renderWorkflowCanvasFilters(state) {
  const open = state.workflowFiltersOpen ? '' : ' hidden';
  return `<div class="workflow-filter-control">
    <button class="canvas-tool-button" data-action="toggle-workflow-filters" aria-label="Filters" title="Filters" aria-expanded="${state.workflowFiltersOpen ? 'true' : 'false'}"><span class="canvas-tool-icon">${ICONS.filter}</span><span class="canvas-tool-tip">Filters</span></button>
    <div class="workflow-filter-popover"${open}>
      <label>Execution Mode<select data-action="set-filter-mode"><option value="all">All</option>${Object.entries(EXECUTION_MODES).map(([k, v]) => `<option value="${k}" ${(state.studioFilter?.mode || 'all') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label>Risk<select data-action="set-filter-risk"><option value="all">All</option>${['low', 'medium', 'high'].map((x) => `<option value="${x}" ${(state.studioFilter?.risk || 'all') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    </div>
  </div>`;
}

function renderPhaseMenu(phase) {
  return `<div class="phase-menu" data-phase-menu="${phase.id}" hidden><label>Rename Phase<input data-action="phase-name-field" data-phase-id="${phase.id}" value="${phase.name}"/></label><div class="row"><button data-action="rename-phase" data-phase-id="${phase.id}">Save Phase</button><button data-action="delete-phase" data-phase-id="${phase.id}">Delete Phase</button></div></div>`;
}

function renderPhaseLane(state, project, nodes, selectedNode, phase) {
  const phaseNodes = nodes.filter((node) => node.phaseId === phase.id);
  const effectiveNodes = phase.id === '__unassigned__' ? nodes.filter((n) => !project.workflow.phases.find((p) => p.id === n.phaseId)) : phaseNodes;
  const nodeIds = effectiveNodes.map((n) => n.id);
  const highRiskCount = effectiveNodes.filter((n) => n.riskLevel === 'high').length;
  const issueCount = state.validationResults.filter((v) => nodeIds.includes(v.targetId)).length;
  const phaseStatus = state.validationResults.some((v) => v.level === 'error' && nodeIds.includes(v.targetId)) ? 'error' : issueCount ? 'warning' : 'ok';
  const phaseMenu = phase.id === '__unassigned__' ? '' : `<button class="icon-button phase-menu-trigger" data-action="toggle-phase-menu" data-phase-id="${phase.id}" aria-label="Phase actions" title="Phase actions">${ICONS.more}</button>${renderPhaseMenu(phase)}`;
  return `<div class="lane" data-phase-id="${phase.id}"><div class="lane-head"><h4>${phase.name}</h4>${phaseMenu}</div><p class="muted">nodes:${effectiveNodes.length} · high-risk:${highRiskCount} · validation:${issueCount} · status:${phaseStatus}</p><button data-action="add-node-phase" data-phase-id="${phase.id}">Add Node to this phase</button>${effectiveNodes.map((node) => renderNodeCard(node, node.id === selectedNode?.id)).join('')}<ul class="edge-hints">${renderEdgeHints(project, effectiveNodes)}</ul></div>`;
}

function renderWorkflowCanvasContent(state, project, nodes, selectedNode, viewport = getWorkflowViewport(state)) {
  return `<div class="workflow-canvas-content" style="transform:${workflowTransform(viewport)}">
    <div class="canvas">${[...project.workflow.phases, { id: '__unassigned__', name: 'Unassigned' }].map((phase) => renderPhaseLane(state, project, nodes, selectedNode, phase)).join('')}</div>
  </div>`;
}

function renderStudio(state) {
  const project = getActiveProject(state);
  if (!hasProjectRuntime(project)) return renderProjectLoading(state, 'Loading Studio');
  const nodes = filteredNodes(state, project);
  const viewport = getWorkflowViewport(state);
  const selectedNode = (project.workflow.nodes || []).find((node) => node.id === state.selectedNodeId) || project.workflow.nodes?.[0];
  const summary = {
    errors: state.validationResults.filter((x) => x.level === 'error').length,
    warnings: state.validationResults.filter((x) => x.level === 'warning').length,
  };
  const workflowAlerts = state.validationResults.filter((item) => item.title !== 'Outdated prompt' && !String(item.id || '').startsWith('outdated_prompt_warning'));

  const historyOpen = state.workflowHistoryOpen || (state.workflowHistory || []).length > 0;
  return `<section class="page">
  ${state.serverAvailable ? '' : '<div class="card panel inline-warning">Mode: Local Demo / Mock Model</div>'}
  ${state.serverError ? `<div class="card panel inline-error">${state.serverError}</div>` : ''}
  ${historyOpen ? `<article class="card panel"><div class="toolbar"><h3>History</h3><button data-action="save-workflow-history">Save Current Version</button></div><ul>${(state.workflowHistory || []).length ? state.workflowHistory.slice().reverse().map((h) => `<li>v${h.version} · ${h.created_at || h.createdAt || ''} · ${h.change_source || h.changeSource || ''} · ${h.summary || ''} · ${h.created_by || h.createdBy || ''} ${h.diff_id ? `· diff:${h.diff_id}` : ''}<div class="row"><button data-action="view-version" data-version="${h.version}">View Version</button><button data-action="restore-version" data-version="${h.version}">Restore</button></div></li>`).join('') : '<li>No saved versions yet</li>'}</ul></article>` : ''}
  <section class="workflow-board card">
    <div class="workflow-board-head"><div><h3>Workflow</h3><p class="muted" data-workflow-validation-summary>Validation: ${summary.errors} errors, ${summary.warnings} warnings</p></div></div>
    ${workflowAlerts.length ? `<div class="workflow-alerts">${workflowAlerts.slice(0, 4).map((x) => `<span class="inline-${x.level}">${x.title}</span>`).join('')}</div>` : ''}
    <div class="workflow-canvas">
      ${renderWorkflowCanvasFilters(state)}
      ${renderWorkflowCanvasTools(viewport)}
      ${renderWorkflowCanvasContent(state, project, nodes, selectedNode, viewport)}
      <div class="workflow-detail">${renderNodeDetail(state, project, selectedNode)}</div>
    </div>
  </section>
  ${renderAiEdit(state)}
  ${renderDiffDrawer(state)}
  </section>`;
}

function renderAiEdit(state) {
  if (!state.aiEdit.open) return '';
  return `<div class="drawer"><div class="card panel"><h3>AI Assisted Edit</h3>
    <p class="muted">Server Mode generates a Workflow Diff for review; it never edits the formal workflow directly.</p>
    ${state.serverAvailable ? '<p class="inline-warning">Selected workflow context may be sent to the configured LLM provider.</p>' : '<p class="inline-warning">Mode: Local Demo / Mock Model</p>'}
    <textarea data-action="set-ai-request" placeholder="Describe edits...">${state.aiEdit.request}</textarea>
    <div class="row">${AI_EDIT_SUGGESTIONS.map((suggestion) => `<button data-action="use-ai-suggestion" data-suggestion="${suggestion}">${suggestion}</button>`).join('')}</div>
    <div class="actions"><button data-action="generate-diff">Generate Diff</button><button data-action="toggle-ai-edit">Close</button></div></div></div>`;
}

function renderDiffDrawer(state) {
  if (!state.aiEdit.diff) return '';
  const diff = state.aiEdit.diff;
  return `<div class="drawer"><div class="card panel"><h3>Diff Review</h3><p>${diff.request}</p>
  ${(diff.warnings || []).map((warning) => `<p class="inline-warning">${warning}</p>`).join('')}
  <ul>${(diff.changes || []).map((change) => `<li><label class="check"><input type="checkbox" data-action="toggle-diff-change" data-change-id="${change.id}" ${change.selected ? 'checked' : ''}/> <strong>${change.type}</strong> ${change.targetType || change.target_type} ${change.targetId || change.target_id}<br/>Reason: ${change.reason}<br/>Impact: ${change.impact}</label></li>`).join('')}</ul>
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
  const workflow = withCamelAliases(workflowEnvelope.workflow || workflowEnvelope);
  updateActiveProject((draft) => {
    draft.workflow = workflow;
    draft.assets = withCamelAliases(workflowEnvelope.assets || assetsResult.data?.assets || assetsResult.data || draft.assets);
  });
  setState((prev) => ({ ...prev, jobs: withCamelAliases(jobsResult.data?.jobs || jobsResult.data || []), validationResults: withCamelAliases(workflowEnvelope.validation || prev.validationResults), workflowHistory: withCamelAliases(historyResult.data || []) }));
}


function getAssetCollection(project, type) {
  if (type === 'prompt') return project.assets?.prompts || [];
  if (type === 'checklist') return project.assets?.checklists || [];
  return project.assets?.artifactTemplates || project.assets?.artifact_templates || [];
}

function getAssetNode(project, asset) {
  return (project.workflow?.nodes || []).find((node) => node.id === (asset.nodeId || asset.node_id));
}

function splitLines(value) {
  return String(value || '').split('\n').map((item) => item.trim()).filter(Boolean);
}

function formatAssetList(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

function renderAssetStatus(asset) {
  const status = asset.status || 'draft';
  return `${badge(status, status)}${asset.outdatedReason || asset.outdated_reason ? `<p class="inline-warning">Outdated: ${asset.outdatedReason || asset.outdated_reason}</p>` : ''}`;
}

function getFilteredAssets(state, project) {
  const { type = 'prompt', phase = 'all', status = 'all' } = state.assetsFilter || {};
  const source = getAssetCollection(project, type);
  return source.filter((asset) => {
    const node = getAssetNode(project, asset);
    const phaseId = asset.phaseId || asset.phase_id || node?.phaseId || node?.phase_id;
    return (phase === 'all' || phaseId === phase) && (status === 'all' || (asset.status || 'draft') === status);
  });
}

function renderPromptAssetDetail(project, asset) {
  const node = getAssetNode(project, asset);
  const isHumanOnly = node?.executionMode === 'human_only';
  return `<p><strong>${asset.name}</strong></p>${renderAssetStatus(asset)}
    ${isHumanOnly ? '<p class="inline-error">Human Only nodes must not have AI execution prompts.</p>' : ''}
    <label>Role<input data-action="edit-asset-field" data-asset-type="prompt" data-asset-id="${asset.id}" data-field="role" value="${asset.role || node?.aiRole || ''}"/></label>
    <label>Objective<textarea data-action="edit-asset-field" data-asset-type="prompt" data-asset-id="${asset.id}" data-field="objective">${asset.objective || node?.goal || ''}</textarea></label>
    <label>Context Required<textarea data-action="edit-asset-field" data-asset-type="prompt" data-asset-id="${asset.id}" data-field="context_required">${formatAssetList(asset.context_required || asset.contextRequired || node?.inputs || [])}</textarea></label>
    <label>Output Format<input data-action="edit-asset-field" data-asset-type="prompt" data-asset-id="${asset.id}" data-field="outputFormat" value="${asset.outputFormat || asset.output_format || node?.artifactContract?.outputFormat || ''}"/></label>
    <label>Acceptance Criteria<textarea data-action="edit-asset-field" data-asset-type="prompt" data-asset-id="${asset.id}" data-field="acceptanceCriteria">${formatAssetList(asset.acceptanceCriteria || asset.acceptance_criteria || node?.artifactContract?.acceptanceCriteria || [])}</textarea></label>
    <label>Prompt Content<textarea data-action="edit-asset-field" data-asset-type="prompt" data-asset-id="${asset.id}" data-field="content">${asset.content || ''}</textarea></label>
    <div class="actions"><button data-action="copy-asset" data-asset-type="prompt" data-asset-id="${asset.id}">Copy Prompt</button><button data-action="regenerate-asset" data-asset-type="prompt" data-asset-id="${asset.id}">Regenerate Prompt</button></div>`;
}

function renderChecklistAssetDetail(project, asset) {
  return `<p><strong>${asset.name}</strong></p>${renderAssetStatus(asset)}
    <label>Reviewer Role<input data-action="edit-asset-field" data-asset-type="checklist" data-asset-id="${asset.id}" data-field="reviewerRole" value="${asset.reviewerRole || asset.reviewer_role || ''}"/></label>
    <label>Checklist Items<textarea data-action="edit-asset-field" data-asset-type="checklist" data-asset-id="${asset.id}" data-field="items">${formatAssetList(asset.items || [])}</textarea></label>
    <div class="actions"><button data-action="copy-asset" data-asset-type="checklist" data-asset-id="${asset.id}">Copy Checklist</button><button data-action="regenerate-asset" data-asset-type="checklist" data-asset-id="${asset.id}">Regenerate Checklist</button></div>`;
}

function renderTemplateAssetDetail(project, asset) {
  const node = getAssetNode(project, asset);
  return `<p><strong>${asset.name}</strong></p>${renderAssetStatus(asset)}
    <p class="muted">Node: ${node?.name || asset.nodeId || asset.node_id || 'n/a'}</p>
    <label>Artifact Name<input data-action="edit-asset-field" data-asset-type="template" data-asset-id="${asset.id}" data-field="name" value="${asset.name || ''}"/></label>
    <label>Format<input data-action="edit-asset-field" data-asset-type="template" data-asset-id="${asset.id}" data-field="format" value="${asset.format || node?.artifactContract?.format || 'markdown'}"/></label>
    <label>Required Sections<textarea data-action="edit-asset-field" data-asset-type="template" data-asset-id="${asset.id}" data-field="required_sections">${formatAssetList(asset.required_sections || asset.requiredSections || node?.artifactContract?.required_sections || [])}</textarea></label>
    <label>Completion Criteria<textarea data-action="edit-asset-field" data-asset-type="template" data-asset-id="${asset.id}" data-field="completion_criteria">${formatAssetList(asset.completion_criteria || asset.completionCriteria || node?.artifactContract?.completion_criteria || node?.artifactContract?.acceptanceCriteria || [])}</textarea></label>
    <label>Template Content<textarea data-action="edit-asset-field" data-asset-type="template" data-asset-id="${asset.id}" data-field="content">${asset.content || ''}</textarea></label>
    <div class="actions"><button data-action="copy-asset" data-asset-type="template" data-asset-id="${asset.id}">Copy Template</button></div>`;
}

function renderAssetDetail(project, state) {
  const { type, id } = state.selectedAsset || {};
  if (!id) return 'Select asset from list.';
  const source = getAssetCollection(project, type);
  const asset = source.find((item) => item.id === id);
  if (!asset) return 'Asset not found';

  if (type === 'prompt') return renderPromptAssetDetail(project, asset);
  if (type === 'checklist') return renderChecklistAssetDetail(project, asset);
  return renderTemplateAssetDetail(project, asset);
}

function renderAssets(state) {
  const project = getActiveProject(state);
  if (!hasProjectRuntime(project)) return renderProjectLoading(state, 'Loading Execution Assets');
  const currentType = state.assetsFilter?.type || 'prompt';
  const filtered = getFilteredAssets(state, project);
  const totals = {
    prompt: (project.assets.prompts || []).length,
    checklist: (project.assets.checklists || []).length,
    template: (project.assets.artifactTemplates || project.assets.artifact_templates || []).length,
    outdated: [...(project.assets.prompts || []), ...(project.assets.checklists || []), ...(project.assets.artifactTemplates || project.assets.artifact_templates || [])].filter((asset) => asset.status === 'outdated').length,
  };
  return `<section class="page"><h2>Execution Assets</h2>
  <p class="muted">Prompts ${totals.prompt} · Checklists ${totals.checklist} · Artifact Templates ${totals.template} · Outdated ${totals.outdated}</p>
  ${state.serverAvailable ? '' : '<div class="card panel inline-warning">Mode: Local Demo / Mock Model. Server persistence is disabled.</div>'}
  <div class="split-2"><article class="card panel"><h3>Asset List</h3>
    <label>Type<select data-action="asset-filter-type"><option value="prompt" ${currentType === 'prompt' ? 'selected' : ''}>Prompts</option><option value="checklist" ${currentType === 'checklist' ? 'selected' : ''}>Checklists</option><option value="template" ${currentType === 'template' ? 'selected' : ''}>Artifact Templates</option></select></label>
    <label>Phase<select data-action="asset-filter-phase"><option value="all">All</option>${project.workflow.phases.map((p) => `<option value="${p.id}" ${(state.assetsFilter?.phase || 'all') === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
    <label>Status<select data-action="asset-filter-status"><option value="all">All</option><option>draft</option><option>reviewed</option><option>final</option><option>outdated</option></select></label>
    <ul>${filtered.map((asset) => { const node = getAssetNode(project, asset); return `<li><button data-action="select-asset" data-asset-type="${currentType}" data-asset-id="${asset.id}">${asset.name} ${badge(asset.status || 'draft', asset.status || 'draft')}<br/><span class="muted">${node?.name || 'No node'} · ${(node?.executionMode && EXECUTION_MODES[node.executionMode]?.label) || 'n/a'}</span></button></li>`; }).join('')}</ul>
  </article>
  <article class="card panel"><h3>Asset Detail</h3><div>${renderAssetDetail(project, state)}</div></article></div>
  </section>`;
}

function normalizeKitPreview(data) {
  return data?.execution_kit || data?.preview || data?.kit || data;
}

function renderExport(state) {
  const project = getActiveProject(state);
  if (!hasProjectRuntime(project)) return renderProjectLoading(state, 'Loading Export');
  const preview = project.executionKit || project.execution_kit;
  const kitType = state.exportKitType || 'draft';
  const files = preview?.files || {};
  const fileKeys = Object.keys(files);
  const activeFile = fileKeys.includes(state.exportPreviewType) ? state.exportPreviewType : fileKeys[0];
  const validationSummary = preview?.validation_summary || {};
  const generatedKits = project.execution_kits || [];
  const latestKit = generatedKits.at(-1);
  return `<section class="page"><h2>Export Execution Kit</h2>
  <p class="muted">Draft Kit may include warnings/errors. Final Kit is blocked by blocking validation errors.</p>
  <div class="split-2"><article class="card panel"><h3>Export Options</h3>
    <label>Kit Type<select data-action="set-kit-type"><option value="draft" ${kitType === 'draft' ? 'selected' : ''}>Draft Kit</option><option value="final" ${kitType === 'final' ? 'selected' : ''}>Final Kit</option></select></label>
    <div class="actions"><button data-action="generate-kit-preview" class="primary">Generate Preview</button><button data-action="generate-kit">Generate ${kitType === 'final' ? 'Final' : 'Draft'} Kit</button><button data-action="copy-kit">Copy Preview</button><button data-action="download-kit" ${latestKit?.id ? '' : 'disabled'}>Download Latest</button><button data-action="refresh-jobs">Refresh Jobs</button></div>
    <p>${preview ? `Preview status: ${preview.status} · snapshot v${preview.snapshotVersion || preview.workflow_snapshot_version}` : 'No preview yet.'}</p>
    <p>Validation: errors ${validationSummary.errors ?? 'N/A'} · warnings ${validationSummary.warnings ?? 'N/A'} · blocking final ${preview?.blockingErrors ?? validationSummary.blocking_final ?? 'N/A'}</p>
    <p>Latest generated kit: ${latestKit ? `${latestKit.id} · ${latestKit.status} · ${latestKit.kit_type || 'draft'} · snapshot v${latestKit.workflow_snapshot_version}` : 'none'}</p>
  </article>
  <article class="card panel"><h3>Execution Kit Preview</h3>
    ${preview ? `<div class="tabs">${fileKeys.map((k) => `<button class="tab ${activeFile === k ? 'active' : ''}" data-action="preview-file" data-file="${k}">${k}</button>`).join('')}</div>
      <pre>${typeof files[activeFile] === 'string' ? files[activeFile] : JSON.stringify(files[activeFile], null, 2)}</pre>
      <div class="actions"><button data-action="copy-kit">Copy Preview JSON</button><button ${preview.canExportFinal ? '' : 'disabled'} data-action="generate-kit" data-kit-type="final">Generate Final Kit</button></div>`
      : '<pre>Generate preview to inspect execution kit artifacts.</pre>'}
  </article></div></section>`;
}

function renderJobList(jobs) {
  if (!jobs.length) return '<li>No jobs yet</li>';
  return jobs.map((job) => {
    const jobId = job.id || job.job_id;
    const status = job.status || 'unknown';
    const stage = job.progress?.stage || 'n/a';
    const message = job.progress?.message || '';
    return `<li><div><strong>${job.type || 'generation_job'}</strong> ${badge(status, status === 'failed' ? 'risk-high' : '')}<p class="muted">${jobId} · ${stage}${message ? ` · ${message}` : ''}</p></div>
      <div class="row">
        <button data-action="job-retry" data-job-id="${jobId}">Retry</button>
        <button data-action="job-cancel" data-job-id="${jobId}" ${status === 'succeeded' || status === 'cancelled' ? 'disabled' : ''}>Cancel</button>
      </div></li>`;
  }).join('');
}

function getFilteredJobs(state) {
  const query = (state.jobSearch || '').trim().toLowerCase();
  const jobs = state.jobs || [];
  if (!query) return jobs;
  return jobs.filter((job) => [
    job.type,
    job.status,
    job.progress?.stage,
    job.progress?.message,
    job.id || job.job_id,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
}

function renderJobResults(state) {
  const jobs = getFilteredJobs(state);
  if (jobs.length) return `<ul class="job-list">${renderJobList(jobs)}</ul>`;
  return (state.jobSearch || '').trim() ? '<p>No jobs match your search.</p>' : `<ul class="job-list">${renderJobList([])}</ul>`;
}

function renderJobs(state) {
  return `<section class="page"><div class="page-head"><label class="project-search"><span>Search jobs</span><input data-action="search-jobs" value="${escapeAttr(state.jobSearch || '')}" placeholder="Search by task type, status, stage, or message"/></label><button data-action="refresh-jobs">Refresh Jobs</button></div>
    ${state.serverAvailable ? '' : '<div class="card panel inline-warning">Mode: Local Demo / Mock Model. Server jobs are unavailable.</div>'}
    ${state.serverError ? `<div class="card panel inline-error">${state.serverError}</div>` : ''}
    <article class="card panel"><h3>Recent Jobs</h3><div data-job-results>${renderJobResults(state)}</div></article>
  </section>`;
}

function renderSettings(state) {
  const logs = state.modelCalls || [];
  const modelStatus = state.modelStatus || {};
  const config = state.modelConfig || modelStatus.config || {};
  const mode = modelStatus?.mode || modelStatus?.model_mode || (state.serverAvailable ? 'unknown' : 'mock');
  const structuredOutputEnabled = config.structured_output_enabled ?? modelStatus.structured_output_enabled ?? true;
  const allowMock = config.allow_mock ?? modelStatus.allow_mock ?? true;
  const logLevel = config.log_level || modelStatus.log_level || 'summary';
  const testButtonText = state.modelTestPending ? 'Testing...' : 'Test Model';
  return `<section class="page"><div class="split-2">
    <form class="card form" data-form="model-config">
      <h3>Model Configuration</h3>
      <div class="grid-2">
        <label>Provider<input name="provider" value="${escapeAttr(config.provider || 'openai-compatible')}" placeholder="openai-compatible"/></label>
        <label>Base URL<input name="api_base_url" value="${escapeAttr(config.api_base_url || 'https://api.openai.com/v1')}" placeholder="https://api.openai.com/v1"/></label>
        <label>API Key<input name="api_key" type="text" value="${config.api_key_configured ? escapeAttr(config.api_key_masked) : ''}" placeholder="Paste API key"/></label>
        <label>Default Model<input name="default_model" value="${escapeAttr(config.default_model || modelStatus.default_model || '')}" placeholder="gpt-4.1-mini"/></label>
        <label>Planning Model<input name="planning_model" value="${escapeAttr(config.planning_model || modelStatus.planning_model || '')}" placeholder="gpt-4.1"/></label>
        <label>Prompt Model<input name="prompt_model" value="${escapeAttr(config.prompt_model || modelStatus.prompt_model || '')}" placeholder="gpt-4.1-mini"/></label>
        <label>Diff Model<input name="diff_model" value="${escapeAttr(config.diff_model || modelStatus.diff_model || '')}" placeholder="gpt-4.1"/></label>
        <label>Timeout MS<input name="timeout_ms" type="number" min="1000" step="1000" value="${escapeAttr(config.timeout_ms || modelStatus.timeout_ms || 60000)}"/></label>
        <label>Structured Output<select name="structured_output_enabled"><option value="true" ${structuredOutputEnabled ? 'selected' : ''}>enabled</option><option value="false" ${structuredOutputEnabled ? '' : 'selected'}>disabled</option></select></label>
        <label>Allow Mock Fallback<select name="allow_mock"><option value="true" ${allowMock ? 'selected' : ''}>enabled</option><option value="false" ${allowMock ? '' : 'selected'}>disabled</option></select></label>
        <label>Log Level<select name="log_level"><option value="summary" ${logLevel === 'summary' ? 'selected' : ''}>summary</option><option value="debug" ${logLevel === 'debug' ? 'selected' : ''}>debug</option><option value="silent" ${logLevel === 'silent' ? 'selected' : ''}>silent</option></select></label>
        <label class="check"><input name="clear_api_key" type="checkbox"/> Clear saved API key</label>
      </div>
      <p class="muted">Saved to local server config: ${escapeAttr(config.config_path || 'n/a')}</p>
      <div class="actions"><button type="button" data-action="test-model-config" ${state.modelTestPending ? 'disabled' : ''}>${testButtonText}</button><button type="button" data-action="refresh-model-status">Refresh</button><button type="submit" class="primary">Save Configuration</button></div>
    </form>
    <div class="card panel">
      <h3>Runtime Status</h3>
      <p>Model Mode: ${mode}</p>
      <p>Provider: ${modelStatus.provider || 'n/a'}</p>
      <p>Default Model: ${modelStatus.default_model || modelStatus.defaultModel || 'n/a'}</p>
      <p>Planning Model: ${modelStatus.planning_model || 'n/a'}</p>
      <p>Prompt Model: ${modelStatus.prompt_model || 'n/a'}</p>
      <p>Diff Model: ${modelStatus.diff_model || 'n/a'}</p>
      <p>Structured Output: ${(modelStatus.structured_output_enabled ?? modelStatus.structuredOutputEnabled) ? 'enabled' : 'disabled'}</p>
      <h3>Recent Model Calls</h3><ul>${renderModelCallList(logs)}</ul>
    </div>
  </div></section>`;
}

function renderPage(state) {
  switch (state.currentPage) {
    case 'projects': return renderProjects(state);
    case 'create': return renderCreatePage();
    case 'context': return renderContextPage(state);
    case 'studio': return renderStudio(state);
    case 'jobs': return renderJobs(state);
    case 'assets': return renderAssets(state);
    case 'export': return renderExport(state);
    case 'settings-model': return renderSettings(state);
    case 'settings': return renderSettings(state);
    default: return renderProjects(state);
  }
}

function render() {
  const state = getState();
  app.innerHTML = `<div class="app-shell" data-theme="open-source">${renderSidebar(state)}<div class="main">${renderTopbar(state)}<main>${renderPage(state)}</main></div></div>${renderToasts(state)}`;
  localizeDom(state.language || 'en');
}

function refreshSidebar() {
  const state = getState();
  const sidebar = app.querySelector('.sidebar');
  if (!sidebar) return;
  sidebar.outerHTML = renderSidebar(state);
  localizeDom(state.language || 'en');
}

function refreshWorkflowDetail() {
  const state = getState();
  const project = getActiveProject(state);
  const target = app.querySelector('.workflow-detail');
  if (!target || !project?.workflow?.nodes) return;
  const selectedNode = project.workflow.nodes.find((node) => node.id === state.selectedNodeId) || project.workflow.nodes[0];
  target.innerHTML = renderNodeDetail(state, project, selectedNode);
  localizeDom(state.language || 'en');
}

function refreshWorkflowCanvas() {
  const state = getState();
  const project = getActiveProject(state);
  const canvas = app.querySelector('.workflow-canvas');
  if (!canvas || !hasProjectRuntime(project)) return;
  const nodes = filteredNodes(state, project);
  const selectedNode = project.workflow.nodes.find((node) => node.id === state.selectedNodeId) || project.workflow.nodes[0];
  const oldContent = canvas.querySelector('.workflow-canvas-content');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderWorkflowCanvasContent(state, project, nodes, selectedNode);
  oldContent?.replaceWith(wrapper.firstElementChild);
  applyWorkflowViewport(getWorkflowViewport(state));
  localizeDom(state.language || 'en');
}

function refreshWorkflowSummary() {
  const state = getState();
  const summary = app.querySelector('[data-workflow-validation-summary]');
  if (!summary) return;
  const errors = state.validationResults.filter((x) => x.level === 'error').length;
  const warnings = state.validationResults.filter((x) => x.level === 'warning').length;
  summary.textContent = `Validation: ${errors} errors, ${warnings} warnings`;
  localizeDom(state.language || 'en');
}

function refreshWorkflowRegions() {
  refreshWorkflowSummary();
  refreshWorkflowCanvas();
  refreshWorkflowDetail();
}

function refreshProjectGrid() {
  const state = getState();
  const target = app.querySelector('[data-project-results]');
  if (!target) return;
  target.outerHTML = `<div data-project-results>${renderProjectGrid(state)}</div>`;
  localizeDom(state.language || 'en');
}

function refreshJobResults() {
  const state = getState();
  const target = app.querySelector('[data-job-results]');
  if (!target) return;
  target.outerHTML = `<div data-job-results>${renderJobResults(state)}</div>`;
  localizeDom(state.language || 'en');
}

function syncProjectMenu() {
  const state = getState();
  app.querySelectorAll('[data-project-menu]').forEach((menu) => {
    menu.hidden = menu.dataset.projectMenu !== state.activeProjectMenuId;
  });
  app.querySelectorAll('.project-menu-trigger').forEach((button) => {
    const active = button.dataset.projectId === state.activeProjectMenuId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-expanded', active ? 'true' : 'false');
  });
}

function syncPhaseMenu() {
  const state = getState();
  app.querySelectorAll('[data-phase-menu]').forEach((menu) => {
    menu.hidden = menu.dataset.phaseMenu !== state.activePhaseMenuId;
  });
  app.querySelectorAll('.phase-menu-trigger').forEach((button) => {
    const active = button.dataset.phaseId === state.activePhaseMenuId;
    button.classList.toggle('active', active);
    button.setAttribute('aria-expanded', active ? 'true' : 'false');
  });
}

function syncWorkflowFilters() {
  const state = getState();
  const popover = app.querySelector('.workflow-filter-popover');
  const button = app.querySelector('[data-action="toggle-workflow-filters"]');
  if (popover) popover.hidden = !state.workflowFiltersOpen;
  if (button) {
    button.classList.toggle('active', Boolean(state.workflowFiltersOpen));
    button.setAttribute('aria-expanded', state.workflowFiltersOpen ? 'true' : 'false');
  }
}

function closeWorkflowFilters() {
  if (!getState().workflowFiltersOpen) return;
  updateUiStateSilently((state) => {
    state.workflowFiltersOpen = false;
  });
  syncWorkflowFilters();
}

function selectWorkflowNode(nodeId) {
  const state = getState();
  const project = getActiveProject(state);
  if (!project?.workflow?.nodes?.some((node) => node.id === nodeId)) return;
  updateUiStateSilently((draft) => {
    draft.selectedNodeId = nodeId;
  });
  app.querySelectorAll('.node-card.selected').forEach((node) => node.classList.remove('selected'));
  app.querySelector(`.node-card[data-node-id="${CSS.escape(nodeId)}"]`)?.classList.add('selected');
  refreshWorkflowDetail();
}

function handleWorkflowPointerDown(event) {
  const canvas = closestElement(event.target, '.workflow-canvas');
  if (!canvas || event.button !== 2) return;
  event.preventDefault();
  const viewport = getWorkflowViewport();
  workflowPan = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    viewport,
    canvas,
  };
  canvas.classList.add('panning');
  canvas.setPointerCapture?.(event.pointerId);
}

function handleWorkflowPointerMove(event) {
  if (!workflowPan || event.pointerId !== workflowPan.pointerId) return;
  event.preventDefault();
  const viewport = {
    ...workflowPan.viewport,
    x: workflowPan.viewport.x + event.clientX - workflowPan.startX,
    y: workflowPan.viewport.y + event.clientY - workflowPan.startY,
  };
  applyWorkflowViewport(viewport);
}

function handleWorkflowPointerUp(event) {
  if (!workflowPan || event.pointerId !== workflowPan.pointerId) return;
  const viewport = {
    ...workflowPan.viewport,
    x: workflowPan.viewport.x + event.clientX - workflowPan.startX,
    y: workflowPan.viewport.y + event.clientY - workflowPan.startY,
  };
  workflowPan.canvas.classList.remove('panning');
  workflowPan.canvas.releasePointerCapture?.(event.pointerId);
  workflowPan = null;
  applyWorkflowViewport(viewport);
  commitWorkflowViewport(viewport);
}

function handleWorkflowWheel(event) {
  if (closestElement(event.target, '.workflow-detail')) return;
  const canvas = closestElement(event.target, '.workflow-canvas');
  if (!canvas) return;
  event.preventDefault();
  const viewport = getWorkflowViewport();
  const nextScale = clamp(viewport.scale * Math.exp(-event.deltaY * 0.0012), WORKFLOW_MIN_SCALE, WORKFLOW_MAX_SCALE);
  if (nextScale === viewport.scale) return;
  const rect = canvas.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const worldX = (cursorX - viewport.x) / viewport.scale;
  const worldY = (cursorY - viewport.y) / viewport.scale;
  const nextViewport = {
    x: cursorX - worldX * nextScale,
    y: cursorY - worldY * nextScale,
    scale: nextScale,
  };
  applyWorkflowViewport(nextViewport);
  commitWorkflowViewport(nextViewport, 180);
}

function resolveTargetPhaseId(project, phaseId) {
  if (phaseId === '__unassigned__') return null;
  if (project?.workflow?.phases?.some((phase) => phase.id === phaseId)) return phaseId;
  return project?.workflow?.phases?.at(-1)?.id || null;
}

function createWorkflowNode(id, phaseId) {
  return {
    id,
    phaseId,
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
  };
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

async function loadProjectRuntime(projectId, { navigate = true, projectSummaries = null } = {}) {
  const [projectResult, workflowResult, jobsResult, assetsResult, historyResult] = await Promise.all([
    apiClient.projectsApi.getById(projectId),
    apiClient.workflowApi.get(projectId),
    apiClient.jobsApi.list(projectId),
    apiClient.assetsApi.list(projectId),
    apiClient.workflowApi.history(projectId).catch(() => ({ data: [] })),
  ]);
  const rawProject = withCamelAliases(projectResult.data?.project || projectResult.data);
  const workflowPayload = withCamelAliases(workflowResult.data || {});
  const workflow = withCamelAliases(workflowPayload.workflow || rawProject.workflow || workflowPayload);
  const assets = withCamelAliases(workflowPayload.assets || assetsResult.data?.assets || assetsResult.data || rawProject.assets || { prompts: [], checklists: [], artifactTemplates: [] });
  const merged = { ...rawProject, workflow, assets };
  setState((prev) => ({
    ...prev,
    projects: projectSummaries
      ? withCamelAliases(projectSummaries).map((p) => (p.id === projectId ? { ...p, ...merged } : p))
      : (prev.projects.some((p) => p.id === projectId)
        ? prev.projects.map((p) => (p.id === projectId ? { ...p, ...merged } : p))
        : [merged, ...prev.projects]),
    activeProjectId: projectId,
    currentPage: navigate ? 'studio' : prev.currentPage,
    jobs: withCamelAliases(jobsResult.data?.jobs || jobsResult.data || []),
    workflowHistory: withCamelAliases(historyResult.data || []),
    validationResults: withCamelAliases(workflowPayload.validation || workflowPayload.validation_results || prev.validationResults),
    selectedNodeId: merged.workflow?.nodes?.[0]?.id || prev.selectedNodeId,
    serverError: '',
  }));
  return merged;
}

async function bootstrapRuntimeMode() {
  try {
    await apiClient.healthApi.check();
    const [{ data: projectsData }, { data: modelStatus }, { data: modelConfig }] = await Promise.all([
      apiClient.projectsApi.list(),
      apiClient.modelApi.status(),
      apiClient.modelApi.config(),
    ]);
    const projects = projectsData?.projects || projectsData || [];
    const currentProjectId = getState().activeProjectId;
    const targetProjectId = projects.some((project) => project.id === currentProjectId)
      ? currentProjectId
      : projects[0]?.id;
    if (targetProjectId) {
      await loadProjectRuntime(targetProjectId, { navigate: false, projectSummaries: projects });
      setState((prev) => ({ ...prev, modelStatus, modelConfig, runtimeMode: 'local_server', serverAvailable: true, serverError: '' }));
    } else {
      setState((prev) => ({ ...prev, projects: [], modelStatus, modelConfig, runtimeMode: 'local_server', serverAvailable: true, serverError: '' }));
    }
  } catch (error) {
    setState((prev) => ({ ...prev, serverError: error.message || 'Server disconnected' }));
    setRuntimeMode('local_demo', false);
  }
}

function handleAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  if (event.type === 'click' && target.tagName !== 'BUTTON') return;
  if (target.tagName === 'BUTTON') event.preventDefault();
  const action = target.dataset.action;

  if (action === 'toggle-settings-nav') {
    updateUiStateSilently((state) => {
      state.settingsNavOpen = !state.settingsNavOpen;
    });
    refreshSidebar();
    return;
  }
  if (action === 'goto') setState((prev) => ({ ...prev, currentPage: target.dataset.page, settingsNavOpen: target.dataset.page?.startsWith('settings') ? true : prev.settingsNavOpen }));
  if (action === 'set-language') setState((prev) => ({ ...prev, language: UI_LANGUAGES[target.value] ? target.value : 'en' }));
  if (action === 'refresh-server-mode') bootstrapRuntimeMode();
  if (action === 'open-project') {
    const projectId = target.dataset.projectId;
    const st = getState();
    const localProject = st.projects.find((p) => p.id === projectId);
    if (!st.serverAvailable && localProject?.workflow) {
      setState((prev) => ({
        ...prev,
        activeProjectId: projectId,
        currentPage: 'studio',
        selectedNodeId: localProject.workflow?.nodes?.[0]?.id || prev.selectedNodeId,
        serverError: 'Mode: Local Demo / Mock Model. Start the local server and click Reconnect Server for persisted editing.',
      }));
      return;
    }
    loadProjectRuntime(projectId).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to load project workflow' })));
  }
  if (action === 'open-project-page') {
    const projectId = target.dataset.projectId;
    const page = target.dataset.page || 'studio';
    const st = getState();
    const localProject = st.projects.find((p) => p.id === projectId);
    if (!st.serverAvailable && localProject) {
      setState((prev) => ({
        ...prev,
        activeProjectId: projectId,
        currentPage: page,
        serverError: 'Mode: Local Demo / Mock Model. Start the local server and click Reconnect Server for persisted editing.',
      }));
      return;
    }
    loadProjectRuntime(projectId, { navigate: false })
      .then(() => setState((prev) => ({ ...prev, currentPage: page })))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || `Failed to load project ${page}` })));
  }
  if (action === 'toggle-project-menu') {
    const projectId = target.dataset.projectId;
    updateUiStateSilently((state) => {
      state.activeProjectMenuId = state.activeProjectMenuId === projectId ? null : projectId;
    });
    syncProjectMenu();
    return;
  }
  if (action === 'rename-project') {
    const projectId = target.dataset.projectId;
    const project = getState().projects.find((item) => item.id === projectId);
    if (!project) return;
    const nextName = window.prompt('Rename Project', project.name || '');
    if (!nextName || nextName.trim() === project.name) {
      updateUiStateSilently((state) => { state.activeProjectMenuId = null; });
      syncProjectMenu();
      return;
    }
    const applyRename = (updatedProject) => setState((prev) => ({
      ...prev,
      projects: prev.projects.map((item) => (item.id === projectId ? { ...item, ...updatedProject, name: nextName.trim() } : item)),
      activeProjectMenuId: null,
    }));
    if (getState().serverAvailable) {
      apiClient.projectsApi.update(projectId, { name: nextName.trim() })
        .then(({ data }) => applyRename(data))
        .catch((error) => showToast(error.message || 'Failed to rename project', 'error'));
    } else {
      applyRename({ name: nextName.trim() });
    }
    return;
  }
  if (action === 'delete-project') {
    const projectId = target.dataset.projectId;
    const project = getState().projects.find((item) => item.id === projectId);
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}"?`)) {
      updateUiStateSilently((state) => { state.activeProjectMenuId = null; });
      syncProjectMenu();
      return;
    }
    const applyDelete = () => setState((prev) => {
      const projects = prev.projects.filter((item) => item.id !== projectId);
      const activeProjectId = prev.activeProjectId === projectId ? projects[0]?.id || null : prev.activeProjectId;
      return { ...prev, projects, activeProjectId, currentPage: 'projects', activeProjectMenuId: null };
    });
    if (getState().serverAvailable) {
      apiClient.projectsApi.remove(projectId)
        .then(applyDelete)
        .catch((error) => showToast(error.message || 'Failed to delete project', 'error'));
    } else {
      applyDelete();
    }
    return;
  }
  if (action === 'select-node') {
    selectWorkflowNode(target.dataset.nodeId);
    return;
  }
  if (action === 'node-tab') {
    updateUiStateSilently((state) => {
      state.activeNodeDetailTab = target.dataset.tab;
    });
    refreshWorkflowDetail();
    return;
  }
  if (action === 'reset-workflow-view') {
    setState((prev) => ({ ...prev, workflowViewport: { x: 0, y: 0, scale: 1 } }));
    return;
  }
  if (action === 'toggle-workflow-filters') {
    updateUiStateSilently((state) => {
      state.workflowFiltersOpen = !state.workflowFiltersOpen;
    });
    syncWorkflowFilters();
    return;
  }
  if (action === 'set-filter-mode') {
    updateUiStateSilently((state) => {
      state.workflowFiltersOpen = true;
      state.studioFilter = { ...state.studioFilter, mode: target.value };
    });
    refreshWorkflowRegions();
    syncWorkflowFilters();
    return;
  }
  if (action === 'set-filter-risk') {
    updateUiStateSilently((state) => {
      state.workflowFiltersOpen = true;
      state.studioFilter = { ...state.studioFilter, risk: target.value };
    });
    refreshWorkflowRegions();
    syncWorkflowFilters();
    return;
  }

  if (action === 'validate') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.validate(project.id)
      .then(({ data }) => setState((prev) => ({ ...prev, validationResults: data.validation || data.results || [] })))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'VALIDATION_ERROR'} (${error.requestId || 'n/a'}): ${error.message || 'Validation failed'}` })));
    return;
  }
  if (action === 'toggle-history') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.history(project.id).then(({ data }) => {
      const latest = (data || []).slice(-1)[0];
      const msg = latest ? `History latest: v${latest.version} ${latest.summary || latest.change_source}` : 'No history yet';
      setState((prev) => ({ ...prev, serverError: msg, workflowHistory: data || [], workflowHistoryOpen: true }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to load history' })));
    return;
  }
  if (action === 'save-workflow-history') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.saveHistory(project.id, { workflow_version: project.workflow.version, summary: `Saved workflow version ${project.workflow.version}.` }).then(({ data }) => {
      setState((prev) => ({ ...prev, serverError: `Saved workflow version ${project.workflow.version}.`, workflowHistory: data.history || [], workflowHistoryOpen: true }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to save workflow history' })));
    return;
  }
  if (action === 'undo-workflow') {
    const st = getState();
    const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.undo(project.id).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.message || 'Failed to undo workflow' })));
    return;
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    return;
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    return;
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
  if (action === 'restore-version') {
    const st = getState(); const project = getActiveProject(st);
    if (!project?.id || !st.serverAvailable) return;
    apiClient.workflowApi.restore(project.id, Number(target.dataset.version)).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'view-version') {
    const project = getActiveProject();
    if (!project?.id) return;
    apiClient.workflowApi.version(project.id, Number(target.dataset.version)).then(({ data }) => {
      const snap = data.snapshot || data;
      setState((prev) => ({ ...prev, serverError: `Version ${snap.workflow_version}: phases ${snap.phases?.length || 0}, nodes ${snap.nodes?.length || 0}, edges ${snap.edges?.length || 0}` }));
    }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }

  if (action === 'toggle-ai-edit') setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, open: !prev.aiEdit.open } }));
  if (action === 'use-ai-suggestion') setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: target.dataset.suggestion } }));

  if (action === 'generate-diff') {
    if (getState().serverAvailable) {
      setState((prev) => ({ ...prev, serverError: 'AI Assisted Edit is disabled in Phase 3 server mode.' }));
      return;
    }
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      apiClient.diffsApi.generate(project.id, { request: st.aiEdit.request, workflow_version: project.workflow.version })
        .then(({ data }) => setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: data.diff }, jobs: data.job_id ? prev.jobs : prev.jobs, modelStatus: data.model_status || prev.modelStatus })))
        .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      const diff = modelGenerateWorkflowDiff(st.aiEdit.request, project.workflow, project.assets);
      setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff } }));
    }
  }

  if (action === 'toggle-diff-change') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: { ...prev.aiEdit.diff, changes: prev.aiEdit.diff.changes.map((c) => (c.id === target.dataset.changeId ? { ...c, selected: !c.selected } : c)) } } }));
  }

  if (action === 'apply-diff-all' || action === 'apply-diff-selected') {
    if (getState().serverAvailable) {
      setState((prev) => ({ ...prev, serverError: 'Diff apply from local mock is disabled in server mode.' }));
      return;
    }
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id && st.aiEdit.diff?.id) {
      const selectedIds = action === 'apply-diff-selected' ? (st.aiEdit.diff.changes || []).filter((change) => change.selected).map((change) => change.id) : [];
      apiClient.diffsApi.apply(project.id, st.aiEdit.diff.id, { workflow_version: project.workflow.version, selected_change_ids: selectedIds })
        .then(() => refreshProjectRuntime(project.id))
        .then(() => setState((prev) => ({ ...prev, aiEdit: { open: false, request: '', diff: null } })))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      const updated = applyWorkflowDiff(project, st.aiEdit.diff, action === 'apply-diff-selected');
      markProjectWorkflowChanged(updated, 'Diff applied', st.aiEdit.diff.changes.filter((change) => change.selected || action === 'apply-diff-all').map((change) => change.targetId));
      replaceActiveProject(updated);
      setState((prev) => ({ ...prev, aiEdit: { open: false, request: '', diff: null } }));
    }
  }

  if (action === 'reject-diff') {
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id && st.aiEdit.diff?.id) {
      apiClient.diffsApi.reject(project.id, st.aiEdit.diff.id)
        .then(() => setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: null } })))
        .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, diff: null } }));
    }
  }

  if (action === 'generate-kit-preview' || action === 'generate-kit') {
    const st = getState();
    const project = getActiveProject(st);
    const kitType = target.dataset.kitType || st.exportKitType || 'draft';
    if (st.serverAvailable && project?.id) {
      const request = action === 'generate-kit-preview'
        ? apiClient.executionKitsApi.preview(project.id, { kit_type: kitType })
        : apiClient.executionKitsApi.generate(project.id, { kit_type: kitType });
      request.then(({ data }) => {
        const kit = normalizeKitPreview(data);
        updateActiveProject((draft) => {
          draft.executionKit = kit;
          if (data.kit) draft.execution_kits = [...(draft.execution_kits || []), data.kit];
        }, action === 'generate-kit-preview' ? 'Execution kit preview generated' : 'Execution kit generated');
        setState((prev) => ({ ...prev, validationResults: data.validation_results || prev.validationResults, jobs: data.job_id ? prev.jobs : prev.jobs }));
      }).catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      const validationResults = recomputeValidation(project);
      const kit = modelGenerateExecutionKit(project.workflow, project.assets, validationResults, { kit_type: kitType });
      updateActiveProject((draft) => {
        draft.executionKit = kit;
      }, action === 'generate-kit-preview' ? 'Execution kit preview generated' : 'Execution kit generated');
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
    Promise.all([apiClient.modelApi.status(), apiClient.modelApi.config(), apiClient.modelApi.calls()])
      .then(([statusResult, configResult, callsResult]) => {
        setState((prev) => ({ ...prev, modelStatus: statusResult.data || {}, modelConfig: configResult.data || {}, modelCalls: callsResult.data?.calls || callsResult.data || [] }));
        showToast('Model status refreshed.', 'success');
      })
      .catch((error) => showToast(error.message || 'Failed to refresh model status', 'error'));
  }

  if (action === 'test-model-config') {
    if (getState().modelTestPending) return;
    updateUiStateSilently((state) => {
      state.modelTestPending = true;
    });
    target.disabled = true;
    target.textContent = translateText('Testing...', getState().language || 'en');
    apiClient.modelApi.test()
      .then((testResult) => Promise.all([apiClient.modelApi.status(), apiClient.modelApi.config(), apiClient.modelApi.calls()])
        .then(([statusResult, configResult, callsResult]) => ({ testResult, statusResult, configResult, callsResult })))
      .then(({ testResult, statusResult, configResult, callsResult }) => {
        setState((prev) => ({ ...prev, modelStatus: statusResult.data || {}, modelConfig: configResult.data || {}, modelCalls: callsResult.data?.calls || callsResult.data || [], modelTestPending: false }));
        if (testResult.data?.status === 'failed') showToast(testResult.data.error || 'Model test failed.', 'error');
        else showToast('Model test completed.', 'success');
      })
      .catch((error) => {
        setState((prev) => ({ ...prev, modelTestPending: false }));
        showToast(error.message || 'Failed to test model configuration', 'error');
      });
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
  if (action === 'set-kit-type') setState((prev) => ({ ...prev, exportKitType: target.value }));

  if (action === 'build-context-summary') {
    updateActiveProject((draft) => {
      draft.contextPack.summary = buildContextSummary(draft.contextPack);
    }, 'Context summary refreshed');
  }

  if (action === 'recommend-mode') {
    if (getState().serverAvailable) {
      setState((prev) => ({ ...prev, serverError: 'Mock mode recommendation is disabled in server mode.' }));
      return;
    }
    const nodeId = target.dataset.nodeId;
    updateActiveProject((draft) => {
      const node = draft.workflow.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.executionMode = recommendExecutionMode(node, draft.contextPack, getState().validationResults);
      node.history.push({ at: new Date().toISOString(), action: 'Execution mode recommended by mock model' });
    }, 'Execution mode updated', [nodeId]);
  }

  if (action === 'generate-prompt' || action === 'generate-checklist') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    if (st.serverAvailable && project?.id) {
      const request = action === 'generate-prompt' ? apiClient.nodesApi.generatePrompt(project.id, nodeId) : apiClient.nodesApi.generateChecklist(project.id, nodeId);
      request.then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (action === 'generate-prompt') {
          const prompt = modelGeneratePrompt(node);
          const index = draft.assets.prompts.findIndex((p) => p.nodeId === nodeId);
          if (index >= 0) draft.assets.prompts[index] = prompt;
          else if (prompt) draft.assets.prompts.push(prompt);
          node.promptStatus = 'draft';
        } else {
          const checklist = modelGenerateChecklist(node.reviewGate, node);
          const index = draft.assets.checklists.findIndex((c) => c.nodeId === nodeId);
          if (index >= 0) draft.assets.checklists[index] = checklist;
          else draft.assets.checklists.push(checklist);
          node.checklistStatus = 'draft';
        }
      }, `${action === 'generate-prompt' ? 'Prompt' : 'Checklist'} generated`, [nodeId]);
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
  if (action === 'remove-review-gate') {
    const st = getState(); const project = getActiveProject(st); const nodeId = target.dataset.nodeId;
    if (st.serverAvailable && project?.id) {
      apiClient.nodesApi.patch(project.id, nodeId, { workflow_version: project.workflow.version, reviewGate: null }).then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    }
  }

  if (action === 'add-phase') {
    const st = getState();
    const project = getActiveProject(st);
    if (!project?.workflow?.phases) return;
    const nextOrder = Math.max(0, ...project.workflow.phases.map((phase) => Number(phase.order || 0))) + 1;
    const phase = { id: `phase-${Date.now()}`, name: `New Phase ${nextOrder}`, order: nextOrder };
    const nextPhases = [...project.workflow.phases, phase];
    if (st.serverAvailable && project?.id) {
      apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, phases: nextPhases })
        .then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : (error.message || 'Failed to add phase') })));
      return;
    }
    updateActiveProject((draft) => {
      draft.workflow.phases.push(phase);
      draft.workflow.version += 1;
    }, 'Phase added');
  }

  if (action === 'toggle-phase-menu') {
    const phaseId = target.dataset.phaseId;
    updateUiStateSilently((state) => {
      state.activePhaseMenuId = state.activePhaseMenuId === phaseId ? null : phaseId;
    });
    syncPhaseMenu();
    return;
  }

  if (action === 'rename-phase') {
    const st = getState();
    const project = getActiveProject(st);
    const phaseId = target.dataset.phaseId;
    const input = app.querySelector(`input[data-action="phase-name-field"][data-phase-id="${CSS.escape(phaseId)}"]`);
    const name = input?.value?.trim();
    if (!project?.workflow?.phases || !name) return;
    const nextPhases = project.workflow.phases.map((phase) => (phase.id === phaseId ? { ...phase, name } : phase));
    if (st.serverAvailable && project?.id) {
      apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, phases: nextPhases })
        .then(() => refreshProjectRuntime(project.id))
        .then(() => setState((prev) => ({ ...prev, activePhaseMenuId: null })))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : (error.message || 'Failed to rename phase') })));
      return;
    }
    updateActiveProject((draft) => {
      draft.workflow.phases = nextPhases;
      draft.workflow.version += 1;
    }, 'Phase renamed');
    setState((prev) => ({ ...prev, activePhaseMenuId: null }));
  }

  if (action === 'delete-phase') {
    const st = getState();
    const project = getActiveProject(st);
    const phaseId = target.dataset.phaseId;
    if (!project?.workflow?.phases?.some((phase) => phase.id === phaseId)) return;
    if (!window.confirm('Delete this phase? Existing nodes will move to Unassigned.')) return;
    const nextPhases = project.workflow.phases.filter((phase) => phase.id !== phaseId);
    const nextNodes = project.workflow.nodes.map((node) => (node.phaseId === phaseId ? { ...node, phaseId: null } : node));
    if (st.serverAvailable && project?.id) {
      apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, phases: nextPhases, nodes: nextNodes })
        .then(() => refreshProjectRuntime(project.id))
        .then(() => setState((prev) => ({ ...prev, activePhaseMenuId: null })))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : (error.message || 'Failed to delete phase') })));
      return;
    }
    updateActiveProject((draft) => {
      draft.workflow.phases = nextPhases;
      draft.workflow.nodes = nextNodes;
      draft.workflow.version += 1;
    }, 'Phase deleted');
    setState((prev) => ({ ...prev, activePhaseMenuId: null }));
  }

  if (action === 'add-node' || action === 'add-node-phase') {
    const phaseId = target.dataset.phaseId;
    const st = getState();
    const project = getActiveProject(st);
    const selectedPhase = resolveTargetPhaseId(project, phaseId);
    const id = `node-${Date.now()}`;
    const node = createWorkflowNode(id, selectedPhase);
    if (st.serverAvailable && project?.id) {
      const nextNodes = [...project.workflow.nodes, node];
      apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, nodes: nextNodes }).then(({ data }) => {
        const updated = structuredClone(project);
        updated.workflow = withCamelAliases(data.workflow || { ...project.workflow, nodes: nextNodes, version: project.workflow.version + 1 });
        replaceActiveProjectSilently(updated);
        updateUiStateSilently((state) => {
          state.selectedNodeId = id;
          state.activePhaseMenuId = null;
          state.validationResults = withCamelAliases(data.validation_results || data.validationResults || state.validationResults);
        });
        refreshWorkflowRegions();
      })
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : (error.message || 'Failed to add node') })));
      return;
    }
    const updated = structuredClone(project);
    updated.workflow.nodes.push(node);
    markProjectWorkflowChanged(updated, 'Node added', [id]);
    replaceActiveProjectSilently(updated);
    updateUiStateSilently((state) => {
      state.selectedNodeId = id;
      state.activePhaseMenuId = null;
    });
    refreshWorkflowRegions();
    return;
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
  if (action === 'add-edge-from-node') {
    const st = getState(); const project = getActiveProject(st); const from = target.dataset.nodeId;
    if (!project?.id || !st.serverAvailable) return;
    const to = project.workflow.nodes.find((n) => n.id !== from)?.id;
    if (!to) return;
    const nextEdges = [...project.workflow.edges, { id: `edge-${Date.now()}`, from, to, dependency_type: 'sequential_dependency', required_outputs: [], gate_id: null }];
    apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, edges: nextEdges }).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'delete-edge') {
    const st = getState(); const project = getActiveProject(st); const edgeId = target.dataset.edgeId;
    if (!project?.id || !st.serverAvailable) return;
    const edge = project.workflow.edges.find((e) => (e.id || `${e.from}-${e.to}`) === edgeId);
    if (!edge || !window.confirm(`Delete edge ${edge.from} -> ${edge.to}?`)) return;
    const nextEdges = project.workflow.edges.filter((e) => (e.id || `${e.from}-${e.to}`) !== edgeId);
    apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, edges: nextEdges }).then(() => refreshProjectRuntime(project.id))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }
  if (action === 'start-edge-edit') {
    const project = getActiveProject();
    const edgeId = target.dataset.edgeId;
    const edge = project.workflow.edges.find((e) => (e.id || `${e.from}-${e.to}`) === edgeId);
    if (!edge) return;
    setState((prev) => ({ ...prev, edgeEdit: { id: edgeId, dependency_type: edge.dependency_type || edge.dependencyType || 'sequential_dependency', required_outputs: edge.required_outputs || [], gate_id: edge.gate_id || '' } }));
  }
  if (action === 'save-edge-edit') {
    const st = getState(); const project = getActiveProject(st); const edit = st.edgeEdit;
    if (!project?.id || !st.serverAvailable || !edit?.id) return;
    const nextEdges = project.workflow.edges.map((e) => ((e.id || `${e.from}-${e.to}`) === edit.id ? { ...e, dependency_type: edit.dependency_type, required_outputs: edit.required_outputs, gate_id: edit.gate_id || null } : e));
    apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, edges: nextEdges }).then(() => refreshProjectRuntime(project.id))
      .then(() => setState((prev) => ({ ...prev, edgeEdit: null })))
      .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }

  if (action === 'copy-kit') {
    const project = getActiveProject();
    if (project.executionKit) navigator.clipboard?.writeText(JSON.stringify(project.executionKit.files, null, 2));
  }
  if (action === 'download-kit') {
    const st = getState();
    const project = getActiveProject(st);
    const kit = (project.execution_kits || []).at(-1);
    if (!kit?.id || !st.serverAvailable) return;
    apiClient.executionKitsApi.download(project.id, kit.id)
      .then(({ data }) => {
        navigator.clipboard?.writeText(data.content || JSON.stringify(data, null, 2));
        setState((prev) => ({ ...prev, serverError: `Downloaded ${data.filename || kit.id} copied to clipboard.` }));
      })
      .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
  }

  if (action === 'asset-filter-type') setState((prev) => ({ ...prev, assetsFilter: { ...prev.assetsFilter, type: target.value }, selectedAsset: null }));
  if (action === 'asset-filter-phase') setState((prev) => ({ ...prev, assetsFilter: { ...prev.assetsFilter, phase: target.value } }));
  if (action === 'asset-filter-status') setState((prev) => ({ ...prev, assetsFilter: { ...prev.assetsFilter, status: target.value } }));
  if (action === 'select-asset') setState((prev) => ({ ...prev, selectedAsset: { type: target.dataset.assetType, id: target.dataset.assetId } }));

  if (action === 'copy-asset') {
    const project = getActiveProject();
    const asset = getAssetCollection(project, target.dataset.assetType).find((item) => item.id === target.dataset.assetId);
    const content = asset?.content || (asset?.items || []).join('\n') || JSON.stringify(asset || {}, null, 2);
    navigator.clipboard?.writeText(content);
    setState((prev) => ({ ...prev, serverError: 'Asset copied to clipboard.' }));
  }

  if (action === 'regenerate-asset') {
    const st = getState();
    const project = getActiveProject(st);
    const assetType = target.dataset.assetType;
    const assetId = target.dataset.assetId;
    const asset = getAssetCollection(project, assetType).find((item) => item.id === assetId);
    const nodeId = asset?.nodeId || asset?.node_id;
    if (!asset || !nodeId) return;
    if (st.serverAvailable && project?.id) {
      const regenerate = assetType === 'prompt' ? apiClient.nodesApi.generatePrompt(project.id, nodeId) : assetType === 'checklist' ? apiClient.nodesApi.generateChecklist(project.id, nodeId) : apiClient.assetsApi.regenerate(project.id, assetId);
      regenerate.then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        if (assetType === 'prompt') {
          const prompt = draft.assets.prompts.find((p) => p.id === assetId);
          Object.assign(prompt, modelGeneratePrompt(node), { status: 'draft', outdatedReason: '' });
          node.promptStatus = 'draft';
        } else if (assetType === 'checklist') {
          const checklist = draft.assets.checklists.find((c) => c.id === assetId);
          Object.assign(checklist, modelGenerateChecklist(node.reviewGate, node), { status: 'draft', outdatedReason: '' });
          node.checklistStatus = 'draft';
        }
      }, `${assetType} regenerated`, [nodeId]);
    }
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.dataset.action === 'search-projects') {
    updateUiStateSilently((state) => {
      state.projectSearch = target.value;
    });
    refreshProjectGrid();
    return;
  }
  if (target.dataset.action === 'search-jobs') {
    updateUiStateSilently((state) => {
      state.jobSearch = target.value;
    });
    refreshJobResults();
    return;
  }
  if (target.dataset.action === 'set-ai-request') {
    setState((prev) => ({ ...prev, aiEdit: { ...prev.aiEdit, request: target.value } }));
    return;
  }

  if (target.dataset.action === 'edit-asset-field') {
    const st = getState();
    const project = getActiveProject(st);
    const assetType = target.dataset.assetType;
    const assetId = target.dataset.assetId;
    const field = target.dataset.field;
    const listFields = new Set(['items', 'context_required', 'acceptanceCriteria', 'required_sections', 'completion_criteria']);
    const value = listFields.has(field) ? splitLines(target.value) : target.value;
    const asset = getAssetCollection(project, assetType).find((item) => item.id === assetId);
    if (!asset) return;
    const payload = { [field]: value, status: field === 'status' ? value : 'draft' };
    if (field === 'acceptanceCriteria') payload.acceptance_criteria = value;
    if (field === 'context_required') payload.contextRequired = value;
    if (st.serverAvailable && project?.id) {
      apiClient.assetsApi.update(project.id, assetId, payload)
        .then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      updateActiveProject((draft) => {
        const draftAsset = getAssetCollection(draft, assetType).find((item) => item.id === assetId);
        if (!draftAsset) return;
        Object.assign(draftAsset, payload, { manually_edited: true, updatedAt: new Date().toISOString() });
      }, 'Asset edited', [asset.nodeId || asset.node_id].filter(Boolean));
    }
  }

  if (target.dataset.action === 'update-node-field') {
    const nodeId = target.dataset.nodeId;
    const st = getState();
    const project = getActiveProject(st);
    const field = target.dataset.field;
    const value = (field === 'inputs' || field === 'outputs') ? target.value.split('\n').map((x) => x.trim()).filter(Boolean) : target.value;
    if (st.serverAvailable && project?.id) {
      apiClient.nodesApi.patch(project.id, nodeId, { workflow_version: project.workflow.version, [field]: value })
        .then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
      apiClient.nodesApi.patch(project.id, nodeId, { workflow_version: project.workflow.version, artifactContract: { ...(project.workflow.nodes.find((n) => n.id === nodeId)?.artifactContract || {}), outputFormat: target.value } })
        .then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    } else {
      updateActiveProject((draft) => {
        const node = draft.workflow.nodes.find((n) => n.id === nodeId);
        if (!node) return;
        node.artifactContract.outputFormat = target.value;
      }, 'Artifact contract updated', [nodeId]);
    }
  }
  if (target.dataset.action === 'update-artifact-contract-field') {
    const nodeId = target.dataset.nodeId;
    const field = target.dataset.field;
    const st = getState();
    const project = getActiveProject(st);
    const node = project?.workflow?.nodes?.find((n) => n.id === nodeId);
    if (!node) return;
    const artifactContract = structuredClone(node.artifactContract || {});
    artifactContract[field] = (field === 'required_sections' || field === 'completion_criteria') ? target.value.split('\n').map((x) => x.trim()).filter(Boolean) : target.value;
    if (field === 'format') artifactContract.outputFormat = artifactContract.format;
    if (st.serverAvailable && project?.id) {
      apiClient.nodesApi.patch(project.id, nodeId, { workflow_version: project.workflow.version, artifactContract })
        .then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
    }
  }
  if (target.dataset.action === 'edge-edit-field') {
    const field = target.dataset.field;
    const value = field === 'required_outputs' ? target.value.split('\n').map((x) => x.trim()).filter(Boolean) : target.value;
    setState((prev) => ({ ...prev, edgeEdit: { ...(prev.edgeEdit || {}), [field]: value } }));
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
      apiClient.nodesApi.patch(project.id, nodeId, { workflow_version: project.workflow.version, reviewGate: nextGate })
        .then(() => refreshProjectRuntime(project.id))
        .catch((error) => setState((prev) => ({ ...prev, serverError: error.code === 'VERSION_CONFLICT' ? 'Workflow has been updated by another operation. Please refresh and try again.' : `${error.code || 'API_ERROR'}: ${error.message} (${error.requestId || 'n/a'})` })));
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
      await loadProjectRuntime(createdProject.id, { navigate: false, projectSummaries: projects });
      setState((prev) => ({ ...prev, activeProjectId: createdProject.id, currentPage: data.setupMode === 'org_aware' ? 'context' : 'studio' }));
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

  if (event.target.dataset.form === 'model-config') {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.target));
    const currentConfig = getState().modelConfig || {};
    const apiKeyInput = raw.api_key === currentConfig.api_key_masked ? '' : raw.api_key;
    const payload = {
      provider: raw.provider,
      api_base_url: raw.api_base_url,
      api_key: apiKeyInput,
      default_model: raw.default_model,
      planning_model: raw.planning_model,
      prompt_model: raw.prompt_model,
      diff_model: raw.diff_model,
      timeout_ms: raw.timeout_ms,
      structured_output_enabled: raw.structured_output_enabled,
      allow_mock: raw.allow_mock,
      log_level: raw.log_level,
      clear_api_key: raw.clear_api_key === 'on',
    };
    apiClient.modelApi.saveConfig(payload)
      .then(() => Promise.all([apiClient.modelApi.status(), apiClient.modelApi.config(), apiClient.modelApi.calls()]))
      .then(([statusResult, configResult, callsResult]) => {
        setState((prev) => ({ ...prev, modelStatus: statusResult.data || {}, modelConfig: configResult.data || {}, modelCalls: callsResult.data?.calls || callsResult.data || [] }));
        showToast('Model configuration saved.', 'success');
      })
      .catch((error) => showToast(error.message || 'Failed to save model configuration', 'error'));
  }
}

function handleDocumentOverlayClick(event) {
  if (closestElement(event.target, '.workflow-filter-control')) return;
  closeWorkflowFilters();
  if (closestElement(event.target, '.project-menu-control')) return;
  if (!getState().activeProjectMenuId) return;
  updateUiStateSilently((state) => {
    state.activeProjectMenuId = null;
  });
  syncProjectMenu();
}

subscribe(render);
render();

bootstrapRuntimeMode();

document.addEventListener('click', handleAction);
document.addEventListener('click', handleDocumentOverlayClick);
document.addEventListener('input', handleInput);
document.addEventListener('change', handleAction);
document.addEventListener('submit', handleSubmit);
document.addEventListener('pointerdown', handleWorkflowPointerDown);
document.addEventListener('pointermove', handleWorkflowPointerMove);
document.addEventListener('pointerup', handleWorkflowPointerUp);
document.addEventListener('pointercancel', handleWorkflowPointerUp);
document.addEventListener('wheel', handleWorkflowWheel, { passive: false });
document.addEventListener('contextmenu', (event) => {
  if (closestElement(event.target, '.workflow-canvas')) event.preventDefault();
});
