# BoundaryML Open-source Phase Plan

> 本文用于把最新 PRD 与当前代码进度对齐，定义 BoundaryML 开源 Community Core 的后续开发 Phase。
>
> 当前结论：BoundaryML 的底层定位是通用人机协作工作流边界建模与治理层；第一个重点落地场景是 Agentic Development。Agentic Development P0 属于开源主线，且需要包含完整 Agent / Sandbox Tab 编辑能力。

---

## 1. Product Boundary

BoundaryML Community Core 的目标不是做通用流程图、项目管理工具或 Agent Runtime，而是让团队在 AI / Agent 执行之前，先得到一份可审核、可校验、可导出的工作流边界蓝图。

开源主线必须覆盖：

- Project / Context Pack / Workflow / Node / Edge / Review Gate；
- Execution Mode、Risk、Validation；
- Prompt / Checklist / Artifact Template；
- Workflow Diff Review；
- Markdown / YAML / JSON Execution Kit；
- Agentic Development P0 的 Agent Execution Plan、Sandbox Execution Contract、Promotion Gate、Evidence Template；
- Node Detail 中完整的 Agent / Sandbox Tab 编辑能力。

开源主线不覆盖：

- Pro / Enterprise 商业模板；
- 企业级组织模板与规则包；
- 高级 Jira / Linear / GitHub Issues 适配器；
- 真实 Coding Agent dispatch / callback；
- 多租户 SaaS、计费、企业审计后台。

---

## 2. Current Baseline

当前代码已经完成了 Phase 0-9 的大部分基础链路：

- `apps/server` 已提供 Local Server API、FileStorage、Model Access、Project Agent、Workflow Agent、Diff、Assets、Execution Kit、Jobs 和 History 入口；
- `apps/studio` 已提供 Projects、Create Project Agent、Workflow Canvas、Node Detail、AI Assisted Edit、Execution Assets、Export、Jobs、Settings / Model Access、Theme Settings；
- `packages/schema`、`packages/core`、`packages/rules`、`packages/generators`、`packages/exporter`、`packages/storage` 已具备 Community Core 的基础模块；
- 当前 `package-lock.json` 的 workspace link 补齐了 `packages/examples` 和 `packages/exporter`，应作为工程卫生改动进入本规划 PR。

本轮开源 Community Core 已补齐的关键差距：

- Agentic Development 场景对象已进入 Schema、Rules、Studio 编辑和 Export；
- Context Pack 已补 server-backed 摘要确认、影响分析和安全边界；
- Jobs 已补 P0 阶段历史、可重试 handler、output ref 和取消状态；跨进程异步 worker queue 不进入 Community Core P0；
- Model Call Log 已从内存列表强化为本地文件持久化，Project Agent Session 与 Workflow Edit Session 继续按本地 project/session 存储可追踪；
- Execution Kit 已补 Agent-ready files、Sandbox Contract、Evidence / Promotion 结构；
- Workflow Agent 已强化 LLM 输出契约、repair、trace 和 fallback 标识。

---

## 3. Open-source Community Core Phases

| Phase | Name | Scope | Current status | Completion target |
| --- | --- | --- | --- | --- |
| Phase 0 | Spec / Schema / Core / Rules | BoundaryML Spec、基础 Schema、Workflow Core、Diff、Validation Rules | 基本完成 | 补 Agentic Development 场景对象 schema 与 rules |
| Phase 1 | Server API / Communication Layer | HTTP JSON API、response envelope、server-first data flow | 基本完成 | 新增 Agent / Sandbox 字段读写 API |
| Phase 2 | Storage / Version / Jobs / History | FileStorage、workspace scope、workflow version、history、jobs | 基本完成 | Agent / Sandbox 配置随 snapshot/version 保存 |
| Phase 3 | Studio Server Data Integration | Studio 通过 API 访问 Server，减少 localStorage 正式数据 | 完成 | 随 Agent / Sandbox Tab 扩展刷新和错误处理 |
| Phase 4 | Workflow Canvas / Node Detail | Canvas、phase lane、node detail、direct edit、undo、filters | 基本完成 | Node Detail 增加完整 Agent / Sandbox Tab |
| Phase 5 | Execution Assets | Prompt、Checklist、Artifact Template 的查看、编辑、复制、过期状态 | 基本完成 | 资产与 Agent Contract 的 outdated / generated_from 关系 |
| Phase 6 | Execution Kit Export | Draft / Final Kit、Preview、Generate、Download | 部分完成 | 补 Agent-ready files、Sandbox Contract、Evidence Template |
| Phase 7 | Model Access Layer | OpenAI-compatible config、structured output、model status、mock fallback | 基本完成 | 强化 schema validation、summary log、failure repair |
| Phase 8 | AI Assisted Edit / Workflow Agent | Natural language edit、context plan、focused subgraph、Diff Review | 进行中 | 支持自然语言修改 Agent / Sandbox 字段 |
| Phase 9 | Templates / Examples / Release Hardening | Built-in templates、examples、README、smoke/checks | 部分完成 | 示例和测试覆盖 Agentic Development P0 |

