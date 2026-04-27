# BoundaryML PRD v0.1

> 文档定位：本文用于定义 BoundaryML 的产品边界、核心工作流与关键功能要求。本文不替开发定义数据库表结构，不强行规定技术实现方式；重点说明产品目标、用户行为、输入输出、页面能力、交互逻辑与验收口径。

---

## 0. 产品一句话定义

BoundaryML 是一个面向 AI 转型项目的 **可视化人机协作边界编排系统**。

它帮助团队在项目启动和落地前，明确：

- 项目从立项到交付有哪些节点；
- 每个节点需要什么输入、产出什么交付物；
- 每个节点应由人工、AI，还是人工 + AI 执行；
- AI 执行节点需要什么提示词、上下文和验收规则；
- 人工审核节点应如何确认 AI 产物是否可以进入下游。

BoundaryML 不是项目管理工具本身，而是项目执行前的 **人机分工蓝图层**。

---

## 1. 背景与问题

传统软件公司在 AI 转型过程中，常见问题不是“是否使用 AI”，而是：

1. 不知道项目全流程中哪些节点适合 AI 介入；
2. 不知道哪些节点必须人工兜底；
3. 不知道 AI 输出如何进入正式项目流程；
4. 不知道 AI 执行节点应该配套什么提示词、上下文和验收标准；
5. 不知道如何把人机分界结果同步到开发、测试、项目管理和审批流程中。

结果是 AI 使用碎片化，团队成员各自为战：产品用 AI 写 PRD，开发用 AI 写代码，测试用 AI 写用例，但整个项目没有一张全局的人机协作边界图。

BoundaryML 要解决的是这个上游问题。

---

## 2. 产品目标

BoundaryML 的目标不是让 AI 尽可能多地接管项目，而是让 AI 参与项目时变得 **可规划、可审核、可交接、可追踪**。

### 2.1 核心目标

- 帮助用户快速生成一个项目全生命周期工作流；
- 支持用户为每个节点定义输入、输出、执行方式和责任边界；
- 支持系统根据项目背景、组织角色、风险等级和审批流程，推荐人机协作模式；
- 支持为 AI 执行节点生成提示词、上下文包和人工审核清单；
- 支持将最终蓝图导出为任务清单、提示词包、审核清单和交付物要求。

### 2.2 非目标

BoundaryML 当前阶段不做以下事情：

- 不替代 Jira、飞书项目、Linear、禅道等项目管理工具；
- 不直接替代 Cursor、Codex、Claude Code 等 AI Coding 工具；
- 不作为通用流程图工具；
- 不直接执行生产环境操作；
- 不以“AI 自动完成整个项目”为核心卖点。

---

## 3. 核心用户与使用场景

### 3.1 核心用户

| 用户角色 | 主要诉求 |
|---|---|
| 产品经理 | 将项目从目标拆成清晰流程，并明确哪些环节可由 AI 辅助 |
| 项目经理 | 明确任务流、责任人、审核点和交付物 |
| 技术负责人 | 判断哪些工程节点可以交给 AI，哪些必须人工把关 |
| 测试负责人 | 明确测试用例、验收标准、回归范围是否可以 AI 生成 |
| 企业 AI 转型负责人 | 沉淀组织级 AI 使用规范和人机协作模板 |
| 咨询顾问 / 交付团队 | 为客户生成 AI 转型项目落地蓝图 |

### 3.2 初始使用场景

BoundaryML 的第一阶段场景聚焦于：

> AI 转型中的软件项目落地规划。

典型项目包括：

- AI SaaS 功能从 0 到 1 开发；
- 传统系统 AI 化改造；
- 内部工具接入 AI 能力；
- 使用 AI Coding 工具重构遗留系统；
- 建立企业内部 AI 项目交付规范。

---

## 4. 核心概念

### 4.1 Project 项目

Project 是 BoundaryML 的顶层对象，代表一个待规划、待交付或待改造的项目。

项目应至少包含：

- 项目目标；
- 项目类型；
- 目标交付物；
- 风险等级；
- 期望使用 AI 的范围；
- 当前项目阶段。

### 4.2 Context Pack 项目上下文包

Context Pack 是 BoundaryML 生成工作流和判断人机分界时使用的背景信息集合。

它不是必须一次性完整录入，而是可以逐步补充。

Context Pack 包括：

