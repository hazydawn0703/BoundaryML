# BoundaryML Monorepo（PRD 架构骨架阶段）

当前仓库处于 **PRD 架构骨架验收阶段**：
- 支持 **Local Demo Mode**（Studio 无 Server 时降级）
- 支持 **Local Server Mode**（Studio + Server + Storage）

## Workspace 结构

- `apps/studio`：BoundaryML Studio（前端）
- `apps/server`：BoundaryML Server（API skeleton）
- `packages/schema`：BoundaryML schema + validate 方法
- `packages/core`：Project/Workflow/Diff 核心对象
- `packages/rules`：Boundary Rules 校验
- `packages/generators`：Workflow/Prompt/Checklist/ExecutionKit 生成器
- `packages/storage`：MemoryStorage / FileStorage
- `examples`：示例数据
- `scripts`：校验与示例生成脚本

## 运行模式

### 1) Local Demo Mode
Studio 启动后如果无法访问 Server，会自动降级为 Local Demo Mode，并在 UI 顶栏显示 `Mode: Local Demo (Server unavailable)`。

### 2) Local Server Mode
当 Server 可用时，Studio 顶栏显示 `Mode: Local Server`。

## 启动

```bash
npm install
npm run dev:server
npm run dev:studio
```

- Server: `http://localhost:8787`
- Studio: `http://localhost:5173`

## API 现状（骨架阶段）

### 可用实现（基础可运行）
- `GET /health`
- `GET /api/model/status`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `GET/PUT /api/projects/:projectId/context-pack`
- `GET /api/projects/:projectId/workflow`
- `POST /api/projects/:projectId/workflow/validate`
- `GET /api/projects/:projectId/assets`
- `POST /api/projects/:projectId/execution-kits/preview`
- `GET /api/projects/example`

### Stub / mock（已提供结构化返回）
- `POST /api/projects/:projectId/context-pack/summarize`
- `POST /api/projects/:projectId/workflow/generate`
- `POST /api/projects/:projectId/diffs/generate`
- `POST /api/projects/:projectId/diffs/:diffId/apply`
- `POST /api/projects/:projectId/execution-kits/generate`

## 数据边界

- 正式数据边界为 **Server + Storage**。
- `packages/storage` 的 `FileStorage` 按 `workspace_id` 隔离目录，且使用临时文件 + rename 原子写入。
- 不提供无 scope 的“读取所有 workspace 数据”接口。

## 校验

```bash
npm run dev:server
```

`check` 会验证：
- 核心规则
- diff 应用
- execution kit 约束
- `examples/ai-saas-feature-mvp.json` schema 校验
- FileStorage 重启后可读取
