# BoundaryML PRD 架构补充章节：27–36

> 文档定位：本文作为《BoundaryML PRD v1》的架构补充文件，用于明确 BoundaryML 不是单纯前端工程，而是由 Studio 前端、Server 后端、Core Engine、Persistence Layer、LLM Access Layer、Communication Layer 共同组成的系统。后续开发必须以 PRD 为真源，不得仅根据当前代码形态或 MVP 临时实现反推产品架构。

---

# 27. System Architecture & Runtime Model

## 27.1 章节目标

BoundaryML 当前 PRD 已经定义了产品对象、规则、状态机、模板系统、Diff 机制、Execution Kit 和 MVP 验收标准，但尚未明确系统架构形态。

本章用于补齐一个关键判断：

> BoundaryML 不是一个纯前端应用，而是一个由前端 Studio、后端 Server、核心引擎、持久化层、LLM 接入层和前后端通信层组成的产品系统。

前端负责可视化、交互和用户确认；后端负责项目数据、模型调用、规则校验、生成器、导出和持久化。

即使 MVP 阶段前后端部署在同一台服务器上，前端也必须通过通信层与后端交互，而不是直接在浏览器中完成所有核心逻辑。

---

## 27.2 BoundaryML 的系统组成

BoundaryML 应由以下核心层组成：

```text
BoundaryML Studio
  ↓
Communication Layer
  ↓
BoundaryML Server
  ↓
Core Engine / Rules / Generators / LLM / Storage
```

### 27.2.1 BoundaryML Studio

BoundaryML Studio 是前端可视化工作台。

职责包括：

- 展示 Projects；
- 创建 Project；
- 编辑 Context Pack；
- 展示 Workflow Canvas；
- 展示 Node Detail；
- 发起 AI Assisted Edit；
- 展示 Diff Review；
- 展示 Execution Assets；
- 预览和触发 Export；
- 展示 Model Status 和 Validation Result。

Studio 不应直接保存正式项目数据，不应直接读取 LLM API Key，不应直接调用外部 LLM Provider。

---

### 27.2.2 Communication Layer

Communication Layer 是前后端之间的正式通信边界。

职责包括：

- 定义前端如何请求后端生成 Workflow；
- 定义前端如何提交 Context Pack；
- 定义前端如何读取和保存 Workflow；
- 定义前端如何请求生成 Prompt、Checklist、Diff 和 Execution Kit；
- 定义前端如何接收 Validation Result、Model Call Status 和 Export Preview；
- 为未来前后端部署在不同服务器、不同域名、不同网络环境中预留架构空间。

Communication Layer 不是可选项。

即使前后端一开始部署在同一台服务器，也必须通过该层通信。

---

### 27.2.3 BoundaryML Server

BoundaryML Server 是后端运行时。

职责包括：

- 管理 Project；
- 管理 Context Pack；
- 管理 Workflow；
- 管理 Execution Assets；
- 管理 Execution Kit；
- 调用 Core Engine；
- 调用 Boundary Rules；
- 调用 Generators；
- 调用 LLM Access Layer；
- 调用 Persistence Layer；
- 返回结构化结果给 Studio。

Server 是 BoundaryML 正式能力的入口，不应被前端绕过。

---

### 27.2.4 Core Engine

Core Engine 是 BoundaryML 的产品内核。

职责包括：

- 维护 BoundaryML Spec；
- 创建和更新 Workflow；
- 应用 Workflow Diff；
- 管理状态机；
- 管理 Workflow Version；
- 生成 Workflow Snapshot；
- 将 Node / Edge / Review Gate / Asset 组织成一致的产品对象。

---

### 27.2.5 Boundary Rules

Boundary Rules 是规则校验层。

职责包括：

- 校验 Workflow 是否完整；
- 校验高风险节点是否有 Review Gate；
- 校验 AI 节点是否具备输出格式和验收标准；
- 校验 Human Only 节点是否错误生成 AI Prompt；
- 校验 AI Autonomous 是否只用于低风险节点；
- 生成 Error / Warning / Suggestion；
- 阻止不合规 Workflow 进入 Final。

---

### 27.2.6 Generators

Generators 是结构化资产生成层。

职责包括：

- Workflow Draft 生成；
- Prompt 生成；
- Checklist 生成；
- Artifact Template 生成；
- Workflow Diff 生成；
- Task List 生成；
- Responsibility Map 生成；
- Risk Report 生成；
- Execution Kit 生成。

Generators 可以调用 LLM，也可以基于模板和规则生成内容。

---

### 27.2.7 LLM Access Layer