| 上下文类型 | 是否必填 | 说明 |
|---|---:|---|
| 项目目标 | 必填 | BoundaryML 的最小启动输入 |
| 项目类型 | 建议必填 | 用于匹配项目模板，例如 SaaS、内部工具、遗留系统改造 |
| 目标交付物 | 建议必填 | 例如 PRD、原型、代码、测试报告、上线方案 |
| 组织角色 | 可选但强烈建议 | 用于判断每个节点的责任归属 |
| 现有审批流程 | 可选但强烈建议 | 用于生成 Review Gate 和 Human Approval 节点 |
| 工具栈 | 可选 | 用于生成可导出的任务格式或 AI 执行提示词 |
| 风险约束 | 可选 | 例如法务、安全、生产发布、客户数据等约束 |
| 历史流程模板 | 可选 | 用于复用企业既有交付方法 |

### 4.3 Workflow 工作流

Workflow 是项目从启动到交付的节点图。

它应该表达：

- 节点顺序；
- 阶段分组；
- 上下游依赖；
- 审核与回退路径；
- 各节点的人机执行模式。

### 4.4 Node 节点

Node 是 BoundaryML 中最小的可治理工作单元。

每个节点至少需要定义：

- 节点名称；
- 节点目标；
- 输入；
- 输出；
- 执行模式；
- 人工责任角色；
- AI 角色；
- 审核规则；
- 交付物要求。

### 4.5 Execution Mode 执行模式

Execution Mode 用于定义某个节点的人机协作方式。

第一阶段内置 5 种模式：

| 执行模式 | 含义 | 示例场景 |
|---|---|---|
| Human Only | 仅人工执行 | 最终上线审批、法务确认、客户合同确认 |
| AI Draft + Human Review | AI 生成初稿，人工审核 | PRD 初稿、测试用例初稿、文档初稿 |
| Human Lead + AI Assist | 人主导，AI 辅助 | 架构设计、需求分析、风险评估 |
| AI Execute + Human Approval | AI 执行，人工批准后流转 | 代码生成、任务拆解、报告生成 |
| AI Autonomous | AI 在约束内自动执行 | 低风险分类、格式整理、状态摘要 |

### 4.6 Artifact 交付物

Artifact 是节点完成的证明。

示例：

- PRD；
- 原型说明；
- 技术方案；
- API 契约；
- 测试用例；
- Pull Request；
- 测试报告；
- 上线检查表；
- 复盘报告。

### 4.7 Review Gate 审核门

Review Gate 是节点进入下游之前必须经过的审核规则。

它用于防止 AI 产物在未经过人工确认的情况下进入关键流程。

Review Gate 可以包括：

- 审核人；
- 审核标准；
- 通过条件；
- 退回条件；
- 需要补充的材料；
- 是否允许 AI 自动修订后再次提交。

---

## 5. 模型接入层 Model Access Layer

BoundaryML 的核心蓝图不是由用户手工从零绘制出来的，而是由 LLM 基于项目输入、组织上下文、审批约束和模板规则生成初始人机分工蓝图。

因此，BoundaryML 必须定义一个明确的模型接入层，用于承接以下能力：

- 根据项目目标生成初始 Workflow；
- 根据 Context Pack 判断节点的人机执行模式；
- 为节点生成输入、输出、Artifact Contract 和 Review Gate；
- 为 AI 参与节点生成 Prompt、上下文要求、输出格式和验收标准；
- 根据用户对话修改请求生成 Workflow Diff；
- 解释为什么某个节点建议由 AI、人工或人机协作完成。

模型接入层不是一个隐藏的“调用大模型工具函数”，而是 BoundaryML 的核心产品能力之一。

---

### 5.1 模型接入层定位

模型接入层负责将用户输入转化为结构化的人机协作蓝图。

它的输入是：

- Project 基础信息；
- Context Pack；
- Workflow Template；
- Boundary Rules；
- 用户自然语言修改请求；
- 已有 Workflow Spec。

它的输出是：

- Workflow Draft；
- Node Contract；
- Execution Mode Recommendation；
- Review Gate Recommendation；
- Artifact Contract；
- Prompt Draft；
- Checklist Draft；
- Workflow Diff；
- Recommendation Explanation。

模型接入层不直接决定最终正式蓝图。

所有关键输出都应进入用户可查看、可编辑、可确认的产品流程。

---

### 5.2 模型接入层的核心原则

