# BoundaryML Development Memory

## Phase 0 - Shared Schema / Core / Spec / Rules 最小地基

### 本 Phase 完成内容
- 强化 `packages/schema`：补齐 Spec v0.1 关键对象 schema 与 runtime 校验函数。
- 补充 `validateBoundaryMLProjectSpec` 全量项目级校验与 `validateAssets`。
- 强化 `packages/rules`：补齐 Phase 0 所需 P0 规则（10 条）。
- 新增 `packages/core/src/engine.js`：实现 workflow patch/diff/version/snapshot/normalize/validation-status 等纯函数。
- 提供 `packages/examples` 与 `packages/exporter` 最小可复用包。
- 更新 example 生成逻辑，使 `examples/ai-saas-feature-mvp.json` 为完整 BoundaryML Spec，并包含 warning、outdated prompt、diff 示例。
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
  - `validateBoundaryMLProjectSpec`
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
  - `validateBoundaryMLProjectSpec` error/warning/suggestion 覆盖
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
- Workflow generate: `createWorkflowFromTemplate` + `normalizeWorkflowSpec` + `validateWorkflow(schema)` + `validateWorkflow(rules)` + spec-level `validateBoundaryMLProjectSpec`。
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