LLM Access Layer 是模型接入层。

职责包括：

- 读取模型配置；
- 管理 OpenAI-compatible 模型调用；
- 管理不同模型用途，例如 planning、prompt、diff；
- 构造模型输入；
- 解析结构化输出；
- 处理模型调用失败；
- 保存模型调用摘要；
- 在未配置真实模型时使用 Mock Model fallback。

LLM API Key 必须由 Server 管理，不能暴露给浏览器端。

---

### 27.2.8 Persistence Layer

Persistence Layer 是持久化层。

职责包括：

- 保存 Project；
- 保存 Context Pack；
- 保存 Workflow；
- 保存 Execution Assets；
- 保存 Workflow Diff；
- 保存 Validation Result；
- 保存 Execution Kit；
- 保存 Model Config 引用；
- 保存 Model Call Log 摘要；
- 支持后续从本地文件、SQLite、Postgres 等不同存储方式切换。

---

## 27.3 架构原则

BoundaryML 后续开发必须遵循以下架构原则。

### 27.3.1 PRD 是开发真源

代码结构必须服从 PRD，而不是让 PRD 适配当前代码。

如果当前代码只是前端 localStorage Demo，也不能因此把 BoundaryML 定义为纯前端工具。

---

### 27.3.2 前后端必须通过通信层交互

即使前后端部署在同一台服务器，也必须通过正式 API / Communication Layer 通信。

禁止将正式模型调用、持久化逻辑和规则校验长期放在浏览器端。

---

### 27.3.3 LLM Key 不得进入浏览器

浏览器端不得保存或直接使用 LLM API Key。

正式模型调用只能通过 Server 发起。

---

### 27.3.4 Local Demo 不等于正式架构

localStorage、Mock Model Service、纯前端生成器只允许作为 Demo Mode 或开发 fallback。

它们不得被定义为正式产品架构。

---

### 27.3.5 核心逻辑应可被前端、后端和 CLI 复用

Boundary Rules、Spec、Generators、Execution Kit 生成等能力应从 UI 中抽离，形成可复用的 Core / Packages。

---

# 28. Runtime Modes

## 28.1 章节目标

BoundaryML 需要支持从开源 Demo 到本地部署再到 SaaS 化的演进，因此 PRD 需要明确不同运行模式。

运行模式不是产品形态的临时补丁，而是架构设计的一部分。

---

## 28.2 运行模式总览

| 模式 | 用途 | 前端 | 后端 | 存储 | LLM |
|---|---|---|---|---|---|
| Local Demo Mode | GitHub 展示、快速体验 | Studio | 无正式 Server | localStorage / in-memory | Mock |
| Local Server Mode | 开源本地可用版本 | Studio | 本地 Server | File / SQLite | Mock 或 Real LLM |
| Distributed Self-hosted Mode | 前后端分离部署 | 独立前端服务 | 独立后端服务 | SQLite / Postgres | Real LLM |
| SaaS Mode | 后续商业化 | Web App | Cloud API | Postgres / Object Storage | Managed LLM Config |

---

## 28.3 Local Demo Mode

Local Demo Mode 用于降低首次体验门槛。

特点：

- 不要求配置 LLM API Key；
- 不要求启动后端；
- 使用内置 Example Workflow；
- 使用 Mock Model Service；
- 可以使用 localStorage 保存演示状态；
- 适合 GitHub README、Demo、快速试用。

限制：

- 不作为正式持久化方案；
- 不保证长期数据保存；
- 不支持真实模型调用；
- 不作为正式产品交付模式。

UI 必须清晰标记：

```text
Mode: Local Demo / Mock Model
```

---

## 28.4 Local Server Mode

Local Server Mode 是 BoundaryML 的第一个正式可用开源运行模式。

特点：

- 前端和后端可以跑在同一台机器；
- 前端通过 API 调用后端；
- 后端负责读取 `.env`；
- 后端负责调用 LLM；
- 后端负责持久化项目数据；
- 后端负责生成 Execution Kit；
- 数据默认保存在本地文件或 SQLite。

本模式是 MVP 后续开发的重点。

---

## 28.5 Distributed Self-hosted Mode

Distributed Self-hosted Mode 用于前后端部署在不同服务器的场景。

典型部署：

```text
studio.company.com  → BoundaryML Studio
api.company.com     → BoundaryML Server API
```

要求：

- 前端通过 API Base URL 访问后端；
- 后端支持 CORS 配置；
- 模型 Key 只保存在后端；
- 持久化存储由后端管理；
- 前端不可假设后端与自己同域或同机。

---

## 28.6 SaaS Mode

