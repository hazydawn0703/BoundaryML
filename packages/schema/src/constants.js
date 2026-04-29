export const EXECUTION_MODE = {
  human_only: 'human_only',
  ai_draft_human_review: 'ai_draft_human_review',
  human_lead_ai_assist: 'human_lead_ai_assist',
  ai_execute_human_approval: 'ai_execute_human_approval',
  ai_autonomous: 'ai_autonomous',
};

export const EXECUTION_MODES = {
  [EXECUTION_MODE.human_only]: { label: 'Human Only', color: '#334155', ai: false },
  [EXECUTION_MODE.ai_draft_human_review]: { label: 'AI Draft + Human Review', color: '#2563eb', ai: true },
  [EXECUTION_MODE.human_lead_ai_assist]: { label: 'Human Lead + AI Assist', color: '#7c3aed', ai: true },
  [EXECUTION_MODE.ai_execute_human_approval]: { label: 'AI Execute + Human Approval', color: '#f59e0b', ai: true },
  [EXECUTION_MODE.ai_autonomous]: { label: 'AI Autonomous', color: '#16a34a', ai: true },
};

export const RISK_LEVEL = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

export const RISK_LEVELS = Object.values(RISK_LEVEL);

export const WORKFLOW_STATUS = {
  draft: 'draft',
  reviewed: 'reviewed',
  validated: 'validated',
  final: 'final',
  outdated: 'outdated',
};

export const NODE_STATUS = {
  draft: 'draft',
  reviewed: 'reviewed',
  applied: 'applied',
  failed_validation: 'failed_validation',
  outdated: 'outdated',
};

export const ASSET_STATUS = {
  missing: 'missing',
  draft: 'draft',
  reviewed: 'reviewed',
  final: 'final',
  outdated: 'outdated',
  invalid: 'invalid',
};

export const VALIDATION_LEVEL = {
  error: 'error',
  warning: 'warning',
  suggestion: 'suggestion',
};

export const JOB_STATUS = {
  queued: 'queued',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  expired: 'expired',
};

export const STATUS_LIST = [
  ...Object.values(ASSET_STATUS),
  ...Object.values(NODE_STATUS),
  ...Object.values(WORKFLOW_STATUS),
  'applied',
  'rejected',
];

export const DEFAULT_PHASES = [
  'Discovery',
  'Product Design',
  'Technical Design',
  'Development',
  'Testing',
  'Launch',
];

export const AI_EDIT_SUGGESTIONS = [
  'make this workflow more conservative',
  'add review gates to all high-risk nodes',
  'add testing nodes before launch',
  'generate prompts for all ai nodes',
];
