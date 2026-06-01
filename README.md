# BoundaryML

Project kickoff and governance layer for AI agents.

BoundaryML turns vague project ideas into agent-ready execution kits:
- workflow map
- agent task list
- prompt pack
- review checklists
- artifact contracts
- risk gates

BoundaryML does not replace coding agents. BoundaryML prepares work before agents execute. It defines task boundaries, required context, output contracts, review gates, and acceptance criteria.

BoundaryML is not Jira / Linear / Notion. BoundaryML is not Codex / Claude Code / Copilot. BoundaryML is the planning and governance layer before agents execute.

Current status: **early open-core MVP**. The repository contains the community core, local-first demo/server modes, schema validation, basic rules, and basic execution-kit generation.

## Why BoundaryML

AI coding agents are becoming powerful execution engines, but teams still lose time because upstream work is vague:
- prompts do not define the task boundary;
- context is scattered across docs, tickets, and conversations;
- expected artifacts are not specified;
- reviews happen after risky autonomous work;
- acceptance criteria are implied instead of explicit.

BoundaryML solves the pre-execution problem. It turns a project idea into structured, reviewable instructions that humans can approve before handing work to Codex, Claude Code, GitHub Copilot, Cursor, or another AI coding agent.

## What it generates

Agent-ready Execution Kit export v1 generates:
- `workflow_spec.yaml` with workflow phases, nodes, execution modes, review gates, artifact contracts, and validation results;
- `agent_task_list.md` with execution order, task boundaries, required context, output contracts, acceptance criteria, and handoff guidance;
- `prompt_pack.md` for downstream coding agents;
- `review_checklists.md` for human approval;
- `artifact_templates.md` for expected outputs;
- `responsibility_map.md` across human owners, phases, and execution modes;
- `risk_report.md` for high-risk nodes and validation findings.

## How it works

1. Capture project context, delivery scope, team roles, constraints, and sensitive areas.
2. Build a workflow map that separates human-led, AI-assisted, and approval-gated steps.
3. Validate the workflow against the BoundaryML Spec and basic governance rules.
4. Generate an execution kit for downstream use in coding-agent workflows.
5. Review the kit before agents execute code, produce artifacts, or touch production paths.

BoundaryML is intentionally upstream of execution. It does not run coding agents, replace source-control review, or become the system of record for project management.

## Open Core Model

BoundaryML uses an open-core model:

- **Community Core** is open source and designed for local adoption, schema experimentation, basic validation, and basic execution-kit export.
- **Commercial offerings** fund advanced templates, rule packs, hosted collaboration, enterprise deployment, and done-for-you execution-kit services.

See [COMMERCIAL.md](COMMERCIAL.md), [Open Core Strategy](docs/open-core-strategy.md), and [Community vs Pro](docs/community-vs-pro.md) for the full boundary.

## Community vs Pro vs Enterprise

| Area | Community Core | Pro Templates | Enterprise / Cloud |
| --- | --- | --- | --- |
| Spec and schema | BoundaryML Spec, workflow schema, validation | Template-specific extensions | Organization policies and governance overlays |
| Local usage | Local Demo Mode and Local Server Mode | Local use of purchased templates | Self-hosted or hosted team environments |
| Rules | Basic validation rules | Advanced agent governance rule packs | Compliance, security, approval, audit, and production release packs |
| Exports | Basic Execution Kit export | Advanced template outputs | GitHub / Linear / Jira advanced exporters and audit workflows |
| Examples | Limited community examples | Production-ready pro templates | Custom templates and workspace rollout support |
| Services | Community support | Paid kit customization | Hosted BoundaryML Cloud, enterprise deployment, and consulting |

## Commercial Services

Commercial offerings may include:
- Pro workflow templates;
- Agent governance rule packs;
- Advanced GitHub / Linear / Jira exporters;
- GEO Launch Ops Kit;
- AI Coding Governance Kit;
- Enterprise review gate templates;
- Hosted BoundaryML Cloud;
- Enterprise self-hosted deployment;
- done-for-you Agent-Ready Execution Kit service.

The first paid service is the **Agent-Ready Execution Kit Service**: a project-specific workflow map, issue/task breakdown, Codex / Claude Code prompts, review checklists, risk gates, artifact contracts, and execution order.

## Workspace structure

- `apps/studio`: BoundaryML Studio frontend.
- `apps/server`: BoundaryML Server API skeleton.
- `packages/schema`: BoundaryML schema and validation methods.
- `packages/core`: Project, workflow, and diff core objects.
- `packages/rules`: Boundary Rules validation.
- `packages/generators`: Workflow, prompt, checklist, and execution-kit generators.
- `packages/storage`: MemoryStorage and FileStorage.
- `examples`: limited community example data.
- `templates/community`: intentionally limited community template placeholders.
- `scripts`: validation and smoke-test scripts.

## Running modes

### Local Demo Mode

Studio starts in Local Demo Mode when it cannot reach the server. The UI header displays `Mode: Local Demo (Server unavailable)`.

### Local Server Mode

When the server is available, Studio uses Local Server Mode. The UI header displays `Mode: Local Server`.

## Development

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm run dev:server
```

Start Studio:

```bash
npm run dev:studio
```

- Server: `http://localhost:8787`
- Studio: `http://localhost:5173`

Studio API Base URL priority:
1. `import.meta.env.VITE_BOUNDARYML_API_BASE_URL`
2. `window.BOUNDARYML_API_BASE_URL`
3. default `/api`

### API status

Implemented basics:
- `GET /health`
- `GET /api/model/status`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `GET /api/projects/:projectId/jobs/:jobId`
- `GET/PUT /api/projects/:projectId/context-pack`
- `GET/PATCH /api/projects/:projectId/workflow`
- `POST /api/projects/:projectId/workflow/validate`
- `GET /api/projects/:projectId/assets`
- `POST /api/projects/:projectId/execution-kits/preview`
- `GET /api/projects/example`

Structured stubs / mocks:
- `POST /api/projects/:projectId/context-pack/summarize`
- `POST /api/projects/:projectId/workflow/generate`
- `POST /api/projects/:projectId/diffs/generate`
- `POST /api/projects/:projectId/diffs/:diffId/apply`
- `POST /api/projects/:projectId/execution-kits/generate`

### Checks

```bash
npm run check
npm run test
npm run typecheck
```

Export the community example Agent-ready Execution Kit to a local `execution-kit/` directory:

```bash
npm run export:example
```

`npm run check` validates core rules, diff application, execution-kit constraints, the community example spec, FileStorage restart behavior, job query closure, example execution-kit export, and the workflow-generate / diff-apply snapshot path.

## Roadmap

Near-term community roadmap:
- stabilize the BoundaryML Spec and workflow schema;
- improve basic Studio editing and validation flows;
- expand basic Markdown / JSON / YAML execution-kit exports;
- keep community examples intentionally small and non-proprietary;
- document integration patterns for coding agents without becoming an agent runtime.

Commercial roadmap:
- Pro workflow templates;
- advanced agent governance rule packs;
- advanced GitHub / Linear / Jira exporters;
- enterprise review gate templates;
- hosted BoundaryML Cloud;
- enterprise self-hosted deployment and audit workflows.

## License

BoundaryML Core is licensed under Apache-2.0.

Pro templates, enterprise rule packs, hosted services, and paid consulting deliverables are commercial offerings and are not included in the open-source license unless explicitly stated.