SaaS Mode 是后续商业化方向，不进入当前 MVP 强制范围。

它可能包括：

- 用户账号；
- 组织空间；
- 权限控制；
- 多租户隔离；
- 模型调用审计；
- 成本统计；
- 外部工具集成；
- 团队协作。

PRD 当前只要求架构预留，不要求立即实现。

---

# 29. Frontend / Backend Responsibility Boundary

## 29.1 章节目标

本章明确 BoundaryML 前后端职责边界，防止前端长期承担不该承担的核心逻辑，也防止后端过度侵入前端交互。

---

## 29.2 Studio 前端职责

Studio 前端负责：

- 页面路由和导航；
- 表单输入；
- Workflow Canvas 展示；
- Node Detail 展示与编辑；
- Execution Assets 展示与编辑；
- Diff Review 展示与用户确认；
- Export Preview 展示；
- Model Status 展示；
- 调用 Server API；
- 展示 API 返回的结构化结果。

前端可以在本地维护临时 UI 状态，例如：

- 当前页面；
- 当前选中项目；
- 当前选中节点；
- 当前打开的 Drawer；
- 当前筛选条件；
- 表单草稿；
- 临时 Diff 预览。

---

## 29.3 Studio 前端不应负责

Studio 前端不应负责：

- 保存正式 Project 数据；
- 保存 LLM API Key；
- 直接调用 LLM Provider；
- 作为唯一规则校验来源；
- 作为唯一 Execution Kit 生成来源；
- 作为正式审计日志来源；
- 直接操作持久化文件或数据库。

Local Demo Mode 可以临时模拟上述部分能力，但必须明确是 fallback，而不是正式架构。

---

## 29.4 Server 后端职责

Server 后端负责：

- Project CRUD；
- Context Pack 保存与摘要生成；
- Workflow 生成、读取、更新；
- Node / Edge / Review Gate 更新；
- Boundary Rules 校验；
- Workflow Diff 生成与应用；
- Prompt / Checklist / Artifact Template 生成；
- Execution Kit 生成；
- Model Access 管理；
- Model Call Log 摘要记录；
- 持久化存储；
- 导出文件生成。

---

## 29.5 Shared Core 职责

为了避免前后端逻辑重复，BoundaryML 应将以下逻辑沉淀为 shared packages：

- Schema；
- 常量枚举；
- Execution Mode 定义；
- Risk Level 定义；
- Validation Result 定义；
- Boundary Rules；
- Diff Patch 类型；
- Execution Kit 结构；
- 示例 Workflow。

前端使用 shared schema 做类型和展示；后端使用 shared schema 做校验和生成。

---

# 30. Communication Layer

## 30.1 章节目标

Communication Layer 定义 BoundaryML Studio 与 BoundaryML Server 之间的正式通信方式。

它的目标是保证：

- 前后端可以部署在同一台服务器；
- 前后端也可以部署在不同服务器；
- 前端不依赖本地文件系统；
- 后端成为正式模型调用与持久化入口；
- 后续可以增加 WebSocket、任务队列或异步生成能力。

---

## 30.2 通信方式

MVP 阶段默认使用 HTTP JSON API。

后续可扩展：

- Server-Sent Events：用于模型生成进度；
- WebSocket：用于多人协作或实时状态；
- File Download API：用于下载 Execution Kit；
- Webhook：用于外部项目管理工具集成。

当前 PRD 要求优先实现 HTTP JSON API。

---

## 30.3 API Base URL

Studio 前端不应写死后端地址。

前端应支持配置：

```env
BOUNDARYML_API_BASE_URL=http://localhost:8787
```

或在构建环境中使用：

```env
VITE_BOUNDARYML_API_BASE_URL=http://localhost:8787
```

如果前后端同源部署，默认可以使用相对路径：

```text
/api
```

如果前后端分离部署，则使用完整 API Base URL。

---

## 30.4 API 响应基础结构

所有 API 应返回统一结构。

成功：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_001",
    "generatedAt": "2026-04-27T00:00:00Z"
  }
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Workflow contains blocking validation errors.",
    "details": []
  },
  "meta": {
    "requestId": "req_001"
  }
}
```

---

## 30.5 P0 API 清单

### 30.5.1 Project API

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId
```

用途：管理项目基础信息。

---

### 30.5.2 Context Pack API

```text
GET   /api/projects/:projectId/context-pack
PUT   /api/projects/:projectId/context-pack
POST  /api/projects/:projectId/context-pack/summarize
POST  /api/projects/:projectId/context-pack/refresh-impact
```