#### 5.2.1 模型负责生成建议，不负责最终拍板

BoundaryML 中的 LLM 输出默认是建议状态，而不是最终状态。

例如：

- LLM 可以建议某个节点采用 `AI Draft + Human Review`；
- LLM 可以建议某个节点增加 Review Gate；
- LLM 可以建议补充某个 Artifact Contract；
- LLM 可以生成 Prompt Draft。

但最终是否采用，需要用户确认，或由系统规则判断是否允许自动接受。

#### 5.2.2 规则层优先于模型自由判断

模型不能绕过 Boundary Rules。

例如：

- 高风险节点默认不得直接设置为 `AI Autonomous`；
- `Human Only` 节点不得生成 AI 执行提示词；
- 生产发布、法务、安全、客户数据相关节点必须有 Review Gate；
- 没有输出格式和验收标准的 AI 节点不得进入 Final 状态。

LLM 生成结果需要经过规则校验。校验不通过时，系统应提示原因并要求修正。

#### 5.2.3 模型输出必须结构化

模型输出不能只是一段自然语言说明。

BoundaryML 的模型输出应尽量进入结构化对象，例如：

- Workflow Spec；
- Node Contract；
- Execution Asset；
- Review Gate；
- Artifact Contract；
- Diff Patch；
- Risk Warning。

结构化输出是后续可视化、Diff、导出、校验和任务生成的基础。

#### 5.2.4 模型建议必须可解释

当系统推荐某个执行模式时，应展示简短原因。

例如：

> 该节点涉及客户数据处理，风险等级较高，因此建议使用 Human Lead + AI Assist，并增加安全负责人 Review Gate。

解释不是为了展示模型推理过程，而是为了让用户理解产品决策依据。

---

### 5.3 模型调用场景

第一阶段至少需要支持以下模型调用场景。

| 场景 | 触发时机 | 输入 | 输出 |
|---|---|---|---|
| 初始蓝图生成 | 创建项目后 | Project + Context Pack + Template | Workflow Draft |
| 节点分界推荐 | 生成或编辑节点时 | Node + Context Pack + Rules | Execution Mode Recommendation |
| 节点契约生成 | 节点创建后 | Node Goal + Upstream/Downstream | Input / Output / Artifact Contract |
| Review Gate 生成 | 节点执行模式变化时 | Node + Risk + Organization Context | Review Gate Draft |
| Prompt 生成 | 节点包含 AI 执行时 | Node Contract + Context Required | Prompt Draft |
| Checklist 生成 | 节点需要人工审核时 | Artifact + Acceptance Criteria | Review Checklist |
| 对话式修改 | 用户提出自然语言修改 | User Request + Current Workflow | Workflow Diff |
| 风险解释 | 用户查看推荐原因 | Node + Rules + Context | Explanation |
| 执行包生成 | 用户生成 Execution Kit | Final Workflow | Prompt Pack / Checklist Pack / Task Plan |

---

### 5.4 模型供应商与接入方式

BoundaryML 应支持可替换的模型供应商接入方式。

第一阶段不应把产品能力绑定到单一模型。

产品上应抽象为：

- 默认模型；
- 备用模型；
- 结构化输出模型；
- 长上下文模型；
- 低成本批处理模型；
- 高质量规划模型。

不同场景可以使用不同模型策略。

| 场景 | 模型策略 |
|---|---|
| 初始蓝图生成 | 优先使用高质量规划模型 |
| Prompt Pack 批量生成 | 可使用成本更低的批处理模型 |
| 对话式修改 | 使用响应速度较快的模型 |
| 长文档 Context Pack 摘要 | 使用长上下文模型 |
| 结构化 Diff 生成 | 使用结构化输出稳定的模型 |

产品配置上，应至少支持：

- API Key 配置；
- Base URL 配置；
- Model Name 配置；
- 调用超时配置；
- 最大上下文长度配置；
- 是否启用 JSON / structured output 模式；
- 是否保存模型调用日志摘要。

实现上可以优先支持 OpenAI-compatible API 形式，以降低接入不同模型供应商的成本。

---

### 5.5 模型接入配置页

BoundaryML 应提供模型接入配置能力。

MVP 阶段可以先以 `.env.example` 和配置文件方式支持，后续 Studio 中提供可视化配置页。

模型配置页应包含：

