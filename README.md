# BoundaryML Monorepo

BoundaryML 已按 PRD（含《架构补充章节 27–41》）重构为 monorepo 结构，包含 Studio、Server、Core、Rules、Generators、Schema、Storage、Docs、Examples 与 Scripts。

## 目录结构

- `apps/studio`：前端 Studio
- `apps/server`：BoundaryML Server（API 入口）
- `packages/schema`：BoundaryML Spec / JSON Schema / Zod Schema（当前含基础字段契约）
- `packages/core`：Workflow / Node / Diff / Snapshot 核心对象逻辑
- `packages/rules`：Boundary Rules
- `packages/generators`：Workflow / Prompt / Checklist / Execution Kit generators
- `packages/storage`：MemoryStorage / FileStorage adapter
- `docs`：PRD 与 UI 设计文档
- `examples`：内置 AI SaaS Feature MVP 示例
- `scripts`：开发与校验脚本

## 快速开始

```bash
npm install
npm run dev:studio
```

打开：`http://localhost:5173/`

启动后端：

```bash
npm run dev:server
```

后端健康检查：`http://localhost:8787/health`

## 校验

```bash
npm run check
```