用途：保存上下文、生成摘要、分析上下文变化影响。

---

### 30.5.3 Workflow API

```text
GET   /api/projects/:projectId/workflow
POST  /api/projects/:projectId/workflow/generate
PATCH /api/projects/:projectId/workflow
POST  /api/projects/:projectId/workflow/validate
POST  /api/projects/:projectId/workflow/mark-final
```

用途：生成、读取、更新和校验 Workflow。

---

### 30.5.4 Node API

```text
GET   /api/projects/:projectId/nodes/:nodeId
PATCH /api/projects/:projectId/nodes/:nodeId
POST  /api/projects/:projectId/nodes/:nodeId/generate-prompt
POST  /api/projects/:projectId/nodes/:nodeId/generate-checklist
```

用途：读取和更新节点，生成节点相关资产。

---

### 30.5.5 Diff API

```text
POST /api/projects/:projectId/diffs/generate
GET  /api/projects/:projectId/diffs/:diffId
POST /api/projects/:projectId/diffs/:diffId/apply
POST /api/projects/:projectId/diffs/:diffId/reject
```

用途：生成、查看、应用或拒绝 AI Workflow Diff。

---

### 30.5.6 Execution Assets API

```text
GET   /api/projects/:projectId/assets
GET   /api/projects/:projectId/assets/:assetId
PATCH /api/projects/:projectId/assets/:assetId
POST  /api/projects/:projectId/assets/:assetId/regenerate
```

用途：管理 Prompt、Checklist、Artifact Template 等执行资产。

---

### 30.5.7 Execution Kit API

```text
POST /api/projects/:projectId/execution-kits/preview
POST /api/projects/:projectId/execution-kits/generate
GET  /api/projects/:projectId/execution-kits/:kitId
GET  /api/projects/:projectId/execution-kits/:kitId/download
```

用途：预览、生成、读取和下载 Execution Kit。

---

### 30.5.8 Model API

```text
GET  /api/model/status
POST /api/model/test
GET  /api/model/calls
```

用途：查看模型配置状态、测试模型连接、读取模型调用摘要。

---

## 30.6 前端 API Client 要求

Studio 应通过统一 API Client 访问 Server。

API Client 负责：

- 读取 API Base URL；
- 统一处理错误；
- 统一处理 loading；
- 统一处理 response envelope；
- 在 Server 不可用时提示用户；
- 可选地 fallback 到 Local Demo Mode。

禁止组件直接拼接大量 fetch 请求。

---

## 30.7 Server 不可用时的处理

如果 Studio 无法连接 Server，应显示明确状态：

```text
Server disconnected. You are viewing Local Demo Mode.
```

用户可以继续浏览 Example Workflow，但以下能力应禁用或切换 mock：

- 真实项目保存；
- 真实 LLM 调用；
- 正式 Execution Kit 生成；
- 模型调用日志。

---

# 31. Persistence Layer

## 31.1 章节目标

Persistence Layer 定义 BoundaryML 如何保存项目和蓝图资产。

BoundaryML 的核心资产不是页面状态，而是可持续迭代的人机分工蓝图。

---

## 31.2 需要持久化的对象

BoundaryML 至少需要持久化以下对象：

| 对象 | 是否必须持久化 | 说明 |
|---|---:|---|
| Project | 是 | 项目基础信息 |
| Context Pack | 是 | 组织上下文、审批流程、工具栈、风险约束 |
| Workflow | 是 | 人机分工蓝图 |
| Phase | 是 | Workflow 阶段 |
| Node | 是 | 可治理工作单元 |
| Edge | 是 | 节点依赖关系 |
| Review Gate | 是 | 审核门 |
| Artifact Contract | 是 | 交付物契约 |
| Prompt Asset | 是 | AI 节点提示词 |
| Checklist Asset | 是 | 人工审核清单 |
| Artifact Template | 是 | 交付物模板 |
| Workflow Diff | 是 | AI 修改建议和用户处理结果 |
| Validation Result | 是 | 校验结果摘要 |
| Execution Kit | 是 | 导出快照 |
| Model Config Reference | 是 | 模型配置引用，不含明文 Key |
| Model Call Log | 是 | 模型调用摘要 |
| Template | 是 | 内置或组织模板 |

---

## 31.3 不应持久化在前端的数据

以下数据不应长期保存在浏览器 localStorage：

- LLM API Key；
- 完整敏感业务上下文；
- 正式项目唯一数据源；
- 模型调用原始请求全文；
- 未经用户确认的敏感材料原文。

---

## 31.4 Storage Adapter 策略

Persistence Layer 应设计为可替换 adapter。