---

## 4. Agentic Development P0 Breakdown

Agentic Development P0 归入开源 Community Core，不做真实 Agent Runtime，但必须完成建模、编辑、校验和导出。

### Phase 0A - Agentic Schema & Rules

目标：让 Agentic Development 成为正式 Spec 对象，而不是导出时临时拼接。

需要补全：

- `agent_execution_plan`
  - `node_id`
  - `enabled`
  - `execution_level`
  - `execution_target`
  - `sandbox_execution_contract_id`
  - `status`
- `sandbox_execution_contract`
  - `execution_target`
  - `repo_scope`
  - `runtime_scope`
  - `secret_scope`
  - `cost_budget`
  - `acceptance_tests`
  - `output_required`
  - `review_gate`
  - `promotion_policy`
  - `failure_handling`
- `promotion_gate`
  - sandbox / test / review / staging / production gates
- `execution_evidence_template`
  - required diff、test report、preview URL、risk summary、cost report、rollback note

新增 P0 rules：

- L3+ Agent execution must have Sandbox Execution Contract；
- High-risk Agent execution requires Review Gate；
- Production deploy must require human approval；
- Production secrets are forbidden in sandbox；
- External network access requires explicit approval；
- Required tests must be declared before promotion；
- Forbidden paths must block promotion；
- Agent output cannot directly update formal Workflow.

验收：

- Schema 可以校验 Agentic Development 对象；
- Rules 可以对 Agent / Sandbox 配置产生 error / warning / suggestion；
- 示例项目至少包含一个 L3 Sandbox 节点和一个 L0 Production 节点。

### Phase 4A - Agent / Sandbox Tab

目标：在 Studio 的 Node Detail 中提供完整编辑能力，而不是只在 Export 时自动生成。

Tab 字段：

- Agent enabled；
- Agent Execution Level：L0-L5；
- Execution Target：Codex、Claude Code、Cursor、GitHub Issue、Manual Handoff；
- Dispatch Mode：manual confirmed、policy gated、disabled；
- Repository / Base Branch / Working Branch；
- Allowed Paths / Forbidden Paths；
- Allowed Commands；
- Network Policy；
- Package Install Policy；
- Max Runtime Minutes；
- Secret Policy；
- Cost Budget；
- Required Tests / Optional Tests；
- Output Evidence；
- Review Gate linkage；
- Promotion Policy；
- Failure Handling。

交互要求：

- 所有字段支持 Saving / Saved / Failed；
- 修改后触发 workflow version 增加或 contract version 增加；
- 相关 Prompt / Checklist / Execution Kit 标记 outdated / stale；
- Validation 结果在 topbar 或 Node Detail 中可见；
- 高风险字段变更需要明确 warning。

验收：

- 用户可以在任意节点配置 Agent / Sandbox；
- 保存失败不伪装成功；
- L3+ 无 Sandbox Contract 会出现 blocking error；
- Production 节点默认不能配置自动发布。

### Phase 6A - Agent-ready Execution Kit Export

目标：导出 Markdown / YAML / JSON，不做 GitHub Issues 适配器。

新增或强化文件：

- `workflow_spec.yaml`
- `agent_task_list.md`
- `sandbox_execution_contracts.yaml`
- `promotion_gates.yaml`
- `execution_evidence_templates.md`
- `prompt_pack.md`
- `review_checklists.md`
- `artifact_templates.md`
- `responsibility_map.md`
- `risk_report.md`
- `boundary_rules_report.md`

导出规则：

- Draft Kit 可带 warning / error；
- Final Kit 不允许 blocking error；
- Kit 必须绑定 Workflow Snapshot；
- Agent-ready files 必须引用 node id、workflow version、contract version；
- 生产发布相关 contract 必须显示 human approval；
- GitHub Issues 仅作为后续适配器，不进入 Community Core P0。

验收：

- 用户能预览并导出包含 Sandbox Contract 的 kit；
- YAML / JSON 可被再次解析；
- Markdown 文件可被人类审核；
- Blocking validation 会阻止 Final Kit。

### Phase 8A - Workflow Agent edits Agent / Sandbox

目标：自然语言修改不仅能改 workflow topology 和 node fields，也能改 Agent / Sandbox 字段。

示例指令：

- “把开发阶段的代码生成节点改成 L3 Sandbox，禁止访问 infra 目录。”
- “所有高风险节点最多只能 L2，并加人工 review gate。”
- “允许测试节点运行 npm test 和 npm run build，但禁止联网。”
- “给上线节点增加 production gate，不能由 Agent 自动发布。”

