export const EXECUTION_MODES = {
  human_only: { label: 'Human Only', color: '#334155', ai: false },
  ai_draft_human_review: { label: 'AI Draft + Human Review', color: '#2563eb', ai: true },
  human_lead_ai_assist: { label: 'Human Lead + AI Assist', color: '#7c3aed', ai: true },
  ai_execute_human_approval: { label: 'AI Execute + Human Approval', color: '#f59e0b', ai: true },
  ai_autonomous: { label: 'AI Autonomous', color: '#16a34a', ai: true },
};

export const RISK_LEVELS = ['low', 'medium', 'high'];

export const STATUS_LIST = [
  'missing',
  'draft',
  'reviewed',
  'validated',
  'final',
  'applied',
  'rejected',
  'outdated',
  'failed_validation',
  'invalid',
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