| Adapter | 用途 | 阶段 |
|---|---|---|
| MemoryStorage | 测试 / 单次运行 | P0 |
| FileStorage | 本地开源运行 | P0 / P1 |
| SQLiteStorage | 稳定本地部署 | P1 |
| PostgresStorage | SaaS / 多用户部署 | P2 |
| ObjectStorage | Execution Kit / 上传材料 | P2 |

---

## 31.5 Local Server Mode 默认存储

Local Server Mode 初始阶段建议使用 FileStorage 或 SQLiteStorage。

如果使用 FileStorage，建议结构：

```text
data/
├─ projects/
│  └─ {projectId}.json
├─ execution-kits/
│  └─ {projectId}/
│     └─ {kitId}/
├─ model-calls/
│  └─ {projectId}.jsonl
└─ uploads/
```

如果使用 SQLiteStorage，文件建议为：

```text
data/boundaryml.sqlite
```

---

## 31.6 Workflow Version 与 Snapshot

每次 Workflow 发生关键变更时，系统应维护 version。

关键变更包括：

- 新增 / 删除节点；
- 修改节点输入输出；
- 修改 Execution Mode；
- 修改 Review Gate；
- 应用 Diff；
- 修改 Context Pack 影响 Workflow；
- 修改 Artifact Contract。

生成 Execution Kit 时，必须绑定当时的 Workflow Snapshot。

---

## 31.7 Model Call Log 持久化

模型调用日志只保存摘要，不默认保存完整敏感输入。

至少保存：

- callId；
- projectId；
- purpose；
- modelName；
- provider；
- inputSummary；
- outputSummary；
- status；
- validationStatus；
- adoptedByUser；
- createdAt。

用户或部署方应可以配置日志等级：

```text
none / summary / detailed
```

---

# 32. LLM Access Layer & Model Config

## 32.1 章节目标

本章明确 LLM 配置和调用的架构边界。

BoundaryML 的模型调用必须可配置、可替换、可降级、可审计，并且不能泄露 API Key。

---

## 32.2 模型配置归属

LLM 配置属于 Server，不属于 Browser。

浏览器端可以展示模型状态，但不得读取完整 API Key。

前端可展示：

- Provider；
- Default Model；
- Planning Model；
- Prompt Model；
- Diff Model；
- Structured Output 是否启用；
- 当前 Model Mode：Mock / Real；
- 最近调用状态。

前端不得展示：

- 明文 API Key；
- 完整请求体中的敏感上下文；
- 未脱敏模型调用日志。

---

## 32.3 `.env.example` 要求

Server 必须支持 `.env.example`。

```env
BOUNDARYML_SERVER_PORT=8787
BOUNDARYML_API_BASE_URL=http://localhost:8787

BOUNDARYML_STORAGE_ADAPTER=file
BOUNDARYML_DATA_DIR=./data

BOUNDARYML_LLM_PROVIDER=openai-compatible
BOUNDARYML_LLM_API_KEY=
BOUNDARYML_LLM_BASE_URL=
BOUNDARYML_LLM_DEFAULT_MODEL=
BOUNDARYML_LLM_PLANNING_MODEL=
BOUNDARYML_LLM_PROMPT_MODEL=
BOUNDARYML_LLM_DIFF_MODEL=
BOUNDARYML_LLM_TIMEOUT_MS=60000
BOUNDARYML_LLM_ENABLE_STRUCTURED_OUTPUT=true
BOUNDARYML_LLM_LOG_LEVEL=summary

BOUNDARYML_ALLOW_MOCK_MODEL=true
```

---

## 32.4 Model Mode

BoundaryML 应支持两种模型模式。

| 模式 | 触发条件 | 行为 |
|---|---|---|
| Mock Model Mode | 未配置 API Key 或用户显式启用 mock | 使用本地 mock generators |
| Real LLM Mode | 配置有效 API Key 和 Base URL | 通过 Server 调用真实 LLM |

UI 必须显示当前模式。

```text
Model Mode: Mock
Model Mode: Real LLM
```

---

## 32.5 模型调用职责

LLM Access Layer 应支持以下调用类型：

| 调用类型 | 输入 | 输出 |
|---|---|---|
| Generate Workflow Draft | Project + Context Pack + Template | Workflow Draft |
| Recommend Execution Mode | Node + Context + Rules | Recommendation |
| Generate Prompt | Node Contract + Context | Prompt Draft |
| Generate Checklist | Review Gate + Artifact | Checklist Draft |
| Generate Diff | User Request + Current Workflow | Workflow Diff |
| Summarize Context Pack | Raw Context | Context Summary |

