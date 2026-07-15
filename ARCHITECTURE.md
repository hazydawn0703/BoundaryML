# RoleUnion Architecture Mapping（对应 PRD 27–41）

## 27. System Architecture & Runtime Model

- Studio: `apps/studio`（已实现）
- Communication Layer: `apps/studio/src/api-client`（已实现，统一 API Client）
- Server: `apps/server`（已实现 skeleton）
- Core Engine: `packages/core`（已实现基础对象/DIFF）
- Boundary Rules: `packages/rules`（已实现）
- Generators: `packages/generators`（已实现 mock）
- LLM Access Layer: `apps/server/src/llmAccess.js`（stub + mock fallback）
- Persistence Layer: `packages/storage`（已实现 Memory/File）

## 28. Runtime Modes

- Local Demo Mode：已实现（Server 不可用自动降级）
- Local Server Mode：已实现（Server + Storage）
- Distributed Self-hosted：未实现
- SaaS Mode：未实现

## 29–36（运行边界与系统职责）

### 已实现
- Studio 不直接持有 LLM API Key
- Studio 通过统一 API client 调用 Server
- API Base URL 优先级：`import.meta.env` -> `window` -> `/api`
- Server 统一 response envelope
- Request context 强制注入 workspace/user（不信任前端）
- Job 查询闭环：`GET /api/projects/:projectId/jobs/:jobId`

### Stub
- Generation Job：支持 queued/running/succeeded/failed 与 job 查询，但当前仍是**同步 mock**（非真实异步队列）
- Workflow history/snapshot：基础结构已落地，未提供 UI 历史面板

### 未实现
- 完整鉴权/多租户认证
- 真正异步队列与 job polling API
- 完整审计日志、细粒度权限、审批编排

## 37–41（P0 可靠性/安全/数据完整性）

### 已实现
- FileStorage 按 workspace 目录隔离
- Atomic write（tmp + rename）
- Server 自动写入 workspace_id / created_by / updated_by
- Schema validation（项目/工作流/job + RoleUnion 完整 Spec 校验）

### Stub
- LLM 输出仅做基础 schema 校验
- model status 提供 mock/real 配置状态，但真实 provider 调用未完成
- `validateProject` 仅是实体校验；完整项目级 Spec 校验由 `validateRoleUnionProjectSpec` 提供

### 未实现
- 完整安全基线（速率限制、审计、密钥轮换、KMS）
- 全量事务一致性与并发控制
