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

BoundaryML is not Jira / Linear / Notion. BoundaryML is not Codex / Claude Code / Copilot. BoundaryML is the planning and governance layer before agents execute.

### Local Demo Mode

无需启动 Server，Studio 会使用内置 Example Workflow 和 Mock Model Service。该模式只用于 GitHub Demo / 快速体验，UI 会标记：

```text
Mode: Local Demo / Mock Model
```

### Local Server Mode

当前正式开源运行模式：Studio 通过 HTTP API 访问 BoundaryML Server，Server 负责 `.env`、持久化、LLM Access、Workflow/Asset/Execution Kit 生成。

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
- Studio: `http://localhost:5173`
- Studio API Base URL: `VITE_BOUNDARYML_API_BASE_URL` → `window.BOUNDARYML_API_BASE_URL` → `/api`

## OpenAI-compatible Model 配置

`.env.example` 已包含：

```bash
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

如果未配置 API Key，Server 会在允许 mock 的情况下使用 Mock Model fallback。模型 Key 只应保存在 Server，不进入浏览器。

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

- 正式数据源是 Server + Storage，不是浏览器 localStorage。
- Local Demo Mode 仅保存演示 / UI 状态。
- 所有 Project 相关数据必须处于 workspace scope。
- LLM Context 只在用户触发生成 / Diff 时发送到配置的 provider。
- AI Assisted Edit 必须生成 Diff，不能静默覆盖正式 Workflow。

## 当前已知限制

- Diff Review UI 仍是轻量列表，不是复杂 diff viewer。
- Execution Kit 下载目前通过 API 返回内容，Studio 侧仍以复制内容为主。
- Real LLM workflow / prompt generation 可继续深化。
- Pro / Enterprise / SaaS 能力不在公开仓库范围内。
