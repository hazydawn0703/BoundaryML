# RoleUnion Development Memory

## Phase 0 - Shared Schema / Core / Spec / Rules 最小地基

### 本 Phase 完成内容
- 强化 `packages/schema`：补齐 Spec v0.1 关键对象 schema 与 runtime 校验函数。
- 补充 `validateRoleUnionProjectSpec` 全量项目级校验与 `validateAssets`。
- 强化 `packages/rules`：补齐 Phase 0 所需 P0 规则（10 条）。
- 新增 `packages/core/src/engine.js`：实现 workflow patch/diff/version/snapshot/normalize/validation-status 等纯函数。
- 提供 `packages/examples` 与 `packages/exporter` 最小可复用包。
- 更新 example 生成逻辑，使 `examples/ai-saas-feature-mvp.json` 为完整 RoleUnion Spec，并包含 warning、outdated prompt、diff 示例。
- 扩展 `scripts/check.js`，覆盖 schema / rules / core / snapshot / storage / server smoke。

### 修改文件清单
- `packages/schema/src/constants.js`
- `packages/schema/src/schema.js`
- `packages/rules/src/validationEngine.js`
- `packages/core/src/engine.js`
- `packages/core/src/sampleProject.js`
- `packages/examples/package.json`
- `packages/examples/src/aiSaasFeatureMvp.js`
- `packages/exporter/package.json`
- `packages/exporter/src/executionKitExporter.js`
- `scripts/generate-example.js`
- `examples/ai-saas-feature-mvp.json`
- `scripts/check.js`
- `package.json`

### 新增 API / Schema / 类型 / 测试
- Schema:
  - `validateRoleUnionProjectSpec`
  - `validateAssets`
  - `validateArtifactContract` / `validateArtifactTemplate` / `validateWorkflowSnapshot` / `validateModelCallLog` / `validateTemplate`
- Core:
  - `createWorkflowFromTemplate`
  - `applyWorkflowPatch`
  - `applyDiff`
  - `incrementWorkflowVersion`
  - `createWorkflowSnapshot`
  - `markAffectedAssetsOutdated`
  - `normalizeWorkflowSpec`
  - `calculateWorkflowValidationStatus`
- Tests:
  - 规则覆盖（高风险 gate、AI output、acceptance、human-only prompt、edge required outputs、autonomous 风险、production/release 限制等）
  - `validateRoleUnionProjectSpec` error/warning/suggestion 覆盖
  - server smoke（job + file persistence）

### 已知限制
- 仍未引入真实异步队列，Generation Job 语义由同步流程承载。
- rules 引擎目前是函数式实现，尚未拆分策略注册机制。
- typecheck 仅使用 `node --check`（当前仓库无 TS 编译链）。

### 下一 Phase 前置条件
- 在保持 Spec 与 rules 不破坏的前提下，将 Server 的生成路径改为“结构化输出 -> schema 校验 -> rules 校验 -> draft 持久化”。
- 为 Studio 增加 server-first 数据源，保留 local demo fallback。

## Phase 1 Summary

### Pre-coding Audit
| Area | Existing | Gap | Action |
|---|---|---|---|
| Server entry | yes (`apps/server/src/server.js`) | routes inconsistent with PRD phase-1 list | refactor |
| API envelope | yes | missing requestId/generatedAt consistency | refactor |
| Storage | yes (`MemoryStorage`/`FileStorage`) | only project-centric persistence | reuse + incremental extension in project record |
| Job query | partial (single job route) | missing job list route and broader job creation coverage | add |
| Validation | yes (`packages/rules`) | some routes bypass core/rules and mutate objects directly | refactor to shared core/rules |

- Server: 已有单一 server entry，可复用。
- API: 已有主干 API，但缺少 Phase 1 所需完整性（project patch/delete、node、assets、kits、model、jobs list）。
- Storage: 已有 file/memory；当前通过 project record 聚合 persistence。
- Jobs: 已有最小 job 模型；需补 list route 与更多动作 job 记录。
- Validation: 已有 phase0 rules；需确保 workflow generate/patch/diff apply 强制接入。
- Gaps found: request_id 缺失、`/api/health` 缺失、部分 endpoint 缺失、部分流程未强制走 shared core。

### Completed
- 重构 server response envelope，统一 `ok/data/meta` 与 `ok:false/error/meta`，并注入 `requestId`。
- 新增最小 Request Context（`local_user/local_default/local_server/server_default`）。
- 补齐/修正 Phase1 P0 API 主链路（projects/context/workflow/node/diff/assets/kits/model/jobs）。
- workflow generate/patch/diff apply 强制复用 `packages/core` + `packages/schema` + `packages/rules`。
- execution kit preview/generate 强制复用 `packages/exporter`/`packages/generators`。
- examples seed 强制复用 `packages/examples`。
- `.env.example` 按 Phase1 要求补齐并加入前端 API base 变量。

### Files Changed
- `apps/server/src/server.js`
- `.env.example`
- `scripts/check.js`
- `docs/development-memory.md`