- 模型供应商名称；
- API Key；
- Base URL；
- 默认模型；
- 用于规划的模型；
- 用于生成 Prompt 的模型；
- 用于结构化 Diff 的模型；
- 是否启用调用日志；
- 测试连接按钮；
- 最近一次调用状态。

配置页不应暴露过多工程细节，但必须让用户知道当前蓝图由哪个模型能力生成。

---

### 5.6 模型调用日志与可追踪性

为了让 BoundaryML 的结果可审计，系统应记录必要的模型调用摘要。

每次模型调用至少应记录：

- 调用场景；
- 使用的模型配置；
- 输入摘要；
- 输出摘要；
- 生成时间；
- 是否通过规则校验；
- 是否被用户采纳；
- 如果被拒绝，用户是否手动修改。

注意：模型调用日志不等于完整保存用户敏感输入。

对于企业场景，系统应允许关闭详细日志，仅保留摘要与状态。

---

### 5.7 模型输出状态

模型生成的内容需要有状态标记。

| 状态 | 含义 |
|---|---|
| Draft | 模型生成，尚未人工确认 |
| Reviewed | 已被人工查看或修改 |
| Applied | 已应用到正式 Workflow |
| Rejected | 被用户拒绝 |
| Outdated | 上游输入变化后，该结果可能不再可信 |
| Failed Validation | 未通过规则层校验 |

这些状态应出现在 Workflow、Node、Prompt、Checklist 和 Execution Kit 相关功能中。

---

### 5.8 模型失败与降级处理

模型调用失败时，BoundaryML 不应中断整个产品流程。

应提供降级路径：

- 模型生成失败时，允许用户手动创建 Workflow；
- Prompt 生成失败时，允许用户手写 Prompt；
- Diff 生成失败时，提示用户改用手动拖拽编辑；
- 模型输出不合法时，展示校验错误并允许重新生成；
- API Key 未配置时，允许用户使用模板和手动编辑能力。

BoundaryML 的产品可用性不能完全依赖模型调用成功。

---

### 5.9 MVP 阶段模型接入范围

MVP 阶段必须支持：

- 基于 Project + Context Pack 生成初始 Workflow Draft；
- 为节点推荐 Execution Mode；
- 为 AI 节点生成 Prompt Draft；
- 为人工审核节点生成 Checklist Draft；
- 根据自然语言修改请求生成 Workflow Diff；
- 对模型输出进行规则校验；
- 在 `.env.example` 中提供模型配置项。

MVP 阶段可以暂缓：

- 多模型自动路由；
- 企业级模型调用审计后台；
- 私有模型部署；
- 模型调用成本看板；
- 模型质量评估体系；
- 自动从历史项目中学习组织流程偏好。

---

### 5.10 `.env.example` 配置要求

MVP 阶段应提供 `.env.example`，至少包含：

```env
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
```

这些配置只定义模型接入的产品要求，不强制具体代码实现方式。

---

## 6. 核心产品判断

本节回答当前 README 尚未定义的几个关键产品问题。

---

### 6.1 BoundaryML 的初始输入是否需要组织架构和现有审批流程？

结论：**需要支持，但不应作为强制启动条件。**

BoundaryML 的最小启动输入应该是：

1. 项目目标；
2. 项目类型；
3. 目标交付物；
4. 风险等级。

在没有组织架构和审批流程的情况下，系统仍然应该可以生成一版通用的人机协作蓝图。

但如果用户提供组织架构和现有审批流程，BoundaryML 应该能生成更贴近真实执行的蓝图。

#### 5.1.1 为什么组织架构重要？

因为人机分界不是只由任务类型决定，也由组织中的责任角色决定。

例如：

- PRD 节点可能由产品经理负责；
- 架构设计节点可能由技术负责人负责；
- 测试策略节点可能由 QA Lead 负责；
- 上线审批节点可能由项目经理或运维负责人负责；
- 涉及客户数据的节点可能需要安全负责人审核。

如果没有组织角色信息，系统只能生成“推荐角色”；如果有组织角色信息，系统可以生成“真实责任人或责任岗位”。

#### 5.1.2 为什么审批流程重要？

因为很多 AI 节点能不能进入下游，不取决于 AI 是否完成，而取决于组织是否允许它进入下游。

例如：

- AI 可以生成技术方案，但最终架构必须由架构师确认；
- AI 可以生成测试用例，但测试负责人必须确认覆盖范围；
- AI 可以生成代码，但必须经过代码 Review；
- AI 可以生成上线检查表，但上线决策必须人工批准。