所有输出必须结构化，并经过规则校验。

---

## 32.6 结构化输出失败处理

如果模型返回的结构化结果无效，应按以下顺序处理：

1. 尝试修复结构化输出；
2. 重新请求一次模型；
3. 返回 `MODEL_OUTPUT_INVALID` 错误；
4. 允许用户切换为手动编辑或 Mock fallback。

MVP 阶段至少需要支持错误提示和 Mock fallback。

---

## 32.7 模型调用与敏感上下文

在发送 Context Pack 到模型前，系统应明确提示：

```text
Selected context may be sent to the configured LLM provider to generate workflow recommendations.
```

后续企业模式可支持：

- 上下文脱敏；
- 禁止发送原文，只发送摘要；
- 私有模型；
- 关闭详细日志。

---

# 33. Deployment Topologies

## 33.1 章节目标

本章定义 BoundaryML 的部署拓扑，确保产品设计不被单机 MVP 限制。

---

## 33.2 单机同服部署

第一阶段默认部署方式。

```text
Same Server
├─ Studio Static Files
├─ BoundaryML Server API
├─ File / SQLite Storage
└─ LLM Access via .env
```

访问方式：

```text
http://localhost:8787
```

其中：

- `/` 返回 Studio；
- `/api/*` 返回 Server API。

---

## 33.3 前后端分离部署

用于更真实的部署环境。

```text
Frontend Server
└─ BoundaryML Studio

Backend Server
└─ BoundaryML Server API
   ├─ Storage
   └─ LLM Access
```

访问方式示例：

```text
https://studio.boundaryml.dev
https://api.boundaryml.dev
```

要求：

- Studio 支持配置 API Base URL；
- Server 支持 CORS；
- Server 不依赖前端同域；
- 文件下载通过 API 完成；
- 模型 Key 只存在后端。

---

## 33.4 Docker Compose 部署

后续建议支持：

```text
docker-compose.yml
├─ studio
├─ server
└─ postgres / sqlite volume
```

MVP 不强制实现，但架构应预留。

---

## 33.5 SaaS 部署

SaaS 部署后续可能包含：

```text
CDN / Web App
API Gateway
BoundaryML Server
Postgres
Object Storage
Queue
LLM Provider
Monitoring / Audit
```

当前 PRD 不要求实现，但不要在架构上堵死。

---

# 34. Architecture Acceptance Criteria

## 34.1 章节目标

本章定义架构层补齐后的验收标准。

它不是要求当前立即实现完整 SaaS，而是确保 BoundaryML 不再被误解为纯前端工程。

---

## 34.2 PRD 层验收标准

1. PRD 明确 BoundaryML 由 Studio、Communication Layer、Server、Core Engine、Persistence Layer、LLM Access Layer 组成；
2. PRD 明确 Local Demo Mode 只是演示，不是正式持久化方案；
3. PRD 明确 Local Server Mode 是正式开源运行模式；
4. PRD 明确前后端即使部署在同一台服务器，也必须通过通信层通信；
5. PRD 明确前后端可部署在不同服务器；
6. PRD 明确 LLM API Key 不得进入浏览器；
7. PRD 明确持久化对象范围；
8. PRD 明确 API Base URL 和 Server API 边界；
9. PRD 明确 Server 不可用时的 fallback 行为；
10. PRD 明确后续 SaaS Mode 只作为预留，不作为当前强制开发范围。

---

## 34.3 工程实现验收标准

当进入架构骨架开发阶段时，至少应满足：

1. 存在前端 Studio 与 Server 的目录边界；
2. 前端通过 API Client 调用后端；
3. Server 提供 Project / Workflow / Context Pack / Diff / Execution Kit API；
4. Server 读取 `.env` 中的 LLM 配置；
5. API Key 不出现在前端 bundle；
6. 至少存在 MemoryStorage 和 FileStorage；
7. 项目数据可以保存并重启后读取；
8. 未配置 LLM 时使用 Mock Model fallback；
9. 配置 LLM 后可通过 Server 发起模型调用；
10. Execution Kit 由 Server 生成并绑定 Workflow Snapshot。

---

## 34.4 与现有前端 MVP 的关系

当前前端 MVP 不需要废弃，但必须重新定位：

> 当前版本是 Local Demo Mode 的雏形，不是 BoundaryML 的完整系统架构。

后续演进路径：

```text
当前前端 Demo
  ↓
抽离 Schema / Rules / Generators
  ↓
新增 Server + Storage + LLM Access
  ↓
前端改为 API Client 通信
  ↓
支持同服部署和前后端分离部署
```