### APIs Added / Changed
- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/projects/:projectId?`
- `GET/PUT/POST summarize/POST refresh-impact /api/projects/:projectId/context-pack*`
- `GET/POST generate/PATCH/POST validate/POST mark-final /api/projects/:projectId/workflow*`
- `GET/PATCH/POST generate-prompt/POST generate-checklist /api/projects/:projectId/nodes/:nodeId*`
- `POST generate/GET diff/POST apply/POST reject /api/projects/:projectId/diffs*`
- `GET assets/GET asset/PATCH asset/POST regenerate /api/projects/:projectId/assets*`
- `POST preview/POST generate/GET kit/GET download /api/projects/:projectId/execution-kits*`
- `GET status/POST test/GET calls /api/model/*`
- `GET /api/projects/:projectId/jobs` and `GET /api/projects/:projectId/jobs/:jobId`

### Schema / Core / Rule Integration
- Workflow generate: `createWorkflowFromTemplate` + `normalizeWorkflowSpec` + `validateWorkflow(schema)` + `validateWorkflow(rules)` + spec-level `validateRoleUnionProjectSpec`。
- Workflow patch: `applyWorkflowPatch` + schema validation + rules validation + snapshot。
- Node patch: workflow patch + `markAffectedAssetsOutdated` + rules validation。
- Diff apply: `applyDiff` + `markAffectedAssetsOutdated` + rules validation + snapshot。

### Storage Changes
- 沿用 `FileStorage/MemoryStorage`，project 记录内持久化 context/workflow/assets/diff/jobs/kits 相关数据。
- 保持 workspace scope 读取，跨 workspace 一律 `PROJECT_NOT_FOUND`。

### Job Changes
- 所有核心生成动作创建 job（workflow/context summary/prompt/checklist/diff/kit preview/kit generate）。
- 新增 job list API；同步执行也落 job 记录。

### Tests Added / Updated
- `scripts/check.js` 适配 `/api/health`。
- 既有 smoke 覆盖 server 启停、project create、workflow generate、job query、diff generate/apply、持久化重启读取。

### Validation
- typecheck: 待执行
- lint: 仓库无独立 lint 命令
- test: 待执行
- check: 待执行
- smoke: 已内嵌在 check/test

### Known Limitations
- 仍为同步 job 执行（非异步队列）。
- storage 仍以 project 聚合持久化为主，未拆成独立文件域（phase2 再细化）。
- model calls 仅 summary 级 mock log。

### Risks / Follow-ups
- 需要 Phase2 增加 schema_version forward-compat 及 migration scaffolding。
- 需要 Phase2 增强 optimistic lock / atomic cross-object write。

### Phase 2 Readiness
- Ready
- Blockers if any: none

## Phase 2B Update (Generation Job 生命周期)
- Job 对象补齐：新增 `input_snapshot`, `progress{stage,message}`, `error{stage,retryable,...}`, `idempotency_key`, `retry_of`, `cancel_requested`，并统一使用 `type` 字段。
- Job status 覆盖：`queued/running/succeeded/failed/cancelled/expired`（`expired`预留）。
- 生成 API 均支持 `Idempotency-Key`，命中 `queued/running/succeeded` 时复用已有 Job，避免重复正式产物。
- 新增 Job API：
  - `POST /api/projects/:projectId/jobs/:jobId/retry`
  - `POST /api/projects/:projectId/jobs/:jobId/cancel`
- Retry 语义：新建 job，`retry_of` 指向原 job，复用原 `input_snapshot`。
- Cancel 语义：标记 `cancel_requested=true` 且 `status=cancelled`；若已 succeeded 返回 `JOB_ALREADY_COMPLETED`。
- Jobs 改为 project 内持久化（`generation_jobs`），重启后可通过 Job API 读取。

## Phase 2C Update (Workflow History / Version / Snapshot)
- 关键 workflow 变更统一推进 version：workflow generate、workflow patch、node patch、diff apply、mark final、context refresh。
- 新增 `workflow_history_items`（history item）与 `workflow_snapshots`（按 version 保存快照）并持久化到 project。
- 新增 API：
  - `GET /api/projects/:projectId/workflow/history`
  - `GET /api/projects/:projectId/workflow/versions/:version`
- Snapshot 记录 project summary、context_pack_version、workflow topology、asset refs、validation、change_source、created_by/at。
- Execution kit preview/generate 继续记录并返回 `workflow_snapshot_version`（与当前 workflow version 绑定）。

## Phase 2D Update (Undo / Restore / Diff Revert)
- 新增 Restore API：`POST /api/projects/:projectId/workflow/restore`，基于历史 snapshot 创建新 workflow version（`change_source=restore_version`）。
- 新增 Undo API：`POST /api/projects/:projectId/workflow/undo`，P0 回退到上一个可用 snapshot 并创建新 version（`change_source=undo`）。
- 新增 Diff Revert API：`POST /api/projects/:projectId/diffs/:diffId/revert`，仅允许对 `applied` diff 恢复到 diff 前 snapshot，新建 version（`change_source=revert_diff`），并将 diff 标记为 `reverted`。
- Restore/Undo/Revert 均重新跑 validation，且触发/记录 assets outdated 影响，不删除历史项与旧 snapshot。

## Phase 2E Update (Storage Integrity / Optimistic Lock / Kit 状态)
- 新增 schema migration skeleton：`detectSchemaVersion / migrateObjectIfNeeded / registerMigration`，未知版本抛 `SCHEMA_VERSION_UNSUPPORTED`，迁移失败抛 `SCHEMA_MIGRATION_FAILED`。
- FileStorage 原子写增强：tmp write + rename，失败清理 tmp 并抛 `STORAGE_WRITE_FAILED`；读取损坏 JSON 抛 `STORAGE_OBJECT_CORRUPTED`。
- Workflow PATCH / Node PATCH / Diff Apply / Mark Final 支持 `workflow_version` optimistic lock，不匹配返回 `VERSION_CONFLICT`。
- Execution kit 状态强化：生成成功标记 `generated`；下载时 `failed/generating` 禁止；`stale` 可下载且返回 stale 标记。
- Workflow version 变化后，已有 generated/exported kit 自动转为 stale。

## Phase 3 Summary

### Pre-coding Audit
- Existing Studio data flow: 当前由 `apps/studio/src/app.js` 与 `state/store.js` 驱动，本地 state + mock service 为主。
- Existing API client: 仅有 health/listProjects/getExampleProject，封装不足。
- Existing localStorage usage: 持久化整份 studio state（含 projects），与 server-first 冲突。
- Existing demo mode: 有基础 health check 与 badge，但 server 可用时也未真正切换数据源。
- Gaps found: 缺统一 API 模块、缺 jobs/model/context/workflow server 接入、缺显式 demo 边界。

### Completed
- 扩展统一 API Client（health/projects/context/workflow/jobs/model/assets/execution kits）。
- 改造 Studio store：localStorage 仅保留 UI 状态，不再作为正式项目数据源。
- 将 Create Project / Context Pack / Runtime bootstrap 初步接入真实 server API。

### Files Changed
- apps/studio/src/api-client/index.js
- apps/studio/src/state/store.js
- apps/studio/src/app.js
- docs/development-memory.md

### API Client Changes
- 统一 base URL 优先级：VITE -> window -> /api
- 统一 envelope 解析、requestId/meta 提取、server unavailable 与 envelope 异常处理
- 模块化 API 方法：healthApi/projectsApi/contextPackApi/workflowApi/jobsApi/modelApi/assetsApi/executionKitsApi

### Pages Connected
- Projects: bootstrap 时读取 server projects（初步）
- Create Project: 调用 POST /api/projects（初步）
- Context Pack: 调用 PUT context-pack + workflow generate（初步）
- Workflow Studio: 待完善
- Node Detail: 待完善
- Validation Results: 待完善
- Job Status: 待完善
- Model Status: bootstrap 获取 status（初步）

### Local Demo Mode Changes
- server 异常时写入 `serverError` 并回到 local demo runtime mode。

### Tests Added / Updated
- 暂未新增单测（下一步补 API client tests 与 Studio 接入 smoke）。

### Validation
- typecheck: pending
- lint: n/a
- test: pending
- check: pending
- smoke:server: pending

### Known Limitations
- app.js 仍较大，部分页面仍依赖本地 mock/service。
- workflow/node/validation/job/model UI 仍需按 Phase 3 完整验收项补齐。

### Risks / Follow-ups
- 需要进一步规范 server response shape 映射（snake_case -> UI）。
- 需要逐页移除 mock-only 行为，避免 local/server 混用。

### Phase 4 Readiness
- Blocked
- Blockers if any: Phase 3 尚未完成全部验收条目。

## Phase 3 Progress Update (Projects → Create → Context → Studio 主链继续)
- Projects 页补充空状态文案与 Create First Project 入口；卡片增加 snake_case 字段兼容展示（project_type/risk_level/current_stage/execution_kit）。
- Open Project 动作改为并行加载 project/workflow/jobs，进入 Studio 时尽量展示真实 workflow + assets + validation + jobs。
- Validate 按钮优先调用 server `POST /workflow/validate`，失败时回退本地 validation 作为兜底显示。
- Runtime badge 文案改为 `Mode: Local Demo / Mock Model`，避免模糊 fallback。

## Phase 3 Progress Update (Node Detail / Assets / Export / Settings server化继续)
- Studio 主页面新增 Recent Jobs 轻量面板，展示 job id/type/status/progress.stage，作为 Job Status 入口。
- Open Project 时新增 `GET /assets` 拉取，Node Detail / Assets 页面优先消费 server assets。
- Export 页面 `Generate Preview` 在 server mode 下改为调用 execution kits preview API（demo mode 仍保留本地生成）。
- 新增 `Refresh Jobs` 与 `Refresh Model Status` 操作：分别调用 jobs list、model status + model calls。
- Settings 页面改为展示 server model status 字段（mode/provider/default/planning/prompt/diff/structured output）与 recent model calls。

## Phase 3 Progress Update (Node Detail 编辑与 Job retry/cancel)
- API client 新增 `nodesApi`：node patch、generate prompt、generate checklist。
- Node Detail `generate prompt` 在 server mode 下改为调用 nodes prompt generate API，并刷新 assets/jobs。
- Node Detail `update-node-field` 与 `update-artifact-format` 在 server mode 下优先走 node patch API（demo mode 保留本地逻辑）。
- Recent Jobs 面板新增 Retry/Cancel 按钮，并接入 jobs retry/cancel API，执行后自动刷新 job 列表。

## Phase 3 Progress Update (剩余本地路径替换)
- `update-gate-field` 在 server mode 下改为 `nodesApi.patch`（提交完整 reviewGate 结构）。
- `update-prompt-content` 在 server mode 下改为 `assetsApi.update`，并回拉 assets。
- `edit-asset-prompt` 在 server mode 下改为 `assetsApi.update`，并回拉 assets。
- `assetsApi` 新增 `update(projectId, assetId, payload)`。

## Phase 4 Summary

### Pre-coding Audit
- docs/development-memory.md review: 已确认 Phase 0–3 的 server-first 约束、mock 限制与未完成 Studio 编辑能力边界。
- Workflow Canvas: 已按 phase lane 展示，但 phase 卡片信息不足（缺 node count/high-risk count/validation count/status）。
- Node Detail: 已有 overview/boundary/io/gate/assets/history 轻量结构；overview 多为只读，缺完整 server edit 表单。
- Add/Delete Node: add-node 仍是本地 push；delete-node 不存在。
- Edge Editing: 仅有 edge hints 展示，无 add/delete/edit。
- Validation: validate 按钮已接 server，但编辑后未统一 refresh workflow/validation/history/assets/jobs。
- History/Undo/Restore: 有 server API client 基础（history/version），UI 入口不足，undo/restore 未接。
- Version Conflict: 节点 patch 可能返回冲突，但 UI 未统一文案与 refresh 引导。
- Demo Mode: 已有本地 fallback；仍需更显式标记，避免误判为 server 持久化。
- Gaps found: Server mode 下 workflow 核心编辑（add/delete/edge/undo/restore）缺失，编辑后全链刷新机制缺失。

### Completed
- 在 Studio 工具栏新增 Undo / History 入口，并在 Demo 模式显式展示 `Mode: Local Demo / Mock Model`。
- 为 Server Mode 新增统一刷新函数，编辑后并行刷新 workflow/jobs/assets/history。
- Add Node 在 Server Mode 下改为调用 `PATCH /workflow`（携带 `workflow_version` 与完整 nodes）。
- 新增 Delete Node（overview 区域按钮），删除前显示影响提示（related edges/downstream nodes），并走 Server patch。
- 扩展 API client：workflow patch/undo/restore 接口。
- Node Card 增加 owner 与输入/输出摘要，强化 Phase 4 要求的卡片信息密度。

### Files Changed
- apps/studio/src/api-client/index.js
- apps/studio/src/app.js
- docs/development-memory.md

### Workflow Studio Changes
- Toolbar 新增 `Undo` 与 `History`；保留 Validate。
- Demo 模式显式 warning banner。
- Phase 区域新增 `Add Node` 快捷入口。

### Node Editing Changes
- Overview 增加 `Delete Node` 按钮。
- Server mode `add-node` 改为 server patch（optimistic lock）。
- 新增 server mode `delete-node`，并在删除前展示影响。

### Edge Editing Changes
- 本次仅保持现有 edge hints 展示；未完成 add/delete edge 表单与 server patch。

### Validation / History Changes
- `refreshProjectRuntime` 在编辑后刷新 workflow + validation + jobs + assets + history。
- History 按钮可拉取 history 并显示 latest 版本摘要。
- Undo 调用 server `POST /workflow/undo` 并刷新。

### Error Handling Changes
- add/delete node 对 `VERSION_CONFLICT` 统一展示：`Workflow has been updated by another operation. Please refresh and try again.`
- 其余 API 错误继续透出 message。

### Tests Added / Updated
- 本轮未新增前端自动化测试；需在后续补 store/script 级覆盖（node patch/add/delete/edge/undo/restore/conflict/mock-path/localStorage）。

### Validation
- typecheck: pending
- lint: n/a
- test: pending
- smoke:server: pending
- check: pending

### Known Limitations
- Phase card 统计字段（node/high-risk/validation/status）仍未完整。
- Node detail 中 Review Gate / Artifact Contract 仍为轻量编辑，未覆盖全部字段。
- Edge add/delete/edit 仍未实现。
- Restore/version detail UI 仍未实现。

### Phase 5 Readiness
- Blocked
- Blockers if any: 仍有 Phase 4 验收条目未闭合（edge editing、restore UI、测试覆盖、完整字段编辑）。

## Phase 4 Completion Summary

### Completion Audit
- docs/development-memory.md review: 已复查 Phase 0–3 与上轮 Phase 4 未闭合项，并执行本轮收口。
- Phase Card: 已补 node/high-risk/validation/status 统计，并新增 Unassigned 组。
- Node Detail: 已补 overview 核心字段可编辑（name/goal/phase/status/risk），并统一 server patch + refresh。
- Review Gate: 已补高风险缺 gate 错误提示、更多字段编辑、remove gate。
- Artifact Contract: 已补 output format server patch + refresh（其余字段仍部分待补）。
- Edge Editing: 已补 edge 列表、add/delete 入口；edit 采用 delete+add 路径（最小可用）。
- History / Version Detail / Restore: 已补 history 列表渲染、view version、restore 按钮与调用。
- Version Conflict: 统一关键编辑路径冲突文案和 API 错误展示（code/message/requestId）。
- Tests: 新增 `scripts/studio-workflow-edit-check.js` 并接入 `scripts/check.js`。
- Remaining gaps: artifact contract 结构化字段（required_sections/completion_criteria）与 edge 独立 edit 表单仍可继续增强。

### Completed
- 完成 Phase Card 统计字段与 Unassigned 展示。
- 完成 Node Overview 字段编辑 server 化与编辑后统一刷新。
- 完成 Review Gate 扩展编辑和 remove 操作。
- 完成 Edge add/delete 最小可用路径。
- 完成 History 列表 + Version Detail + Restore + Undo 全流程。
- 完成脚本级 Phase 4 编辑能力检查并并入 check。

### Files Changed
- apps/studio/src/app.js
- apps/studio/src/api-client/index.js
- scripts/studio-workflow-edit-check.js
- scripts/check.js
- docs/development-memory.md

### Workflow Studio Changes
- Phase lane 统计补齐：node/high-risk/validation/status。
- 新增 Unassigned lane。
- History 面板内嵌版本列表 + view/restore 操作。

### Node Editing Changes
- Overview 支持 name/goal/phase/status/risk 编辑。
- server mode 节点编辑请求带 workflow_version。
- 编辑成功后统一 refreshProjectRuntime。

### Review Gate / Artifact Contract Changes
- Review Gate：name/reviewer/criteria/pass/reject/required 可编辑，支持 remove。
- 高风险且无 required gate 时显示固定错误文案。
- Artifact contract output format 编辑改为 server patch + refresh。

### Edge Editing Changes
- Node detail history 区域展示节点相关 edges（id/from/to/dependency/required_outputs/gate）。
- Add edge：通过 workflow patch 新增。
- Delete edge：删除前确认并通过 workflow patch 删除。
- Edit edge：当前通过 delete + add 组合实现（最小可用）。

### History / Restore / Undo Changes
- History 列表展示 version/created_at/change_source/summary/created_by/diff_id。
- View Version 调用 versions API 并展示 snapshot 摘要。
- Restore 调用 restore API 并刷新 workflow/validation/history/assets/jobs。
- Undo 保持 server 调用并刷新；失败显示 code/message/requestId。

### Error Handling Changes
- 统一 VERSION_CONFLICT 文案：Workflow has been updated by another operation. Please refresh and try again.
- API 错误统一展示 code/message/requestId。

### LocalStorage / Mock Restrictions
- localStorage 仍仅持久化 UI 状态，不写入 projects/workflow/assets。
- server mode 编辑路径不 fallback 到 mock edit。

### Tests Added / Updated
- 新增 `scripts/studio-workflow-edit-check.js`：覆盖 API client 方法、workflow_version 透传、冲突文案、edge/history/restore/validate 路径、localStorage 边界等。
- `scripts/check.js` 接入上述脚本。

### Validation
- typecheck: pending
- lint: n/a
- test: pending
- smoke:server: pending
- check: pending

### Known Limitations
- Artifact Contract 的 required_sections/completion_criteria 尚未结构化完整表单。
- Edge edit 尚未独立表单化（目前 delete+add）。

### Phase 5 Readiness
- Blocked
- Blockers if any: 仍需继续补齐 Artifact Contract 全字段与 Edge 独立 edit 体验细化。

## Phase 4B Completion Summary

### docs/development-memory.md Review
- 已复核 Phase 0–4 进展与 Phase 4 剩余 blocker，仅聚焦 Artifact Contract 全字段结构化编辑与 Edge 独立 Edit 表单收口。

### Completed
- Node Detail 的 Artifact Contract 表单扩展为结构化字段编辑（id/name/type/format/required_sections/completion_criteria）。
- Edge 编辑由“delete+add”补齐为独立编辑态（start edit / field change / save edit）。
- Server Mode 下 Artifact Contract 与 Edge Edit 均走正式 API（携带 workflow_version）并在成功后统一刷新 runtime。
- 更新 studio script-level 检查覆盖本轮新增路径。

### Artifact Contract Changes
- required_sections: 增加多行编辑入口（支持新增/编辑/删除，按换行解析）。
- completion_criteria: 增加多行编辑入口（支持新增/编辑/删除，按换行解析）。
- server patch: `nodesApi.patch(... { workflow_version, artifactContract })`。
- validation refresh: 成功后统一走 `refreshProjectRuntime`，刷新 workflow/validation/assets/history/jobs。

### Edge Edit Changes
- independent edit form: 增加 `start-edge-edit`、`edge-edit-field`、`save-edge-edit`。
- dependency_type: 独立选择（artifact/approval/context/sequential）。
- required_outputs: 多行编辑并保存。
- gate_id: 文本编辑并保存。
- server patch: `workflowApi.patch(... { workflow_version, edges })`。

### Error Handling
- VERSION_CONFLICT: 统一文案 `Workflow has been updated by another operation. Please refresh and try again.`。
- API error display: 统一展示 `code/message/requestId`。

### Tests Added / Updated
- 更新 `scripts/studio-workflow-edit-check.js`：新增 Artifact Contract required_sections/completion_criteria、Edge 独立编辑、edge workflow patch + workflow_version、artifact contract conflict/patch 路径存在性检查。
- 继续由 `scripts/check.js` 引入执行。

### Validation
- typecheck: passed
- lint: n/a
- test: passed
- smoke:server: passed
- check: passed

### Known Limitations
- Artifact Contract 字段映射对历史 camelCase 数据仍以兼容优先（completion_criteria/acceptanceCriteria 并存处理）。
- Edge 编辑目前在 Node Detail history 区域内完成，仍是轻量交互样式。

### Phase 5 Readiness
- Blocked
- Blockers if any: Phase 4B 范围已收口，本轮未进入 Phase 5 规划与实现。

## Open-source Phase 5–9 Roadmap Alignment (Post Phase 4B)

### PRD Review Source
- Reviewed the latest three PRD files: `docs/RoleUnion PRD.md`, `docs/RoleUnion PRD 补充章节15–26.md`, and `docs/RoleUnion PRD 架构补充章节27–41.md`.
- The public GitHub roadmap should continue with the MVP / open-source line only.
- Commercial Pro / Enterprise / SaaS phases are intentionally excluded from the public GitHub roadmap and will be developed locally / privately.

### Public Open-source Roadmap
| Phase | Name | Scope | PRD Alignment | GitHub Visibility |
|---|---|---|---|---|
| Phase 5 | Execution Assets 完整化 | Prompt / Checklist / Artifact Template 的查看、编辑、复制、状态、outdated 链路 | MVP Execution Assets 验收 | Public GitHub |
| Phase 6 | Execution Kit Export 完整化 | Draft / Final Kit、Preview / Generate / Download、Workflow Spec、Task List、Prompt Pack、Review Checklist、Artifact Templates、Risk Report | MVP Export / Execution Kit 验收 | Public GitHub |
| Phase 7 | Model Access Layer / Real LLM / Structured Output | OpenAI-compatible 配置、Server-side LLM、structured output、schema/rules validation、model call summary | MVP Model Access 验收 | Public GitHub |
| Phase 8 | AI Assisted Edit + Diff Review UI | 自然语言修改请求、生成 Diff、逐条 accept/reject、apply 后 validation、资产 outdated 标记 | MVP AI Assisted Edit 验收 | Public GitHub |
| Phase 9 | MVP Templates / Examples / README / Release Hardening | Built-in Template、Example Template、3 个 MVP 内置模板、示例项目、README、Quick Start、release checks | MVP Template / Example / README 验收 | Public GitHub |

### Private Commercial Roadmap Boundary
- Phase 10–14 belong to the Pro / Enterprise / SaaS commercial roadmap.
- These phases should not be published to GitHub in this open-source repository.
- They may be designed and developed locally / privately as closed-source work.

| Private Phase | Commercial Scope | GitHub Visibility |
|---|---|---|
| Phase 10 | Pro Template System（Project Template、template version、template upgrade / diff） | Private / Local only |
| Phase 11 | Enterprise Organization Templates（organization template、workspace-bound template sharing、template governance） | Private / Local only |
| Phase 12 | Enterprise Rules & Governance（organization boundary rules、risk override、AI autonomous policy） | Private / Local only |
| Phase 13 | Enterprise Privacy / Model Policy（private model policy、redaction、disable raw context / detailed logs） | Private / Local only |
| Phase 14 | SaaS Platform / Multi-tenant / Billing（auth、RBAC、multi-tenant isolation、billing、audit、cost） | Private / Local only |

### Updated Phase 5 Readiness
- Ready for public open-source Phase 5.
- Phase 5 should start with Execution Assets 完整化, not Pro / Enterprise templates and not SaaS platform work.
- Phase 10–14 should remain out of public GitHub scope unless explicitly reclassified later.

## Phase 5 Summary — Execution Assets 完整化

### Pre-coding Audit
- docs/development-memory.md review: Phase 4B 已完成 Workflow Studio 编辑能力，公共 GitHub 路线图明确 Phase 5 只做 Execution Assets，不进入 Pro / Enterprise / SaaS 闭源阶段。
- Existing Assets UI: 已有 Execution Assets 页面，但 Prompt 仅 textarea，Checklist / Artifact Template 只读，缺结构化字段、copy、server regenerate 统一刷新。
- Existing Server API: 已有 `GET /assets`、`PATCH /assets/:assetId`、节点 generate-prompt / generate-checklist；缺前端 regenerate client 包装，asset patch 返回数据不足。
- Gaps found: Prompt Role/Objective/Context/Output/Acceptance Criteria 未结构化；Checklist 不可编辑；Artifact Template 不可编辑；资产编辑后未统一刷新 workflow/validation/assets/history/jobs；server mode asset edit 错误展示不一致。

### Completed
- 扩展 Execution Assets 页面为三类资产的结构化详情：Prompt、Checklist、Artifact Template。
- Prompt 支持 Role、Objective、Context Required、Output Format、Acceptance Criteria、Content 编辑，以及 Copy / Regenerate。
- Checklist 支持 Reviewer Role、Checklist Items 编辑，以及 Copy / Regenerate。
- Artifact Template 支持 Artifact Name、Format、Required Sections、Completion Criteria、Content 编辑，以及 Copy。
- Server Mode 资产编辑统一走 `assetsApi.update`，保存成功后 `refreshProjectRuntime` 刷新 workflow / validation / assets / history / jobs。
- Node Detail assets 区域补充 Checklist 生成 / 重新生成入口。
- Server asset patch 返回更新后的 assets 与 validation_results，并支持 `artifact_templates` / `artifactTemplates` 兼容。
- 新增 `assetsApi.get` / `assetsApi.regenerate` client 方法。
- 更新 `scripts/studio-workflow-edit-check.js`，覆盖 Phase 5 资产结构化字段、copy/regenerate 和刷新路径。

### Files Changed
- apps/studio/src/api-client/index.js
- apps/studio/src/app.js
- apps/server/src/server.js
- scripts/studio-workflow-edit-check.js
- docs/development-memory.md

### Execution Assets Changes
- Prompt: structured edit for Role / Objective / Context Required / Output Format / Acceptance Criteria / Content.
- Checklist: structured edit for Reviewer Role / Checklist Items.
- Artifact Template: structured edit for Name / Format / Required Sections / Completion Criteria / Content.
- Asset list now shows asset totals and outdated count.

### Server / Refresh Changes
- Asset patch revalidates workflow against updated assets and returns updated assets + validation results.
- Server Mode asset edit / regenerate refreshes runtime through `refreshProjectRuntime`.
- Demo Mode remains local-only and explicitly marked.

### Tests Added / Updated
- `scripts/studio-workflow-edit-check.js` now checks Phase 5 structured asset fields, regenerate API, copy/regenerate actions, and runtime refresh path.

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

### Known Limitations
- Asset editing remains lightweight in the existing app.js structure; no large UI refactor or dedicated asset editor framework was introduced.
- Generic `assets/:assetId/regenerate` remains minimal on the server; Prompt / Checklist regenerate uses node-specific generation APIs.

### Phase 6 Readiness
- Ready.
- Phase 6 should start with Execution Kit Export 完整化 and must not include private Phase 10–14 commercial work.

## Phase 6 Summary — Execution Kit Export 完整化

### Pre-coding Audit
- docs/development-memory.md review: Phase 5 已完成 Execution Assets，Phase 6 按公共 GitHub 路线图聚焦 Execution Kit Export，不包含 Phase 10–14 私有商业化能力。
- Existing Export UI: 已有轻量 Preview，但仅一个按钮，缺 Draft / Final Kit 选择、正式 generate、download、PRD 文件名结构和 blocking final 展示。
- Existing Server API: 已有 preview / generate / get / download 路由，但 generate 检查 `kit.files.length` 对对象不成立，preview 返回结构缺 canExportFinal / blocking summary。
- Gaps found: Execution Kit 文件结构不符合 PRD 命名；Final Kit blocking 规则不显式；Studio 缺 Download Latest；API client 缺 download；tests 未覆盖 Phase 6 export 路径。

### Completed
- Execution Kit generator 输出 PRD 文件结构：`01_workflow_spec.json`、`02_task_list.md`、`03_prompt_pack.md`、`04_review_checklists.md`、`05_artifact_templates.md`、`06_responsibility_map.md`、`07_risk_report.md`。
- Exporter 保留 `canExportFinal`、`blockingErrors`、`validation_summary`、snapshot version 和 kit type。
- Server preview / generate 重新运行 validation；Final Kit 在 blocking error 存在时返回 `FINAL_KIT_BLOCKED`；generate 修复 object files 判断并保存 generated kit record。
- Studio Export 页面新增 Draft / Final Kit 选择、Generate Preview、Generate Draft/Final Kit、Download Latest、Copy Preview JSON 和 validation summary 展示。
- API Client 新增 `executionKitsApi.download`，preview / generate 支持 payload（kit_type）。
- `scripts/studio-workflow-edit-check.js` 增加 Phase 6 检查：download API、preview/generate/download actions、Draft/Final Kit UI。

### Files Changed
- packages/generators/src/executionKitGenerator.js
- packages/exporter/src/executionKitExporter.js
- apps/server/src/server.js
- apps/studio/src/api-client/index.js
- apps/studio/src/app.js
- scripts/studio-workflow-edit-check.js
- docs/development-memory.md

### Execution Kit Changes
- Draft Kit: 可 preview / generate，允许带 warning/error 但展示 validation summary。
- Final Kit: blocking validation error 时由 Server 拦截，不生成 Final Kit。
- Download: Studio 可下载 latest generated kit（当前复制 download content 到剪贴板）。
- Snapshot binding: generated kit record 保留 `workflow_snapshot_version` 和 `input_snapshot.workflow_version`。

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

### Known Limitations
- 下载体验仍为 API content 复制到剪贴板，尚未做浏览器 Blob 文件保存。
- YAML 导出仍通过 workflow spec JSON 结构承载，后续可在 exporter 中增加 YAML serializer。

### Phase 7 Readiness
- Ready.
- Phase 7 should start with Model Access Layer / Real LLM / Structured Output and must remain server-side.

## Phase 7 + Phase 8 Summary — Model Access 收口与 AI Diff Review 启动

### Pre-coding Audit
- docs/development-memory.md review: Phase 6 已完成 Execution Kit Export，Phase 7 应进入 Model Access Layer / Real LLM / Structured Output，Phase 8 应启动 AI Assisted Edit + Diff Review UI；Phase 10–14 仍为私有闭源商业化范围。
- Existing Model Access: `llmAccess.js` 仅返回 mock / real-not-implemented，且 env key 与 `.env.example` 的 `ROLEUNION_LLM_*` 不一致。
- Existing Diff UI: Studio 已有 AI Edit / Diff Review 轻量 UI，但 server mode 仍走本地 mock diff / local apply，未调用 Diff API。
- Gaps found: OpenAI-compatible call 未实现；structured output parsing 缺失；model call summary 不完整；AI Diff 生成 / apply / reject 未 server 化；AI context 发送提示缺失。

### Completed
- Phase 7：`llmAccess.js` 支持 `ROLEUNION_LLM_*` 配置、OpenAI-compatible `/chat/completions` 调用、structured JSON output parsing、timeout、mock fallback、model status 扩展。
- Phase 7：Model status 返回 provider / mode / default / planning / prompt / diff model / structured output / log level；model calls 记录 purpose/status/model/summary。
- Phase 8：API Client 新增 `diffsApi.generate/get/apply/reject`。
- Phase 8：Server diff generation 会先尝试 `runModel('workflow_diff')`，若模型输出没有结构化 diff 则 fallback 到 deterministic diff generator；生成结果保存为 draft diff。
- Phase 8：Studio AI Assisted Edit 在 server mode 下调用 Diff API，显示 context-to-LLM 提示，Diff Review 支持 warnings、逐条选择、server apply selected/all、server reject。
- Phase 8：Diff apply 携带 `workflow_version` 和 `selected_change_ids`；成功后刷新 workflow / validation / assets / jobs / history，冲突显示统一 VERSION_CONFLICT 文案。
- 更新 script-level checks 覆盖 diffs API、server AI diff review path、selected_change_ids 和 LLM context warning。

### Files Changed
- apps/server/src/llmAccess.js
- apps/server/src/server.js
- apps/studio/src/api-client/index.js
- apps/studio/src/app.js
- scripts/studio-workflow-edit-check.js
- docs/development-memory.md

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

### Known Limitations
- Real LLM workflow generation/prompt generation 仍可继续深化；本轮重点是 Model Access Layer 基础能力与 AI Diff Review server 化。
- Diff UI 仍是轻量列表，不做复杂 Diff Viewer。

## Phase 8 Enhancement - Conversational Workflow Diff on Studio Canvas

### Open-source Scope
- This remains part of public Phase 0-9, specifically Phase 8 AI Assisted Edit + Diff Review.
- It does not enter Phase 10-14 Pro / Enterprise / SaaS scope.

### UX Decision
- Studio canvas gets a bottom floating natural-language input for workflow edit requests.
- AI conversation / diff review lives in a left drawer.
- Node Detail remains a right drawer; both drawers can coexist without blocking each other.
- Context scope is explicit: selected node, selected node + neighbors, current phase, or entire workflow.
- LLM output must remain a reviewed workflow diff. The model proposes changes; the user selects and applies them; server validation remains authoritative.

### Apply Logic Target
- Phase changes: add, rename/update, delete empty phase, reorder through phase fields.
- Node changes: add, update fields, delete.
- IO / artifact contract changes: inputs, outputs, artifact contract, acceptance criteria.
- Review gate changes: add/update/remove gate fields.
- Edge changes: add, update dependency metadata, delete.
- Asset handling: structural node changes mark related prompts/checklists/templates outdated first; direct prompt regeneration remains a separate user action.

### Phase 9 Readiness
- Ready.
- Phase 9 should focus on MVP Templates / Examples / README / Release Hardening, not private Phase 10–14 commercial work.

## Phase 9 Summary — MVP Templates / Examples / README / Release Hardening

### Pre-coding Audit
- docs/development-memory.md review: Phase 7/8 已完成 Model Access 与 server-backed Diff Review 基础链路，Phase 9 应聚焦公开 GitHub MVP 的模板、示例、README 与 release hardening；Phase 10–14 仍为本地/闭源商业化范围，不进入公开仓库。
- Existing Templates: core 层没有统一内置模板 registry，Server 也没有公开模板列表 API；Create Project 对模板来源没有显式 metadata。
- Existing Examples: 仅有 `ai-saas-feature-mvp.json` 单一示例，无法覆盖 Internal AI Tool / Legacy Modernization 两个 MVP 模板。
- Existing README: 已落后于 Phase 5–8 的真实能力，缺少 Open-source vs Commercial 边界、Quick Start、LLM 配置、模板和示例说明。
- Gaps found: 缺 3 个公开 MVP 模板、缺 `examples/templates.json`、缺模板 server smoke、缺 schema-level template checks、缺 README release hardening。

### Completed
- 新增 public built-in template registry，公开 3 个 MVP 模板：AI SaaS Feature MVP、Internal AI Tool、Legacy System AI Modernization。
- Server 新增 `GET /api/templates` 与 `GET /api/templates/:templateId`，Create Project 会记录 `created_from_template` 与 `template_version`。
- API Client 新增 `templatesApi.list/get`，便于 Studio 或后续页面读取公开模板。
- 示例生成脚本扩展为生成 3 个项目示例与 `examples/templates.json`。
- `packages/examples` loader 扩展为可读取 3 个示例项目与模板示例。
- README 更新为公开 MVP release 文档，明确 Phase 0–9 开源范围与 Phase 10–14 闭源商业化边界。
- `scripts/check.js` 增加模板 schema 校验、模板匹配校验、Internal/Legacy 示例 spec 校验；`scripts/server-smoke.js` 增加模板 API smoke。

### Files Changed
- `packages/core/src/templates.js`
- `apps/server/src/server.js`
- `apps/studio/src/api-client/index.js`
- `packages/examples/src/aiSaasFeatureMvp.js`
- `scripts/generate-example.js`
- `scripts/check.js`
- `scripts/server-smoke.js`
- `examples/ai-saas-feature-mvp.json`
- `examples/internal-ai-tool.json`
- `examples/legacy-system-ai-modernization.json`
- `examples/templates.json`
- `README.md`
- `docs/development-memory.md`

### Template Changes
- Built-in templates remain public/open-source and carry schema-compatible `content` payloads.
- Template selection uses project type/name/goal keywords and defaults to AI SaaS Feature MVP.
- Public API exposes template list/detail only; Pro / Enterprise template lifecycle remains outside GitHub scope.

### Example Changes
- `node scripts/generate-example.js` now regenerates 3 MVP example specs plus public template metadata.
- Each generated spec includes workflow/assets/validation/diff sample/template references.
- Example loader package can load all public examples for tests or docs.

### README / Release Hardening
- README now documents Quick Start, server/demo modes, OpenAI-compatible env config, built-in templates, examples, workspace layout, commands, data/security boundaries and known limitations.
- Release checks cover schema/rules/core/storage/studio edit checks, template checks, example spec validation and server template smoke.

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

### Known Limitations
- Public templates are metadata + generator selection rules, not a full Pro template version/upgrade/diff system.
- Studio Create Project can use project type to trigger template selection, but no dedicated rich template marketplace UI was added.
- Enterprise organization templates, governance, privacy/model policy and SaaS billing remain private Phase 10–14 work.

### Phase 10–14 Boundary
- Ready to stop public GitHub roadmap at Phase 9.
- Phase 10–14 are commercial closed-source/local development and should not be published in this repository.

## Open-source UI Theme Polish — Theme Color System

### Scope
- 本轮不进入 Phase 10–14，不新增 Pro / Enterprise / SaaS 功能，仅为开源 Phase 0–9 Studio 上线统一主题色系统。
- 主题目标：让 Local Demo / Local Server / Workflow Studio / Execution Assets / Export 等公开 UI 使用一致的 open-source 主题色、视觉层级和组件状态。

### Completed
- `apps/studio/styles.css` 新增 open-source theme tokens：primary / accent / violet、semantic risk colors、shadow、radius、panel/background tokens。
- Sidebar / Topbar / Cards / Buttons / Forms / Node Cards / Phase Lanes / Tabs / Alerts / Code Preview 统一为主题色视觉。
- Studio 根容器增加 `data-theme="open-source"`，Sidebar 增加 Open Source Theme 色条与 swatches。
- 保持纯 CSS / 轻量 DOM 调整，不改变 server-first 数据路径、不新增商业化能力。

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

### Known Limitations
- 本轮为主题色系统和核心组件视觉 polish，未引入复杂设计系统或独立 UI 组件库。

## Open-source Studio Local Preview Fix

### Issue
- 用户在 Windows 下从仓库根目录运行 `py -m http.server 5173` 后，`apps/studio/src/state/store.js` 与 `mockModelService.js` 的嵌套相对 import 会解析成 `/apps/packages/...`，导致浏览器 404，无法直接查看开源 UI 效果。

### Completed
- 修正 `apps/studio/src/state/store.js` 与 `apps/studio/src/services/mockModelService.js` 的 package import 深度，使其在 repo-root static server 下解析到 `/packages/...`。
- 新增 `scripts/dev-studio.js`：从仓库根目录 serve Studio，并将 `/api/*` proxy 到 `ROLEUNION_API_BASE_URL`（默认 `http://localhost:8787`）。
- `apps/studio/package.json` 的 `dev` 改为调用上述 dev server，后续可直接使用 `npm run dev:studio` 查看 UI。
- `scripts/studio-workflow-edit-check.js` 增加 dev server 与 nested import 检查，避免 `/apps/packages/...` 回归。

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

## Open-source Studio EADDRINUSE Preview Fix

### Issue
- Windows 本地仍可能有旧的 `py -m http.server 5173` 占用端口，导致 `npm run dev:studio` 抛 `EADDRINUSE`，浏览器继续显示旧 server 的空白背景页面。

### Completed
- `scripts/dev-studio.js` 增加端口 fallback：默认从 5173 启动，若端口占用则自动尝试 5174、5175 等，并在终端打印实际可访问 URL。
- README Quick Start 增加说明：必须打开 dev server 终端打印的 URL；如果只有背景没有内容，应停止旧 Python server 或使用自动分配的新端口。
- Studio script-level check 增加 `EADDRINUSE` / fallback 路径检查。

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

## Open-source Studio Blank UI / Duplicate API Export Guard

### Issue
- 用户本地浏览器控制台显示 `Identifier 'diffsApi' has already been declared`，导致 `src/app.js` 模块启动失败，页面只显示 CSS 背景。
- 当前仓库版本中 `apps/studio/src/api-client/index.js` 只保留一个 `export const diffsApi`，但需要新增自动检查防止合并冲突再次产生重复 API export。

### Completed
- `scripts/studio-workflow-edit-check.js` 增加 API client export 唯一性检查，会扫描所有 `export const *Api =`，若 `diffsApi` 或其他 API 重复声明则直接失败。

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed

## Open-source Studio diffsApi De-duplication Guard

### Issue
- 远程 main 曾出现两个 `export const diffsApi` block，导致浏览器模块解析失败，Studio 只显示主题背景。

### Completed
- 当前 `apps/studio/src/api-client/index.js` 保持单一 `diffsApi` 声明，并在 `apiClient` 中只引用一次。
- `scripts/studio-workflow-edit-check.js` 增加专门检查：`diffsApi` export 必须恰好一次，`apiClient` 对象内的 `diffsApi` 引用也必须恰好一次。

### Validation
- typecheck: passed
- test: passed
- smoke:server: passed
- check: passed