因此，审批流程应作为 Review Gate 生成的重要依据。

#### 5.1.3 产品要求

BoundaryML 创建项目时应支持两种模式：

| 模式 | 说明 |
|---|---|
| Quick Start | 只输入项目目标、项目类型、交付物和风险等级，快速生成通用蓝图 |
| Organization-Aware Setup | 在 Quick Start 基础上补充组织角色、审批流程、工具栈和风险约束，生成更贴合企业实际的蓝图 |

用户不应因为暂时没有组织架构而无法开始。

但系统应明确提示：

> 当前蓝图基于通用角色生成。补充组织角色和审批流程后，可生成更准确的责任边界与审核节点。

---

### 6.2 可视化界面修改方式：对话修改还是拖拽交互？

结论：**两者都需要，但职责不同。**

BoundaryML 的可视化界面不应该只依赖对话修改，也不应该只依赖拖拽修改。

最合理的交互模式是：

> 拖拽用于精确编辑；对话用于批量生成、批量调整和结构化重构。

#### 5.2.1 拖拽交互适合解决什么问题？

拖拽交互适合精确、局部、确定性的操作。

例如：

- 新增节点；
- 删除节点；
- 调整节点顺序；
- 修改节点连线；
- 将节点移动到不同阶段；
- 手动设置执行模式；
- 手动调整 Review Gate；
- 修改节点输入输出。

拖拽是可视化编排的基础能力，不能省略。

如果没有拖拽，BoundaryML 会更像一个 AI Chat 工具，而不是可视化编排系统。

#### 5.2.2 对话修改适合解决什么问题？

对话修改适合模糊、批量、结构化重构类操作。

例如：

- “把所有高风险节点都改成人工审核后才能进入下游”；
- “给开发阶段补充测试用例生成和代码 Review 两个节点”；
- “把当前流程改成适合外包团队交付的版本”；
- “把所有 AI Execute 节点补上提示词和验收清单”；
- “根据我们公司的审批流程重排上线前节点”；
- “生成一个更保守的人机分工版本”。

对话修改的价值不是替代鼠标操作，而是降低复杂流程调整的成本。

#### 5.2.3 对话修改必须有 Diff 与确认机制

AI 不能直接静默修改正式工作流。

所有通过对话产生的修改，都应该进入变更预览状态。

用户应看到：

- 新增了哪些节点；
- 删除了哪些节点；
- 修改了哪些节点；
- 哪些执行模式发生变化；
- 哪些 Review Gate 被新增或删除；
- 哪些节点的输入输出被改动；
- 哪些改动可能影响下游任务和提示词。

用户确认后，修改才进入正式工作流。

#### 5.2.4 产品要求

BoundaryML Studio 应提供三种编辑方式：

| 编辑方式 | 用途 |
|---|---|
| Canvas Direct Edit | 通过拖拽、连线、节点面板直接编辑 |
| AI Assisted Edit | 通过对话提出修改意图，系统生成变更建议 |
| Diff Review & Apply | 对 AI 修改进行差异预览，用户确认后应用 |

最终原则：

> 可视化界面负责确定性控制，对话负责复杂修改建议，Diff 负责防止 AI 越权。

---

### 6.3 AI 执行节点的提示词在哪里查看？

结论：**提示词必须作为节点的 Execution Asset 可见、可编辑、可版本化、可导出。**

BoundaryML 不能只在后台隐式生成提示词。

如果用户看不到提示词，就无法判断 AI 节点到底会如何执行，也无法审查上下文是否充分。

#### 5.3.1 提示词的产品位置

AI 节点的提示词应在三个位置可查看：

| 位置 | 说明 |
|---|---|
| 节点详情面板 | 查看当前节点的提示词、上下文、输出格式和验收规则 |
| Execution Assets 页面 | 集中查看整个项目所有 AI 节点产生的提示词、checklist 和 artifact template |
| 导出结果页 | 在导出任务包时查看最终会交给 AI 工具使用的提示词文件 |

#### 5.3.2 节点详情面板中的提示词结构

当用户点击一个 AI 参与节点时，节点详情面板应包含 `Execution Assets` 区域。

其中至少包括：