---

# 35. Identity, Workspace & Data Isolation

## 35.1 章节目标

BoundaryML 即使在早期不实现完整用户 CRUD，也必须定义最小数据隔离模型。

原因是 BoundaryML 持久化的数据包含项目目标、组织上下文、审批流程、提示词、模型调用摘要、执行包等敏感资产。如果不同用户或不同组织的数据没有隔离，后续无法安全演进为 Local Server、Self-hosted 或 SaaS 形态。

---

## 35.2 核心原则

1. 所有正式 Project 数据必须归属于一个 Workspace。
2. 所有 API 请求必须在明确的 Workspace Scope 内执行。
3. 不同 Workspace 之间默认不可读取、不可搜索、不可引用、不可导出彼此数据。
4. User / Workspace 隔离不等于完整权限系统；即使 MVP 不做权限 CRUD，也必须保留数据归属字段。
5. Local Demo Mode 可以使用默认 Workspace，但必须明确标记为 Demo Scope。
6. Local Server Mode 应至少支持单用户 Workspace。
7. Distributed Self-hosted 和 SaaS Mode 必须支持多 Workspace 隔离。

---

## 35.3 最小身份模型

MVP 阶段至少定义以下概念：

| 概念 | 说明 |
|---|---|
| User | 操作 BoundaryML 的个体身份，可以先是本地默认用户 |
| Workspace | 数据隔离边界，一个 Workspace 下包含多个 Project |
| Project Owner | 创建 Project 的用户或 Workspace |
| Request Context | 每次 API 请求携带的 user/workspace 上下文 |
| Demo Workspace | Local Demo Mode 使用的默认隔离空间 |

---

## 35.4 数据归属要求

以下对象必须带有 `workspace_id`：

- Project
- Context Pack
- Workflow
- Node
- Edge
- Review Gate
- Artifact Contract
- Prompt Asset
- Checklist Asset
- Artifact Template
- Workflow Diff
- Validation Result
- Execution Kit
- Model Call Log
- Template

推荐字段：

```json
{
  "workspace_id": "workspace_default",
  "created_by": "user_default",
  "updated_by": "user_default"
}
```

如果暂时不做用户系统，也应使用：

{
  "workspace_id": "local_default",
  "created_by": "local_user"
}

## 35.5 API Scope 要求

所有 Project 相关 API 都必须基于 Workspace Scope 查询。

例如：

GET /api/projects

实际语义应是：

GET projects visible to current workspace

禁止出现无 scope 的全局读取：

GET all projects from all users

后续如果使用显式路径，也可以扩展为：

GET /api/workspaces/:workspaceId/projects
POST /api/workspaces/:workspaceId/projects

## 35.6 Storage 隔离要求

FileStorage 场景下，建议目录结构为：

data/
└─ workspaces/
   └─ {workspaceId}/
      ├─ projects/
      ├─ execution-kits/
      ├─ model-calls/
      └─ uploads/

SQLite / Postgres 场景下，核心表或集合必须保留 workspace_id 字段。

## 35.7 Demo Mode 隔离

Local Demo Mode 可以默认使用：

workspace_id = demo_workspace
user_id = demo_user

但 UI 和 README 必须说明：

Demo data is stored locally and belongs to the demo workspace only.

## 35.8 当前阶段不做的内容

MVP 可以暂缓：

- 完整注册 / 登录；
- 用户邀请；
- 角色权限配置；
- 多人协作；
- 组织计费；
- 细粒度 RBAC。

但不得暂缓：

- workspace_id；
- created_by；
- API scope；
- storage namespace；
- 不同 Workspace 数据默认隔离。

---

# 36. LLM Output Contract & JSON Schema Policy

## 36.1 章节目标

BoundaryML 的初始蓝图由 LLM 生成，但 LLM 输出不能是自由文本，也不能是 Markdown 描述。

生成初始蓝图、Workflow Diff、Prompt Asset、Checklist Asset 等核心对象时，LLM 必须输出符合 BoundaryML Spec 的标准 JSON。

后端必须先完成 JSON 解析、Schema 校验、规范化和 Boundary Rules 校验，才允许存储到 Persistence Layer，并返回给 Studio 渲染。

---

## 36.2 核心原则

1. LLM 生成初始蓝图必须输出 JSON。
2. JSON 必须符合 BoundaryML Workflow Draft Schema。
3. 不允许将自然语言 Workflow 描述直接存储为正式 Workflow。
4. 不允许前端自行解释 LLM 文本并生成正式 Workflow。
5. Server 是 LLM 输出解析、校验、规范化和存储的唯一入口。
6. 未通过 Schema 校验的模型输出不得进入正式 Project 数据。
7. 未通过 Boundary Rules 校验的 Workflow 可以保存为 Draft，但不得进入 Final。

