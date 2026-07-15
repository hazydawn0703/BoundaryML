# RoleUnion Open Core Strategy

## 1. Product Positioning

RoleUnion is a modeling and governance layer for human-AI workflows.

It helps teams turn vague AI-assisted work into structured, reviewable execution kits with explicit boundaries between human work, AI work, human-AI collaboration, review gates, output contracts, and downstream handoff rules.

Agentic Development is RoleUnion's first focused use case and commercial wedge. In that scenario, RoleUnion prepares software development work before Coding Agents execute.

## 2. Core User Problem

AI can participate in complex workflows, but teams still need:

- human-AI workflow boundaries
- task boundaries
- required context
- output contracts
- review gates
- acceptance criteria
- risk-aware execution modes
- human approval workflows
- downstream handoff rules

Without these boundaries, teams hand AI tools vague requests, review work too late, and struggle to identify which outputs are safe to accept or pass downstream.

## 3. Open Core Boundary

| Layer | Purpose | Included examples | Distribution |
| --- | --- | --- | --- |
| Community Core | Local, open-source foundation for the RoleUnion Spec and basic execution-kit generation. | Spec, schema, validator, basic human-AI workflow model, basic Studio, basic Server, basic rules, community example. | Open source repository. |
| Pro | Production-ready templates and repeatable governance packages for teams. | Vertical workflow governance kits, AI Coding Governance Kit as the first kit, GEO Launch Ops Kit, advanced prompt packs, advanced review gates. | Commercial template/license package. |
| Enterprise | Organization-aware governance, integrations, deployment, and audit controls. | Enterprise rule packs, approval templates, team workspace, audit logs, advanced GitHub / Linear / Jira exporters, hosted cloud, self-hosted deployment. | Commercial enterprise agreement. |
| Services | Done-for-you implementation and project-specific kit delivery. | Human-AI workflow mapping, Agent-ready execution kits, issue breakdown, prompt packs, review checklists, custom governance blueprint. | Paid consulting/service engagement. |

## 4. What Stays Open Source

- Spec
- Schema
- Validator
- Basic Studio
- Basic Server
- Basic rules
- Basic generators
- Basic Markdown / JSON / YAML export
- Local Demo Mode
- Local Server Mode
- one community example

## 5. What Becomes Commercial

- Human-AI Workflow Governance Kits
- Vertical Execution Kit Templates
- Industry / function-specific Boundary Rules
- AI Coding Governance Kit
- Agent-ready Execution Kit Service
- Pro templates
- advanced rule packs
- advanced exporters
- hosted cloud
- enterprise self-hosted
- done-for-you execution kits

## 6. Packaging

### Community

Community is the open-source foundation. It should be useful for local experimentation, basic human-AI workflow modeling, validation, and basic execution-kit export without including production-ready commercial templates.

### Pro Templates

Pro Templates package repeatable commercial workflows for users who want production-ready human-AI boundaries, governance prompts, review gates, and execution-kit structures for common scenarios.

AI Coding Governance Kit is the first Pro kit because Agentic Development is the clearest initial wedge, not because RoleUnion is limited to software development.

### Enterprise / Cloud

Enterprise / Cloud adds team collaboration, organization-specific policy mapping, advanced exporters, audit logs, hosted RoleUnion Cloud, and self-hosted enterprise deployment support.

## 7. First Paid Offer

The first paid offer focuses on Agentic Development because it is the clearest initial wedge, not because RoleUnion is limited to software development.

The first paid offer is the **Agent-Ready Execution Kit Service**.

Deliverables:

- workflow map
- GitHub issue breakdown
- Codex / Claude Code prompts
- review checklists
- risk gates
- artifact contracts
- execution order

This service converts a real software project brief, PRD, or product idea into a kit that a team can review and then hand to Coding Agents for execution.

## 8. Non-goals

RoleUnion is:

- not a project management replacement
- not an agent runtime
- not a generic diagramming tool
- not an all-in-one AI automation platform