- AI Role：该节点中 AI 的职责；
- Prompt：AI 执行提示词；
- Context Required：执行该提示词需要的上下文材料；
- Output Format：AI 必须按什么结构输出；
- Acceptance Criteria：人工审核产物时的验收标准；
- Failure Handling：不合格时如何退回、重试或改为人工执行；
- Export Target：提示词计划导出到哪里，例如 Markdown、GitHub Issue、AI Coding 工具输入文件。

#### 5.3.3 提示词生成时机

提示词可以在两个阶段生成：

1. 节点配置阶段：用户配置节点时，系统为该节点生成默认提示词；
2. 执行包生成阶段：用户点击 “Generate Execution Kit” 时，系统基于最终工作流生成正式提示词包。

两者的区别：

| 阶段 | 提示词状态 |
|---|---|
| 节点配置阶段 | Draft Prompt，用于预览和编辑 |
| 执行包生成阶段 | Final Prompt，用于导出和执行 |

#### 5.3.4 提示词修改规则

用户应允许直接修改提示词，但系统需要提醒：

- 修改提示词可能影响节点输出；
- 如果节点输入输出发生变化，提示词需要重新生成或重新校验；
- 如果 Review Gate 发生变化，提示词中的验收标准也应同步更新；
- 如果组织审批流程发生变化，提示词中的交接对象和审核角色也应同步更新。

#### 5.3.5 产品要求

BoundaryML 应支持：

- 对每个 AI 节点生成可查看提示词；
- 对提示词进行人工编辑；
- 提示词与节点输入输出、Review Gate、Artifact Contract 关联；
- 生成项目级 Prompt Pack；
- 导出 Prompt Pack；
- 标记提示词状态：Draft、Reviewed、Final、Outdated。

---

## 7. 核心工作流

### 7.1 创建项目

用户进入 BoundaryML 后，创建一个新项目。

需要输入：

- 项目名称；
- 项目目标；
- 项目类型；
- 目标交付物；
- 风险等级；
- 是否已有组织审批流程；
- 是否已有项目模板或历史流程。

系统输出：

- 项目基础信息；
- 推荐流程模板；
- 建议补充的上下文信息。

---

### 7.2 补充 Context Pack

用户可以选择补充：

- 团队角色；
- 审批流程；
- 工具栈；
- 风险限制；
- 交付物规范；
- 历史流程文档。

系统输出：

- 结构化上下文摘要；
- 组织角色映射建议；
- 审核门生成依据；
- 风险约束提示。

---

### 7.3 生成初始工作流

系统通过模型接入层，根据项目目标、项目类型、Context Pack、Workflow Template 和 Boundary Rules，生成初始 workflow。

初始 workflow 应包含：

- 阶段分组；
- 节点；
- 节点连线；
- 默认执行模式；
- 推荐责任角色；
- 默认 Review Gate；
- 默认 Artifact Contract。

系统应明确标注哪些内容是：

- 用户明确提供；
- 模型生成建议；
- 规则层校验结果；
- 需要人工确认。

模型生成的初始 workflow 默认应处于 Draft 状态，用户确认后才进入正式编辑状态。

---

### 7.4 编辑工作流

用户可以通过两种方式修改工作流：

1. 在 Canvas 上直接拖拽修改；
2. 通过 AI 对话提出修改意图。

AI 对话修改必须进入 Diff Review，不得直接覆盖正式 workflow。

---

### 7.5 配置节点

用户点击节点后，可以配置：

- 节点目标；
- 输入；
- 输出；
- 执行模式；
- 人工责任角色；
- AI 角色；
- 审核规则；
- 交付物格式；
- 提示词；
- 验收清单。

---

### 7.6 生成 Execution Kit

当 workflow 被确认后，用户可以生成 Execution Kit。

Execution Kit 是 BoundaryML 的核心产出包。

它包括：

- 任务清单；
- Prompt Pack；
- Human Review Checklist；
- Artifact Templates；
- Responsibility Map；
- Risk Report；
- Workflow Spec。

---

### 7.7 导出与交接

BoundaryML 应支持将 Execution Kit 导出为：

- Markdown 文件；
- JSON / YAML spec；
- GitHub Issues；
- AI Coding 工具提示词包；
- 项目启动文档；
- 人工审核清单。

第一阶段建议先支持 Markdown、YAML 和本地文件导出。

---

## 8. 页面与功能需求

### 8.1 项目列表页

功能要求：

