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
