# BoundaryML

BoundaryML 是一个面向 AI 转型项目的 **可视化人机协作边界编排系统**。它帮助团队在项目启动前明确：项目阶段、节点输入输出、人机执行模式、Review Gate、Execution Assets 与可导出的 Execution Kit。

## 当前公开范围

本 GitHub 仓库只发布 **MVP / Open-source 主线（Phase 0–9）**。

- Phase 0–4B：Schema/Core/Rules、Server、Storage、Studio Server 数据接入、Workflow Studio 编辑能力。
- Phase 5：Execution Assets 完整化（Prompt / Checklist / Artifact Template）。
- Phase 6：Execution Kit Export 完整化（Draft / Final Kit、Preview / Generate / Download）。
- Phase 7：Model Access Layer 基础能力（OpenAI-compatible、structured output、mock fallback）。
- Phase 8：AI Assisted Edit + server-backed Diff Review 基础链路。
- Phase 9：MVP Templates / Examples / README / Release Hardening。

Phase 10–14（Pro Template System、Enterprise Organization Templates、Enterprise Rules & Governance、Enterprise Privacy / Model Policy、SaaS Platform / Billing）属于商业化闭源路线，不在本公开仓库发布。

### Local Demo Mode

无需启动 Server，Studio 会使用内置 Example Workflow 和 Mock Model Service。该模式只用于 GitHub Demo / 快速体验，UI 会标记：

```text
Mode: Local Demo / Mock Model
```

### Local Server Mode

当前正式开源运行模式：Studio 通过 HTTP API 访问 BoundaryML Server，Server 负责 `.env`、持久化、LLM Access、Workflow/Asset/Execution Kit 生成。Local Server 默认使用 FileStorage，并会在首次启动时自动创建 `./data`；如需一次性内存模式，可显式设置 `BOUNDARYML_STORAGE_ADAPTER=memory`。

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev:server
```

Start Studio:

```bash
npm run dev:studio
```

- Server: `http://localhost:8787`
- Studio: `http://localhost:5173/apps/studio/index.html`（如果 5173 被占用，终端会自动打印新的端口，例如 5174）
- `npm run dev:studio` 会从仓库根目录 serve Studio，并将 `/api/*` proxy 到 `BOUNDARYML_API_BASE_URL`（默认 `http://localhost:8787`）。
- 若页面只有背景没有内容，请确认浏览器打开的是 `npm run dev:studio` 终端打印的 URL，并停止旧的 `py -m http.server 5173` 进程或换用自动分配的新端口。
- Studio API Base URL: `VITE_BOUNDARYML_API_BASE_URL` → `window.BOUNDARYML_API_BASE_URL` → `/api`

## OpenAI-compatible Model 配置

开源版支持两种配置方式：

- 在 `.env` 中设置默认模型配置。
- 在 Studio 的 `Settings / Model Access` 页面保存配置，保存后会立即更新 Server 运行时，并写入 `BOUNDARYML_MODEL_CONFIG_PATH`（默认 `./data/model-config.json`）。

`.env.example` 已包含：

```bash
BOUNDARYML_MODEL_CONFIG_PATH=./data/model-config.json
BOUNDARYML_LLM_PROVIDER=openai-compatible
BOUNDARYML_LLM_API_KEY=
BOUNDARYML_LLM_BASE_URL=
BOUNDARYML_LLM_DEFAULT_MODEL=
BOUNDARYML_LLM_PLANNING_MODEL=
BOUNDARYML_LLM_PROMPT_MODEL=
BOUNDARYML_LLM_DIFF_MODEL=
BOUNDARYML_LLM_ENABLE_STRUCTURED_OUTPUT=true
BOUNDARYML_ALLOW_MOCK_MODEL=true
```

如果未配置 API Key，Server 会在允许 mock 的情况下使用 Mock Model fallback。Studio 不会回显原始 API Key，只显示是否已配置和 masked 值；模型 Key 只保存在 Server 本地配置文件中，不进入浏览器 localStorage，也不进入 git（`data/` 已被忽略）。

## MVP Built-in Templates

Phase 9 公开仓库内置 3 个 MVP 模板：

1. **AI SaaS Feature MVP** — AI SaaS 功能从 0 到 1。
2. **Internal AI Tool** — 企业内部 AI 工具或自动化系统建设。
3. **Legacy System AI Modernization** — 传统系统接入 AI 能力或使用 AI Coding 工具重构。

模板清单示例：`examples/templates.json`。

Server 公开只读模板 API：`GET /api/templates` 与 `GET /api/templates/:templateId`。

## Examples

- `examples/ai-saas-feature-mvp.json`
- `examples/internal-ai-tool.json`
- `examples/legacy-system-ai-modernization.json`
- `examples/templates.json`

这些示例均为 BoundaryML Spec，包含 workflow、assets、validation、diff 示例与模板引用。

## Workspace 结构

- `apps/studio`：BoundaryML Studio
- `apps/server`：BoundaryML Server API
- `packages/schema`：BoundaryML schema + validation
- `packages/core`：Workflow / Diff / Template 核心对象
- `packages/rules`：Boundary Rules
- `packages/generators`：Workflow / Prompt / Checklist / ExecutionKit generators
- `packages/exporter`：Execution Kit exporter
- `packages/storage`：MemoryStorage / FileStorage
- `packages/examples`：Example Spec loader
- `examples`：生成后的示例数据
- `scripts`：检查与示例生成脚本

## 常用命令

```bash
npm run typecheck
npm run test
npm run smoke:server
npm run check
node scripts/generate-example.js
```

`npm run check` 会覆盖 schema/rules/core/storage/server smoke，并运行 Studio server-first 路径检查。

## 数据与安全边界

- 正式数据源是 Server + Storage，不是浏览器 localStorage。Local Server 默认将 Project / Workflow / Context / Assets / Jobs 持久化到 `./data`。
- Local Demo Mode 仅保存演示 / UI 状态。
- 所有 Project 相关数据必须处于 workspace scope。
- LLM Context 只在用户触发生成 / Diff 时发送到配置的 provider。
- AI Assisted Edit 必须生成 Diff，不能静默覆盖正式 Workflow。

## 当前已知限制

- Diff Review UI 仍是轻量列表，不是复杂 diff viewer。
- Execution Kit 下载目前通过 API 返回内容，Studio 侧仍以复制内容为主。
- Real LLM workflow / prompt generation 可继续深化。
- Pro / Enterprise / SaaS 能力不在公开仓库范围内。