- 查看已有项目；
- 创建新项目；
- 查看项目状态；
- 查看最近更新时间；
- 查看项目风险等级；
- 查看是否已生成 Execution Kit。

---

### 8.2 项目创建页

功能要求：

- 输入项目目标；
- 选择项目类型；
- 选择目标交付物；
- 选择风险等级；
- 选择 Quick Start 或 Organization-Aware Setup；
- 可跳过高级上下文配置。

---

### 8.3 Context Pack 配置页

功能要求：

- 录入组织角色；
- 录入审批流程；
- 录入工具栈；
- 录入风险约束；
- 上传或粘贴历史流程材料；
- 查看系统生成的上下文摘要。

---

### 8.4 Workflow Canvas 页面

功能要求：

- 展示项目全流程；
- 支持阶段分组；
- 支持节点拖拽；
- 支持节点连线；
- 支持节点状态标记；
- 支持按执行模式着色或筛选；
- 支持查看高风险节点；
- 支持通过对话生成变更建议；
- 支持查看 Diff 并应用修改。

---

### 8.5 节点详情面板

功能要求：

- 查看和编辑节点名称；
- 查看和编辑节点目标；
- 查看和编辑输入；
- 查看和编辑输出；
- 设置执行模式；
- 设置人工责任角色；
- 设置 AI 角色；
- 设置 Review Gate；
- 设置 Artifact Contract；
- 查看和编辑 Prompt；
- 查看和编辑 Acceptance Criteria；
- 查看节点上下游依赖。

---

### 8.6 AI 修改对话面板

功能要求：

- 用户可以用自然语言提出流程修改要求；
- 系统将修改转成结构化变更；
- 系统展示变更预览；
- 用户可以逐条接受或拒绝；
- 用户确认后才应用到正式 workflow；
- 系统保留变更记录。

---

### 8.7 Execution Assets 页面

功能要求：

- 集中展示所有 AI 节点的提示词；
- 展示所有人工审核 checklist；
- 展示所有 artifact templates；
- 标记 Draft、Reviewed、Final、Outdated 状态；
- 支持按阶段、节点、执行模式筛选；
- 支持导出 Prompt Pack 和 Checklist Pack；
- 展示提示词由哪个模型配置生成；
- 展示提示词是否已因节点变更而过期。

---

### 8.8 Export 页面

功能要求：

- 选择导出内容；
- 预览导出结果；
- 导出 Markdown；
- 导出 YAML / JSON；
- 导出任务清单；
- 导出 Prompt Pack；
- 导出 Review Checklist；
- 导出 Artifact Templates。

---

## 9. 关键规则

### 9.1 AI 不得静默修改正式工作流

任何 AI 生成的修改必须经过用户确认。

### 9.2 高风险节点默认需要 Review Gate

高风险节点包括但不限于：

- 生产发布；
- 法务审核；
- 安全策略；
- 客户数据处理；
- 付费和结算；
- 对外承诺；
- 关键架构决策。

### 9.3 Human Only 节点不得生成 AI 执行提示词

Human Only 节点可以生成审核说明或人工操作 checklist，但不应生成让 AI 直接执行该节点的提示词。

### 9.4 AI Execute 节点必须有输出格式和验收标准

如果一个节点允许 AI 执行，则必须定义：

- 输入上下文；
- 输出格式；
- 交付物；
- 验收标准；
- 失败处理方式。

### 9.5 节点输入输出变化后，相关提示词应标记为 Outdated

如果用户修改节点输入、输出、Review Gate 或 Artifact Contract，系统应提醒对应 Prompt 可能需要更新。

---

## 10. 数据埋点需求

### 10.1 项目创建相关

| 事件 | 说明 |
|---|---|
| project_created | 用户创建项目 |
| project_type_selected | 用户选择项目类型 |
| setup_mode_selected | 用户选择 Quick Start 或 Organization-Aware Setup |
| context_pack_completed | 用户完成上下文配置 |

### 10.2 Workflow 相关

| 事件 | 说明 |
|---|---|
| workflow_generated | 系统生成初始 workflow |
| workflow_node_added | 用户新增节点 |
| workflow_node_deleted | 用户删除节点 |
| workflow_node_reordered | 用户调整节点顺序 |
| workflow_connection_changed | 用户修改节点连线 |
| execution_mode_changed | 用户修改节点执行模式 |

### 10.3 AI 修改相关