要求：

- Workflow Agent 必须生成 Diff；
- Diff 中可包含 `agent_execution_plan`、`sandbox_execution_contract`、`promotion_gate` 变更；
- Apply 后重新校验；
- Reject 不修改正式数据；
- 需要补充信息时先追问，不直接生成空 contract；
- deterministic fallback 只能作为兜底并明确标识来源。

验收：

- AI 修改 Agent / Sandbox 字段不会静默覆盖；
- 用户可以逐条选择 apply；
- Diff preview 能展示 Agent / Sandbox 影响范围；
- 应用后 Execution Kit 预览同步更新。

### Phase 9A - Examples / Docs / Release Hardening

目标：让 README、示例、检查脚本和 smoke test 都能证明 BoundaryML 不是普通流程图工具。

需要补全：

- `examples/ai-saas-feature-mvp.json` 包含 Agent / Sandbox 示例；
- `examples/internal-ai-tool.json` 包含非 coding 场景下的 Agentic 字段为空或 disabled；
- `examples/legacy-system-ai-modernization.json` 包含较保守的 Agent Execution Level；
- README 链接本 Phase Plan；
- `docs/agent-ready-execution-kit.md` 更新文件清单；
- `scripts/check.js` 校验 Agentic schema / rules / export；
- `scripts/server-smoke.js` 覆盖 Agent / Sandbox Tab 保存和 kit export；
- `package-lock.json` workspace link 补齐 `@boundaryml/examples` 和 `@boundaryml/exporter`。

验收：

- `npm run check` 通过；
- Local Server 模式可创建、编辑、校验、导出 Agent-ready kit；
- GitHub README 能解释 Community Core 与商业 Phase 的边界；
- 没有 Pro / Enterprise 商业模板进入公开仓库。

---

## 5. Closed-source / Commercial Phases

| Phase | Name | Scope | Visibility | Current status |
| --- | --- | --- | --- | --- |
| Phase 10 | Pro Template System | Pro templates、template version、template upgrade diff、commercial template packaging | Closed-source / commercial | 未开始 |
| Phase 11 | Enterprise Organization Templates | organization templates、workspace sharing、approval templates、governance packs | Closed-source / commercial | 未开始 |
| Phase 12 | Enterprise Rules & Governance | enterprise rule packs、risk override policy、AI autonomous policy、approval workflow governance | Closed-source / commercial | 未开始 |
| Phase 13 | Enterprise Privacy / Model Policy | redaction、private model policy、disable raw context、secret policy、KMS integration | Closed-source / commercial | 未开始 |
| Phase 14 | SaaS Platform | auth、RBAC、multi-tenant isolation、billing、audit UI、cost dashboards | Closed-source / commercial | 未开始 |

这些 Phase 可以在 PRD 中作为产品方向存在，但不应默认进入 Apache-2.0 开源仓库。

---

## 6. Recommended Implementation Order

1. **Phase 0A**：补 Agentic Schema / Rules，先让数据结构和校验站稳；
2. **Phase 4A**：实现 Node Detail 的 Agent / Sandbox Tab 完整编辑；
3. **Phase 6A**：把 Agent / Sandbox 配置导出到 Execution Kit；
4. **Phase 8A**：让 Workflow Agent 可通过 Diff 修改 Agent / Sandbox 字段；
5. **Phase 9A**：更新 examples、README、checks、smoke tests；
6. **Engineering hygiene**：将 `package-lock.json` workspace link 纳入本规划 PR。

---

## 7. Phase Completion Summary

| Area | Done | Needs completion |
| --- | --- | --- |
| Project / Workflow / Canvas | 已有主链路，Agent / Sandbox fields 已进入 Node Detail | 后续仅保留交互细节优化 |
| Context Pack | 基础保存、摘要确认、影响分析、安全边界已可用 | 后续可接入更高级模型摘要 |
| Model Access | OpenAI-compatible、输出契约、修复、summary log、本地持久化已可用 | 后续可扩展 provider presets |
| Workflow Agent | Diff Review、Agent / Sandbox diff、fallback 透明化已可用 | 后续可扩展更多自然语言意图 |
| Execution Assets | Prompt / Checklist / Template 可编辑，generated_from / version / contract linkage 已可用 | 后续可增加批量再生成 |
| Execution Kit | Agent-ready files、Sandbox Contract、Evidence、Promotion 已可导出 | 后续 adapter 不进入 P0 |
| Validation | P0 workflow rules 与 Agentic Development P0 rules 已可用 | 后续可增加组织规则包 |
| Jobs / History | 阶段历史、恢复、重试、取消、本地持久化已可用 | 跨进程异步 worker queue 不进入 Community Core P0 |
| Examples / Docs | Phase 0-9、Agentic Development P0 示例与验收已覆盖 | 后续保持 release 更新 |
