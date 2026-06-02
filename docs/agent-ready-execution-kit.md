# Agent-Ready Execution Kit

## Purpose

Prepare work before AI agents execute.

An Agent-Ready Execution Kit converts a vague project idea, PRD, issue, or implementation goal into a structured package that humans can review and then hand to AI coding agents.

## Contents

Export v1 generates the following Community Core files:

- `workflow_spec.yaml` — workflow phases, nodes, execution modes, review gates, artifact contracts, and validation results.
- `agent_task_list.md` — ordered agent-ready tasks with required context, output contracts, acceptance criteria, and handoff guidance.
- `prompt_pack.md` — prompts prepared for downstream coding agents.
- `review_checklists.md` — human review gates and checklist items.
- `artifact_templates.md` — output templates and completion criteria.
- `responsibility_map.md` — ownership by role, phase, and execution mode.
- `risk_report.md` — high-risk nodes and validation findings.

## Local Community Export

The Community Core includes a local example export command:

```bash
npm run export:example
```

This writes the built-in community example kit to `execution-kit/`. The generated directory is local output and is intentionally not a Pro template or commercial asset.

## Why it matters

- reduces vague prompts
- makes agent work reviewable
- prevents high-risk AI autonomy
- helps humans approve outputs before downstream execution

## Example Use Cases

- PRD to Codex task pack
- GitHub issue to agent-ready issues
- SaaS MVP to Claude Code execution plan
- Legacy system modernization plan
- GEO campaign launch workflow