---

## 36.3 标准输出格式

LLM 生成初始蓝图时，应输出以下 JSON Envelope：

```json
{
  "boundaryml_version": "0.1",
  "output_type": "workflow_draft",
  "project": {
    "id": "project_001",
    "name": "AI SaaS Feature MVP",
    "goal": "Plan and deliver an AI-assisted SaaS feature.",
    "project_type": "ai_saas_feature",
    "risk_level": "medium",
    "current_stage": "planning",
    "output_language": "en"
  },
  "context_pack": {
    "status": "summarized",
    "roles": [],
    "approval_processes": [],
    "tool_stack": [],
    "risk_constraints": [],
    "source_materials": []
  },
  "workflow": {
    "id": "workflow_main",
    "name": "Main Delivery Workflow",
    "status": "draft",
    "version": 1,
    "phases": [],
    "nodes": [],
    "edges": []
  },
  "assets": {
    "prompts": [],
    "checklists": [],
    "artifact_templates": []
  },
  "recommendations": [],
  "validation_hints": []
}
```
## 36.4 Canonical Field Naming

BoundaryML 的持久化 JSON 和 Server API 返回对象应采用统一字段命名。

建议使用 snake_case，与 BoundaryML Spec 保持一致：

{
  "risk_level": "medium",
  "execution_mode": "ai_draft_human_review",
  "human_owner_role": "Product Manager",
  "review_gate": {}
}

前端可以在 UI 层映射为 camelCase，但不得改变 Server 与 Persistence Layer 的标准协议。

---

## 36.5 Workflow Draft JSON 必填内容

初始蓝图 JSON 至少必须包含：

boundaryml_version
output_type
project
workflow
workflow.phases
workflow.nodes
workflow.edges

每个 Node 至少必须包含：

id
name
phase_id
goal
risk_level
execution_mode
human_owner_role
ai_role
inputs
outputs
artifact_contract
review_gate

如果节点暂时缺少某些字段，模型必须显式标记为 missing 或 needs_human_confirmation，不得编造。

---

## 36.6 Server 处理流程

LLM 输出必须经过以下流程：

LLM Raw Output
  ↓
JSON Parse
  ↓
Schema Validation
  ↓
Normalization
  ↓
Boundary Rules Validation
  ↓
Persist as Workflow Draft
  ↓
Return to Studio

任何一步失败，都不得直接写入正式 Workflow。

---

## 36.7 Schema Validation 结果

Schema 校验失败时，Server 返回：

{
  "ok": false,
  "error": {
    "code": "MODEL_OUTPUT_SCHEMA_INVALID",
    "message": "The model output does not match BoundaryML Workflow Draft Schema.",
    "details": []
  }
}

如果 JSON 解析失败，返回：

{
  "ok": false,
  "error": {
    "code": "MODEL_OUTPUT_JSON_PARSE_FAILED",
    "message": "The model did not return valid JSON."
  }
}

如果规则校验失败，但 Schema 有效，可以保存为 Draft，并返回 Validation Results。

---

## 36.8 JSON Schema / Zod Schema 要求

工程实现中必须提供机器可校验的 Schema。

建议放在：

packages/schema/

至少包含：

Project Schema
Context Pack Schema
Workflow Schema
Phase Schema
Node Schema
Edge Schema
Review Gate Schema
Artifact Contract Schema
Prompt Asset Schema
Checklist Asset Schema
Workflow Diff Schema
Execution Kit Schema
36.9 LLM Prompt 约束

调用规划模型生成初始蓝图时，系统 Prompt 必须明确：

Return only valid JSON.
Do not return Markdown.
Do not include explanations outside JSON.
The JSON must match BoundaryML Workflow Draft Schema.
If information is missing, use explicit missing fields instead of inventing facts.

---

## 36.10 Raw Output 保存策略

默认不保存完整 LLM raw output。

系统可根据日志等级保存：

Log Level	保存内容
none	不保存模型输出
summary	保存输入摘要、输出摘要、校验状态
detailed	保存完整 raw output，但需要明确风险提示

---

## 36.11 前端渲染要求

Studio 前端只能渲染 Server 返回的已解析 Workflow JSON。

禁止前端直接渲染 LLM raw text。

如果 Server 返回 Draft Workflow，则 UI 应显示：

Workflow Draft generated by model. Please review before marking as final.

---