| 事件 | 说明 |
|---|---|
| ai_edit_requested | 用户发起对话式修改 |
| ai_edit_diff_generated | 系统生成变更预览 |
| ai_edit_applied | 用户确认应用 AI 修改 |
| ai_edit_rejected | 用户拒绝 AI 修改 |

### 10.4 Execution Assets 相关

| 事件 | 说明 |
|---|---|
| prompt_generated | 系统生成节点提示词 |
| prompt_edited | 用户编辑提示词 |
| prompt_marked_outdated | 节点变更导致提示词过期 |
| prompt_pack_exported | 用户导出 Prompt Pack |
| checklist_exported | 用户导出审核清单 |

### 10.5 导出相关

| 事件 | 说明 |
|---|---|
| execution_kit_generated | 用户生成 Execution Kit |
| workflow_spec_exported | 用户导出 Workflow Spec |
| task_list_exported | 用户导出任务清单 |
| artifact_templates_exported | 用户导出交付物模板 |

---

## 11. 非功能性需求

### 11.1 可解释性

系统推荐执行模式时，应说明推荐原因。

例如：

> 该节点涉及生产发布，风险等级高，因此建议使用 Human Only。

### 11.2 可控性

所有 AI 生成的结构化修改都应支持用户确认，不应直接覆盖用户已有配置。

### 11.3 可追踪性

系统应记录关键变更：

- 谁修改了节点；
- 修改了什么；
- 是否由 AI 建议；
- 用户是否确认；
- 修改是否影响下游 Prompt 或 Checklist。

### 11.4 可导出性

BoundaryML 不应把用户锁死在自身系统内。

核心产出必须可导出为通用格式。

### 11.5 可扩展性

后续应支持更多项目模板、执行模式规则、导出适配器、模型供应商和组织级规范。

---

## 12. MVP 范围

### 12.1 MVP 必须包含

- 项目创建；
- Quick Start；
- 基础 Context Pack；
- 初始 Workflow 生成；
- Workflow Canvas；
- 节点详情配置；
- 执行模式配置；
- Prompt 生成与查看；
- Review Checklist 生成与查看；
- Execution Kit 导出；
- 示例 workflow。

### 12.2 MVP 可以暂缓

- 企业级权限系统；
- 实时多人协作；
- Jira / Linear / 飞书深度集成；
- 复杂版本分支；
- AI 自动学习历史项目流程；
- 完整组织知识库接入；
- 多租户 SaaS 后台。

---

## 13. 当前 README 需要补充的关键点

README 后续应补充以下内容：

1. BoundaryML 的核心蓝图由 LLM 基于 Project、Context Pack、Template 和 Boundary Rules 生成；
2. BoundaryML 的初始输入不只是任务目标，还可以包含 Context Pack；
3. 组织架构和审批流程不是强制输入，但会显著影响人机分界质量；
4. Studio 不是纯聊天界面，而是 Canvas Direct Edit + AI Assisted Edit + Diff Review；
5. AI 节点的提示词不是隐藏产物，而是可查看、可编辑、可导出的 Execution Asset；
6. BoundaryML 的核心产出是 Execution Kit，包括任务、提示词、审核清单、交付物模板和风险报告；
7. AI 不能静默修改正式 workflow，必须有 Diff 与确认机制；
8. Human Only 节点可以生成 checklist，但不生成 AI 执行提示词；
9. 模型接入层应支持可替换模型供应商，并通过规则层校验模型输出。

---

## 14. 术语表

| 术语 | 含义 |
|---|---|
| BoundaryML | 人机协作边界建模层 |
| Project | 一个需要规划和交付的项目 |
| Context Pack | 项目目标、组织角色、审批流程、风险约束等上下文信息 |
| Workflow | 项目从启动到交付的节点图 |
| Node | 最小可治理工作单元 |
| Execution Mode | 节点的人机协作执行方式 |
| Artifact | 节点交付物 |
| Review Gate | 节点进入下游前的审核门 |
| Prompt Pack | AI 节点提示词集合 |
| Execution Kit | 从 workflow 生成的执行包 |
| Model Access Layer | 将项目输入转化为人机分工蓝图、节点建议、提示词和 Diff 的模型接入层 |
| Boundary Rules | 用于校验和约束模型输出的人机分界规则 |
| Diff Review | AI 修改正式生效前的差异确认机制 |

