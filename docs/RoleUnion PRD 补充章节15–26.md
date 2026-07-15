# RoleUnion PRD 补充章节15–26

> 文档定位：本文作为《RoleUnion PRD》的补充文件，专门补齐产品内核层尚未明确定义的规则、状态、规格与输出协议。本文不定义数据库表结构，不限定具体前端技术栈或后端实现方式；重点定义产品对象、校验规则、生命周期、导出结构与 MVP 验收标准。

---

# 15. RoleUnion Spec v0.1

## 15.1 章节目标

RoleUnion Spec 用于定义 RoleUnion 内部最核心的产品对象协议。

RoleUnion Spec 是通用人机协作工作流的语义基础。它用于确保 Studio、模型接入层、Boundary Rules、Execution Kit、CLI、外部工具适配器和人工审核者理解同一套 Project、Context Pack、Workflow、Node、Execution Mode、Review Gate、Artifact、Prompt、Checklist 和 Execution Kit 结构。

Agent-ready Execution Kit 是 RoleUnion Spec 在 Agentic Development 场景下的第一个场景化应用。它不改变 RoleUnion Spec 的通用边界，也不代表所有 RoleUnion 项目都必须面向 Coding Agent。

它不是数据库表结构，也不是具体 API 文档，而是为了确保以下模块使用同一套产品对象语义：

- Studio 可视化工作流；
- 模型接入层；
- Boundary Rules 校验层；
- Prompt / Checklist / Artifact 生成器；
- Execution Kit 导出器；
- CLI；
- 示例 Workflow；
- 后续 GitHub / Jira / Linear 等外部工具适配器。

如果没有统一 Spec，前端、模型输出、导出文件和规则校验会各自定义一套结构，导致 RoleUnion 很快变成不可维护的流程图工具。

---

## 15.2 Spec 设计原则

RoleUnion Spec 应遵循以下原则：

1. **人可读**：普通产品经理、项目经理和技术负责人可以读懂；
2. **机可校验**：可以被 schema validator 校验；
3. **可导出**：可以导出为 YAML / JSON / Markdown；
4. **可版本化**：Workflow、Node、Prompt、Execution Kit 都应能追溯版本；
5. **可扩展**：后续可以扩展更多执行模式、规则、导出目标和组织模板；
6. **不绑定数据库**：Spec 只定义产品语义，不要求开发按此建立数据表。

---

## 15.3 顶层对象结构

RoleUnion 项目级 Spec 应至少包含以下顶层对象：

```yaml
roleunion_version: "0.1"
project:
  id: "project-ai-saas-mvp"
  name: "AI SaaS Feature MVP"
  goal: "Plan and deliver an AI-assisted SaaS feature from idea to launch."
  project_type: "ai_saas_feature"
  current_stage: "planning"
  risk_level: "medium"
  output_language: "en"

context_pack:
  status: "summarized"
  roles: []
  approval_processes: []
  tool_stack: []
  risk_constraints: []
  source_materials: []

workflow:
  id: "workflow-main"
  name: "Main Delivery Workflow"
  status: "draft"
  version: 1
  phases: []
  nodes: []
  edges: []

assets:
  prompts: []
  checklists: []
  artifact_templates: []

validation:
  status: "warning"
  results: []

execution_kits: []
agent_execution_plans: []
sandbox_execution_contracts: []
agent_runs: []
execution_evidence: []
promotion_gates: []
```

其中 `agent_execution_plans`、`sandbox_execution_contracts`、`agent_runs`、`execution_evidence` 和 `promotion_gates` 属于 Agentic Development 场景扩展对象。

它们用于支持 Coding Agent / 外部 Agent 的受控执行、沙箱契约、证据回收和发布门禁。非 Agentic Development 场景可以不使用这些对象，或保持为空数组。

P0 阶段这些对象可以只进入导出结构，不要求真实运行或真实 dispatch。

---

## 15.4 Project Spec

Project 代表一个需要进行人机分工规划的项目。

### 15.4.1 必填字段

| 字段 | 说明 |
|---|---|
| `id` | 项目唯一标识 |
| `name` | 项目名称 |
| `goal` | 项目目标 |
| `project_type` | 项目类型 |
| `risk_level` | 项目整体风险等级 |
| `current_stage` | 当前项目阶段 |

### 15.4.2 推荐字段

| 字段 | 说明 |
|---|---|
| `target_deliverables` | 目标交付物列表 |
| `expected_ai_scope` | 期望 AI 介入的范围 |
| `sensitive_areas` | 敏感区域，例如客户数据、生产发布、安全、支付等 |
| `output_language` | 默认输出语言 |
| `created_from_template` | 使用的模板 ID |

### 15.4.3 示例

```yaml
project:
  id: "project-ai-saas-mvp"
  name: "AI SaaS Feature MVP"
  goal: "Launch an AI-assisted SaaS feature for enterprise customers."
  project_type: "ai_saas_feature"
  current_stage: "planning"
  risk_level: "medium"
  target_deliverables:
    - "prd"
    - "technical_design"
    - "source_code"
    - "test_report"
    - "launch_plan"
  expected_ai_scope:
    - "prd_draft"
    - "task_breakdown"
    - "code_generation_prompt"
    - "test_case_generation"
  sensitive_areas:
    - "customer_data"
    - "production_release"
  output_language: "en"
```

---

## 15.5 Context Pack Spec

Context Pack 是模型生成蓝图和规则判断的重要上下文。

### 15.5.1 Context Pack 状态

| 状态 | 含义 |
|---|---|
| `empty` | 尚未录入上下文 |
| `draft` | 用户已录入部分上下文，但未生成摘要 |
| `summarized` | 系统已生成结构化摘要 |
| `reviewed` | 用户已确认摘要 |
| `outdated` | 原始上下文发生变化，摘要可能过期 |

### 15.5.2 示例

```yaml
context_pack:
  status: "summarized"
  roles:
    - id: "role-pm"
      name: "Product Manager"
      responsibilities:
        - "requirement definition"
        - "prd review"
      required_in_review: true

    - id: "role-tech-lead"
      name: "Tech Lead"
      responsibilities:
        - "architecture decision"
        - "code review"
      required_in_review: true

  approval_processes:
    - id: "approval-architecture"
      name: "Architecture Review"
      owner_role: "Tech Lead"
      trigger: "before development"

    - id: "approval-launch"
      name: "Launch Approval"
      owner_role: "Release Manager"
      trigger: "before production release"

  tool_stack:
    - type: "project_management"
      name: "GitHub Issues"
    - type: "ai_coding"
      name: "Codex"
    - type: "repository"
      name: "GitHub"

  risk_constraints:
    - id: "risk-customer-data"
      name: "Customer data involved"
      severity: "high"
      required_review_role: "Security Owner"

  source_materials:
    - id: "source-existing-process"
      type: "pasted_text"
      title: "Existing delivery process"
      summary_status: "summarized"
```

---

## 15.6 Workflow Spec

Workflow 是项目从启动到交付的节点图。

### 15.6.1 Workflow 必填字段

| 字段 | 说明 |
|---|---|
| `id` | Workflow 唯一标识 |
| `name` | Workflow 名称 |
| `status` | Workflow 状态 |
| `version` | Workflow 版本 |
| `phases` | 阶段列表 |
| `nodes` | 节点列表 |
| `edges` | 连线 / 依赖关系 |

### 15.6.2 Workflow 示例

```yaml
workflow:
  id: "workflow-main"
  name: "AI SaaS Delivery Workflow"
  status: "draft"
  version: 1
  phases:
    - id: "phase-discovery"
      name: "Discovery"
      order: 1
    - id: "phase-product-design"
      name: "Product Design"
      order: 2
    - id: "phase-development"
      name: "Development"
      order: 3
  nodes: []
  edges: []
```

---

## 15.7 Phase Spec

Phase 用于表达项目生命周期阶段。

### 15.7.1 Phase 字段

| 字段 | 说明 |
|---|---|
| `id` | 阶段唯一标识 |
| `name` | 阶段名称 |
| `order` | 展示顺序 |
| `description` | 阶段说明 |
| `status` | 阶段状态 |

### 15.7.2 默认 Phase 建议

MVP 阶段建议内置以下通用阶段：

```text
Discovery → Product Design → Technical Design → Development → Testing → Launch → Review
```

不同 Workflow Template 可以裁剪或重命名阶段。

---

## 15.8 Node Spec

Node 是 RoleUnion 中最小的可治理工作单元。

### 15.8.1 Node 必填字段

| 字段 | 说明 |
|---|---|
| `id` | 节点唯一标识 |
| `name` | 节点名称 |
| `phase_id` | 所属阶段 |
| `goal` | 节点目标 |
| `status` | 节点状态 |
| `risk_level` | 节点风险等级 |
| `execution_mode` | 节点执行模式 |
| `human_owner_role` | 人工责任角色 |
| `ai_role` | AI 在该节点中的职责 |
| `inputs` | 节点输入 |
| `outputs` | 节点输出 |
| `artifact_contract` | 交付物契约 |
| `review_gate` | 审核门 |

### 15.8.2 Node 示例

```yaml
nodes:
  - id: "node-prd-draft"
    name: "PRD Draft Generation"
    phase_id: "phase-product-design"
    goal: "Generate a structured PRD draft based on project goal and context pack."
    status: "draft"
    risk_level: "medium"
    execution_mode: "ai_draft_human_review"
    human_owner_role: "Product Manager"
    ai_role: "Generate first draft and identify open questions."
    inputs:
      - id: "input-project-goal"
        name: "Project Goal"
        source: "project.goal"
        required: true
      - id: "input-context-summary"
        name: "Context Pack Summary"
        source: "context_pack.summary"
        required: true
    outputs:
      - id: "output-prd-draft"
        name: "PRD Draft"
        type: "markdown"
        required: true
    artifact_contract:
      id: "artifact-prd"
      type: "markdown"
      name: "prd-draft.md"
      required_sections:
        - "Background"
        - "Goals"
        - "Scope"
        - "User Stories"
        - "Acceptance Criteria"
        - "Risks"
        - "Open Questions"
    review_gate:
      id: "gate-pm-review"
      name: "PM Review"
      reviewer_role: "Product Manager"
      required: true
    agent_execution:
      enabled: false
      execution_level: "l0_human_only"
      execution_target: null
      sandbox_execution_contract_id: null
```


### 15.8.3 Node Agent Execution 推荐字段

当 Node 可能交给 Coding Agent 或外部工程工具执行时，建议增加 `agent_execution` 字段：

```yaml
agent_execution:
  enabled: false
  execution_level: "l0_human_only"
  execution_target: null
  sandbox_execution_contract_id: null
```

字段说明：

- `enabled`：该节点是否允许交给 Agent；
- `execution_level`：Agent 执行等级；
- `execution_target`：计划交给哪个 Agent / Adapter；
- `sandbox_execution_contract_id`：关联的沙箱执行契约。

`agent_execution` 是 Agentic Development 场景下的推荐扩展字段，不是所有 Node 的通用必填字段。

非 Agentic Development 场景可以不使用该字段，或将其保持为：

```yaml
agent_execution:
  enabled: false
  execution_level: "l0_human_only"
  execution_target: null
  sandbox_execution_contract_id: null
```

该字段不改变 `execution_mode` 的语义。`execution_mode` 仍然表达通用的人机协作方式；`agent_execution.execution_level` 只表达 Agentic Development 场景下 Agent 的执行权限等级。

---

## 15.9 Edge / Connection Spec

Edge 表达节点之间的上下游依赖。

### 15.9.1 Edge 字段

| 字段 | 说明 |
|---|---|
| `id` | 连线唯一标识 |
| `from_node_id` | 上游节点 |
| `to_node_id` | 下游节点 |
| `dependency_type` | 依赖类型 |
| `required_outputs` | 下游所需的上游输出 |
| `gate_id` | 如果审核门位于节点之间，可挂载 Review Gate |

### 15.9.2 依赖类型

| 类型 | 含义 |
|---|---|
| `artifact_dependency` | 下游依赖上游交付物 |
| `approval_dependency` | 下游依赖人工审核通过 |
| `context_dependency` | 下游依赖上下文信息 |
| `sequential_dependency` | 普通顺序依赖 |

### 15.9.3 示例

```yaml
edges:
  - id: "edge-prd-to-architecture"
    from_node_id: "node-prd-draft"
    to_node_id: "node-architecture-proposal"
    dependency_type: "approval_dependency"
    required_outputs:
      - "output-prd-draft"
    gate_id: "gate-pm-review"
```

---

## 15.10 Review Gate Spec

Review Gate 可以属于 Node，也可以属于 Edge。

### 15.10.1 挂载规则

| 挂载位置 | 适用场景 |
|---|---|
| Node Review Gate | 节点完成后必须审核 |
| Edge Review Gate | 上游进入下游之前必须审核 |

MVP 阶段可以优先实现 Node Review Gate；Edge Review Gate 可作为视觉表达和后续扩展能力。

### 15.10.2 示例

```yaml
review_gate:
  id: "gate-security-review"
  name: "Security Review"
  reviewer_role: "Security Owner"
  required: true
  criteria:
    - "No sensitive customer data is exposed."
    - "Permission model has been reviewed."
    - "No secret or API key is included in generated artifacts."
  pass_condition: "All criteria must be checked by the reviewer."
  reject_condition: "Any unchecked security criterion blocks downstream execution."
  allow_ai_revision: true
  max_ai_revision_attempts: 1
```

---

## 15.11 Execution Asset Spec

Execution Asset 是从节点契约生成的可执行资产。

包括：

- Prompt；
- Review Checklist；
- Artifact Template；
- Risk Report Section；
- Task Item。

### 15.11.1 Prompt Asset 示例

```yaml
prompts:
  - id: "prompt-prd-draft-v1"
    node_id: "node-prd-draft"
    status: "draft"
    version: 1
    model_config_ref: "planning_model"
    generated_from:
      node_contract_version: 1
      context_pack_version: 1
    content_ref: "prompts/prd-draft.prompt.md"
    output_format: "markdown"
```

### 15.11.2 Checklist Asset 示例

```yaml
checklists:
  - id: "checklist-pm-review-v1"
    node_id: "node-prd-draft"
    review_gate_id: "gate-pm-review"
    status: "draft"
    version: 1
    items:
      - "Does the PRD define target users?"
      - "Does the PRD define scope boundaries?"
      - "Does the PRD list assumptions and open questions?"
```

---

## 15.12 Execution Kit Spec

Execution Kit 是从 Final / Reviewed Workflow 生成的交付包。

### 15.12.1 Execution Kit 字段

| 字段 | 说明 |
|---|---|
| `id` | Execution Kit 唯一标识 |
| `workflow_snapshot_version` | 绑定的 Workflow 版本 |
| `status` | 生成状态 |
| `generated_at` | 生成时间 |
| `included_assets` | 包含的资产类型 |
| `export_formats` | 导出格式 |

### 15.12.2 示例

```yaml
execution_kits:
  - id: "kit-v1"
    workflow_snapshot_version: 3
    status: "generated"
    included_assets:
      - "workflow_spec"
      - "task_list"
      - "prompt_pack"
      - "review_checklists"
      - "artifact_templates"
      - "risk_report"
    export_formats:
      - "markdown"
      - "yaml"
```

---

## 15.13 通用对象与场景扩展对象

RoleUnion Spec 分为两类对象：

| 类型 | 对象 | 说明 |
|---|---|---|
| 通用对象 | Project / Context Pack / Workflow / Phase / Node / Edge / Review Gate / Artifact Contract / Prompt / Checklist / Execution Kit / Validation Result | 所有 RoleUnion 项目的核心对象 |
| 场景扩展对象 | Agent Execution Plan / Sandbox Execution Contract / Agent Run / Execution Evidence / Promotion Gate | Agentic Development 场景下用于 Coding Agent 受控执行和工程链路治理的扩展对象 |

场景扩展对象不得反向收窄 RoleUnion 的通用产品定义。

---

# 16. Boundary Rules & Validation Policy

## 16.1 章节目标

Boundary Rules 用于约束模型输出、用户编辑和导出行为。

它解决的问题是：LLM 可以生成建议，但不能自由决定所有人机边界；用户可以编辑 Workflow，但系统必须提示风险和缺失项。

Boundary Rules 的作用包括：

- 校验 Workflow 是否完整；
- 校验 AI 节点是否具备必要上下文、输出格式和验收标准；
- 校验高风险节点是否具备 Review Gate；
- 校验 Human Only 节点是否被错误生成 AI Prompt；
- 校验 Prompt、Checklist、Artifact 是否过期；
- 为用户提供可解释的 Error / Warning / Suggestion。

---

## 16.2 Rule 类型

RoleUnion 第一阶段定义 5 类规则。

| 规则类型 | 含义 | 是否阻止 Final | 是否阻止导出 |
|---|---|---:|---:|
| Blocking Rule | 必须修复的硬性错误 | 是 | 默认是 |
| Warning Rule | 可继续但必须提示 | 否 | 否 |
| Suggestion Rule | 优化建议 | 否 | 否 |
| Override Rule | 默认不建议，但用户可强制覆盖 | 取决于规则 | 否 |
| Auto-fix Rule | 系统可生成修复建议 | 否 | 否 |

---

## 16.3 Validation Result 级别

| 级别 | UI 表现 | 产品含义 |
|---|---|---|
| `error` | 红色错误 | 必须处理，否则不能进入 Final |
| `warning` | 橙色警告 | 可以导出，但需要明确提示 |
| `suggestion` | 蓝色建议 | 不影响流程，仅提供优化建议 |

---

## 16.4 Rule Result 结构

每条规则校验结果应包含：

```yaml
validation_result:
  id: "rule-high-risk-review-gate"
  level: "error"
  target_type: "node"
  target_id: "node-production-approval"
  title: "High-risk node has no Review Gate"
  message: "This node is marked as high risk but has no required human review gate."
  suggested_action: "Add a Review Gate with a responsible human reviewer."
  auto_fix_available: true
  blocking_final: true
```

---

## 16.5 P0 规则清单

### 16.5.1 高风险节点必须有 Review Gate

| 项 | 内容 |
|---|---|
| Rule ID | `high_risk_requires_review_gate` |
| 类型 | Blocking Rule |
| 条件 | Node risk_level = high，且无 required Review Gate |
| 结果 | 不能进入 Final |
| Auto-fix | 建议添加 Review Gate |

---

### 16.5.2 AI 执行节点必须有输出格式

| 项 | 内容 |
|---|---|
| Rule ID | `ai_node_requires_output_format` |
| 类型 | Blocking Rule |
| 条件 | execution_mode 包含 AI 执行，且 output / artifact_contract 缺失 |
| 结果 | 不能进入 Final |
| Auto-fix | 建议生成 Artifact Contract |

---

### 16.5.3 AI 执行节点必须有验收标准

| 项 | 内容 |
|---|---|
| Rule ID | `ai_node_requires_acceptance_criteria` |
| 类型 | Blocking Rule |
| 条件 | AI 节点无 Acceptance Criteria |
| 结果 | 不能进入 Final |
| Auto-fix | 建议生成 Review Checklist |

---

### 16.5.4 Human Only 节点不得生成 AI 执行 Prompt

| 项 | 内容 |
|---|---|
| Rule ID | `human_only_no_ai_prompt` |
| 类型 | Blocking Rule |
| 条件 | execution_mode = human_only，且存在 AI execution prompt |
| 结果 | Prompt 标记为 invalid，不能进入 Prompt Pack |
| Auto-fix | 将 Prompt 转为 Human Checklist 或移除 |

---

### 16.5.5 Prompt Outdated 必须提示

| 项 | 内容 |
|---|---|
| Rule ID | `outdated_prompt_warning` |
| 类型 | Warning Rule |
| 条件 | Prompt 关联的 Node Contract、Context Pack 或 Review Gate 已变更 |
| 结果 | 可以导出，但导出前必须提示 |
| Auto-fix | 重新生成 Prompt |

---

### 16.5.6 节点不能没有输入和输出

| 项 | 内容 |
|---|---|
| Rule ID | `node_requires_input_and_output` |
| 类型 | Blocking Rule |
| 条件 | Node 无 inputs 或 outputs |
| 结果 | 不能进入 Final |
| Auto-fix | 生成 Node Contract 建议 |

---

### 16.5.7 连线下游输入必须被满足

| 项 | 内容 |
|---|---|
| Rule ID | `edge_required_output_missing` |
| 类型 | Blocking Rule |
| 条件 | Edge 声明下游需要某输出，但上游 Node 未定义该输出 |
| 结果 | 不能进入 Final |
| Auto-fix | 补充上游 output 或修改下游 input |

---

### 16.5.8 AI Autonomous 只允许低风险节点

| 项 | 内容 |
|---|---|
| Rule ID | `ai_autonomous_low_risk_only` |
| 类型 | Blocking Rule / Override Rule |
| 条件 | execution_mode = ai_autonomous，且 risk_level ≠ low |
| 结果 | 默认不能进入 Final |
| Override | MVP 不允许覆盖；后续企业版可通过组织规则允许覆盖 |

---

### 16.5.9 生产发布节点默认 Human Only

| 项 | 内容 |
|---|---|
| Rule ID | `production_release_requires_human_only_or_approval` |
| 类型 | Blocking Rule |
| 条件 | Node 涉及 production_release，且 execution_mode = ai_autonomous |
| 结果 | 不能进入 Final |
| Auto-fix | 建议改为 Human Only 或 AI Draft + Human Review |

---

### 16.5.10 缺少模型配置时不能生成模型资产

| 项 | 内容 |
|---|---|
| Rule ID | `model_config_required_for_generation` |
| 类型 | Warning / Blocking |
| 条件 | 用户请求生成 Workflow / Prompt / Diff，但无可用模型配置 |
| 结果 | 不能调用模型，但允许手动编辑 |
| Auto-fix | 引导用户配置 Model Access |

---

## 16.6 Validate 触发时机

系统应在以下时机触发规则校验：

| 触发时机 | 校验范围 |
|---|---|
| 生成初始 Workflow 后 | 全量 Workflow |
| 用户修改节点后 | 当前 Node + 下游依赖 |
| 用户修改执行模式后 | 当前 Node + Prompt / Checklist |
| 用户应用 AI Diff 前 | Diff 涉及对象 |
| 用户应用 AI Diff 后 | 全量 Workflow 或受影响子图 |
| 生成 Execution Kit 前 | 全量 Workflow + Assets |
| 导出前 | Execution Kit |

---

## 16.7 Validate 结果对产品状态的影响

| 校验结果 | Workflow 状态影响 | 导出影响 |
|---|---|---|
| 无 Error / Warning | 可进入 Final | 可导出 |
| 有 Warning，无 Error | 可进入 Reviewed，但不建议 Final | 可导出，但显示警告 |
| 有 Error | 不可进入 Final | 默认不允许导出 Final Kit，可允许导出 Draft Kit |

MVP 中建议允许用户导出 Draft Kit，但必须明确标记：

> This Execution Kit contains unresolved validation errors and should not be treated as final.

---

# 17. Risk Scoring & Execution Mode Policy

## 17.1 章节目标

风险模型用于决定系统如何推荐 Execution Mode、Review Gate 和 Prompt / Checklist 要求。

RoleUnion 不应该只让用户手动选择 Low / Medium / High，而应根据项目和节点信息生成风险建议。

---

## 17.2 风险维度

MVP 阶段定义 8 个风险维度。

| 风险维度 | 说明 | 示例 |
|---|---|---|
| Data Risk | 是否涉及敏感数据、客户数据或隐私 | 用户资料、客户合同、日志数据 |
| Production Risk | 是否影响线上系统 | 发布、回滚、配置变更 |
| Legal Risk | 是否涉及法务、合规或对外承诺 | 合同、隐私政策、客户承诺 |
| Financial Risk | 是否涉及支付、结算或成本 | 价格、账单、采购、预算 |
| Security Risk | 是否涉及权限、安全、密钥、访问控制 | API Key、权限模型、漏洞修复 |
| Architecture Risk | 是否影响系统核心架构 | 数据模型、核心服务拆分、基础设施 |
| Reversibility Risk | 出错后是否难以回滚 | 数据迁移、生产变更 |
| External Impact Risk | 是否直接影响客户或公众 | 客户端 UI、公开文档、营销页面 |

---

## 17.3 风险评分

每个风险维度可按 0–3 分打分。

| 分值 | 含义 |
|---|---|
| 0 | 不涉及 |
| 1 | 低影响 |
| 2 | 中等影响 |
| 3 | 高影响 |

总分映射：

| 总分 | 风险等级 |
|---:|---|
| 0–3 | Low |
| 4–8 | Medium |
| 9+ | High |

如果某些风险维度为 3，系统可以直接提升为 High Risk，例如：

- Security Risk = 3；
- Production Risk = 3；
- Legal Risk = 3；
- Data Risk = 3。

---

## 17.4 节点风险计算来源

节点风险可来自：

1. 用户手动标记；
2. Project Sensitive Areas；
3. Context Pack 风险约束；
4. 模型接入层生成的风险建议；
5. Boundary Rules 识别；
6. Workflow Template 默认配置。

冲突处理原则：

> 用户手动标记优先，但不能绕过 Blocking Rule。

例如用户把生产发布节点标成 Low Risk，系统仍应根据 Production Risk 规则提示或强制提升风险等级。

---

## 17.5 Execution Mode 推荐策略

### 17.5.1 风险等级与执行模式默认关系

| 风险等级 | 推荐执行模式 | 禁止或不推荐 |
|---|---|---|
| Low | AI Draft + Human Review / AI Execute + Human Approval / AI Autonomous | 无硬性禁止，视规则而定 |
| Medium | Human Lead + AI Assist / AI Draft + Human Review / AI Execute + Human Approval | 不推荐 AI Autonomous |
| High | Human Only / Human Lead + AI Assist / AI Draft + Human Review | 禁止 AI Autonomous |

---

### 17.5.2 特定风险的默认策略

| 风险类型 | 默认策略 |
|---|---|
| Customer Data | 至少需要 Security Review |
| Production Release | Human Only 或 AI Draft + Human Review |
| Legal / Compliance | Human Only 或 Human Lead + AI Assist |
| Architecture Decision | Human Lead + AI Assist |
| Code Generation | AI Execute + Human Approval |
| Test Case Generation | AI Draft + Human Review |
| Documentation Draft | AI Draft + Human Review |
| Formatting / Classification | AI Autonomous 可选 |

---

## 17.6 Execution Mode 推荐解释

系统推荐执行模式时，需要提供简短原因。

示例：

```text
Recommended: Human Lead + AI Assist
Reason: This node involves architecture decisions and downstream implementation impact. AI can assist with options and tradeoffs, but a Tech Lead should own the final decision.
```

---

## 17.7 用户手动覆盖策略

| 情况 | 是否允许覆盖 | 要求 |
|---|---:|---|
| Low Risk 改为更保守模式 | 允许 | 无需额外确认 |
| Medium Risk 改为 AI Autonomous | 允许但强警告 | 二次确认 |
| High Risk 改为 AI Autonomous | MVP 不允许 | 必须改为其他模式 |
| Human Only 改为 AI 执行模式 | 允许或禁止取决于规则 | 若涉及高风险则禁止 |
| 模型推荐被用户拒绝 | 允许 | 记录原因可选 |

---

## 17.8 Coding Agent Execution Level

Coding Agent Execution Level 是独立于 Execution Mode 的治理概念。Execution Mode 表达“人机协作方式”，Coding Agent Execution Level 表达“Agent 可执行权限等级”。

| 等级 | 名称 | 含义 | 典型任务 |
| -- | --- | --- | --- |
| L0 | Human Only | Agent 不可执行，只能生成 checklist 或建议 | 生产发布审批、法务、安全策略 |
| L1 | Agent Suggest | Agent 只读仓库和上下文，输出方案，不改代码 | 影响面分析、技术方案、重构建议 |
| L2 | Agent Patch | Agent 可生成代码补丁，但不运行完整环境、不创建 PR | 小修、文档、低风险组件改动 |
| L3 | Agent Sandbox | Agent 可在隔离沙箱中改代码、运行测试、生成 preview / PR | 普通前端功能、Bugfix、测试补充 |
| L4 | Agent Pipeline | Agent 可触发 CI/CD 到 staging，但不能进入 production | 内部工具、低风险服务、预发布验证 |
| L5 | Agent Autonomous | Agent 可在强约束内自动完成、合并或发布 | 极低风险、强测试覆盖、可快速回滚任务 |

规则说明：

- High Risk 节点默认不得超过 L2，除非有明确 Review Gate 和 Promotion Gate；
- production release 默认 L0 或最多 L1；
- 涉及 customer data / secrets / payment / legal 的节点不得 L4 / L5；
- L3 以上必须有 Sandbox Execution Contract；
- L4 以上必须有 Promotion Gate；
- L5 不进入 MVP，仅作为长期方向。

---

# 18. State Machine & Lifecycle Rules

## 18.1 章节目标

本章定义 RoleUnion 核心对象的状态机，避免 Draft、Reviewed、Applied、Final、Outdated 等状态被混用。

---

## 18.2 Project 状态

| 状态 | 含义 |
|---|---|
| `created` | 项目已创建，但尚未生成 Workflow |
| `context_ready` | Context Pack 已完成或跳过 |
| `workflow_draft` | 已生成 Workflow Draft |
| `workflow_reviewed` | Workflow 已被用户查看或编辑 |
| `execution_kit_generated` | 已生成 Execution Kit |
| `archived` | 项目归档 |

### 18.2.1 Project 状态流转

```text
created
  → context_ready
  → workflow_draft
  → workflow_reviewed
  → execution_kit_generated
  → archived
```

---

## 18.3 Workflow 状态

| 状态 | 含义 |
|---|---|
| `draft` | 模型生成或用户编辑中的草稿 |
| `reviewed` | 用户已查看并完成主要确认 |
| `validated` | 规则校验无 Error |
| `final` | 用户确认可用于生成正式 Execution Kit |
| `outdated` | Context Pack 或 Template 变化导致 Workflow 可能过期 |

### 18.3.1 Workflow 流转规则

```text
draft → reviewed → validated → final
   ↑        ↓           ↓
   └──── outdated ←─────┘
```

规则：

- 模型生成的 Workflow 默认是 `draft`；
- 用户打开 Studio 并保存修改后可进入 `reviewed`；
- Validate 无 Error 后可进入 `validated`；
- 用户点击 Confirm / Mark Final 后进入 `final`；
- Context Pack、Template 或核心规则变化后，Workflow 可被标记为 `outdated`。

---

## 18.4 Node 状态

| 状态 | 含义 |
|---|---|
| `draft` | 节点由模型生成或用户新建，尚未确认 |
| `reviewed` | 用户已确认节点配置 |
| `applied` | AI Diff 中的节点变更已应用 |
| `failed_validation` | 节点未通过规则校验 |
| `outdated` | 上游输入、Context 或 Template 变化后节点可能过期 |

规则：

- `applied` 是变更应用状态，不等于 `reviewed`；
- `failed_validation` 优先级高于 `reviewed`；
- 节点变为 `outdated` 后，相关 Prompt / Checklist 也应被检查是否过期。

---

## 18.5 Prompt 状态

| 状态 | 含义 |
|---|---|
| `missing` | AI 节点尚未生成 Prompt |
| `draft` | Prompt 已生成但未确认 |
| `reviewed` | 用户已确认 Prompt |
| `final` | 已进入 Execution Kit 的正式 Prompt |
| `outdated` | 关联的 Node Contract / Context / Review Gate 已变化 |
| `invalid` | Prompt 与节点执行模式冲突，例如 Human Only 节点存在 AI Prompt |

状态规则：

- AI 节点进入 Final 前，Prompt 至少应为 `reviewed` 或允许用户显式导出 Draft；
- 如果 Node 输入、输出、Artifact Contract、Review Gate 发生变化，Prompt 应标记为 `outdated`；
- Human Only 节点的 Prompt 应为 `invalid` 或不存在。

---

## 18.6 Checklist 状态

| 状态 | 含义 |
|---|---|
| `missing` | 需要审核但无 Checklist |
| `draft` | 已生成但未确认 |
| `reviewed` | 已确认 |
| `final` | 已进入 Execution Kit |
| `outdated` | Review Gate 或 Artifact Contract 变化导致过期 |

---

## 18.7 Execution Kit 状态

| 状态 | 含义 |
|---|---|
| `preview` | 用户正在预览导出内容 |
| `generated` | 已生成 Execution Kit |
| `exported` | 用户已导出 |
| `stale` | Workflow 后续变化导致该 Kit 不再是最新版本 |

规则：

- 每个 Execution Kit 必须绑定一个 Workflow Snapshot；
- Workflow 修改后，旧 Execution Kit 标记为 `stale`；
- stale Kit 不删除，但导出页面应提醒用户重新生成。

---

## 18.8 状态优先级

当对象同时符合多个状态时，UI 展示优先级如下：

```text
failed_validation > outdated > draft > reviewed > validated > final
```

例如：一个已 Reviewed 的节点，如果后来 Prompt 过期并且缺少 Review Gate，应显示 Failed Validation，而不是 Reviewed。

---

# 19. Workflow Template System

## 19.1 章节目标

Workflow Template 是 RoleUnion 快速生成高质量初始蓝图的基础。

RoleUnion 不应该让用户从空白画布开始，也不应该完全依赖 LLM 自由生成。模板系统用于提供稳定结构，LLM 用于结合具体项目上下文进行裁剪、补充和解释。

---

## 19.2 Template 类型

| 类型 | 说明 |
|---|---|
| Built-in Template | RoleUnion 内置模板 |
| Organization Template | 组织自定义模板 |
| Project Template | 从某个项目另存的模板 |
| Example Template | 用于演示和开源 README 的示例模板 |

MVP 阶段只需要支持 Built-in Template 和 Example Template。

---

## 19.3 Template 内容

一个 Workflow Template 可以包含：

- 项目类型；
- 默认阶段；
- 默认节点；
- 默认节点依赖；
- 推荐执行模式；
- 默认风险等级；
- 默认 Review Gate；
- 默认 Artifact Contract；
- 默认 Prompt Skeleton；
- 默认 Checklist Skeleton；
- 适用场景；
- 不适用场景。

---

## 19.4 Template Spec 示例

```yaml
template:
  id: "tpl-ai-saas-feature-mvp"
  name: "AI SaaS Feature MVP"
  version: 1
  project_types:
    - "ai_saas_feature"
    - "saas"
  description: "A workflow template for planning and delivering an AI-assisted SaaS feature."
  phases:
    - "Discovery"
    - "Product Design"
    - "Technical Design"
    - "Development"
    - "Testing"
    - "Launch"
  default_nodes:
    - name: "Project Goal Clarification"
      phase: "Discovery"
      execution_mode: "human_lead_ai_assist"
    - name: "PRD Draft Generation"
      phase: "Product Design"
      execution_mode: "ai_draft_human_review"
    - name: "Architecture Proposal"
      phase: "Technical Design"
      execution_mode: "human_lead_ai_assist"
```

---

## 19.5 Template 匹配规则

系统应根据以下信息推荐模板：

1. Project Type；
2. Target Deliverables；
3. Current Stage；
4. Expected AI Scope；
5. Sensitive Areas；
6. 用户选择。

如果多个模板匹配，应展示推荐理由。

示例：

```text
Recommended Template: AI SaaS Feature MVP
Reason: Your project type is AI Feature, target deliverables include PRD, technical design, source code and launch plan.
```

---

## 19.6 Template 与 LLM 的关系

LLM 不应完全脱离模板生成 Workflow。

正确流程：

```text
Project + Context Pack
      ↓
Template Matching
      ↓
Template-based Workflow Skeleton
      ↓
LLM Contextual Expansion
      ↓
Boundary Rules Validation
      ↓
Workflow Draft
```

LLM 的作用是：

- 根据 Context Pack 裁剪模板节点；
- 根据组织审批流程添加 Review Gate；
- 根据风险约束调整 Execution Mode；
- 根据项目目标补充特殊节点；
- 为节点生成输入输出和解释。

---

## 19.7 MVP 内置模板

MVP 至少内置 3 个模板：

1. **AI SaaS Feature MVP**  
   用于 AI SaaS 功能从 0 到 1。

2. **Internal AI Tool**  
   用于企业内部 AI 工具或自动化系统建设。

3. **Legacy System AI Modernization**  
   用于传统系统接入 AI 能力或使用 AI Coding 工具重构。

---

## 19.8 Template 版本规则

- 每个模板必须有 version；
- 已生成的 Workflow 应记录来源模板和模板版本；
- 模板升级后，不应自动覆盖已有项目；
- 用户可选择基于新模板重新生成 Workflow Diff。

---

# 20. Execution Kit Output Specification

## 20.1 章节目标

Execution Kit 是 RoleUnion 的核心外部交付物。在对外产品语义中，它应被明确描述为 **Agent-ready Execution Kit**。

它的目标不是让 RoleUnion 自己执行任务，而是让团队把人机分工蓝图、任务边界、Prompt、Required Context、Output Contract、Acceptance Criteria 和 Review Gate 交接给 Codex / Claude Code / GitHub Copilot / Cursor / GitHub Issues / 人工审核者和交付团队。

---

## 20.2 Execution Kit 默认目录结构

MVP 阶段建议导出结构如下：

```text
execution-kit/
├─ workflow_spec.yaml
├─ agent_task_list.md
├─ prompt_pack.md
├─ review_checklists.md
├─ artifact_templates.md
├─ responsibility_map.md
└─ risk_report.md
```

如果用户选择 JSON 格式，可以额外导出：

```text
execution-kit/
└─ workflow_spec.json
```

---

## 20.3 `workflow_spec.yaml`

包含最终 Workflow Snapshot。

必须包含：

- Project 信息；
- Context Pack 摘要；
- Workflow 版本；
- Phases；
- Nodes；
- Edges；
- Execution Modes；
- Review Gates；
- Artifact Contracts；
- Validation Results；
- 生成时间。

---

## 20.4 `agent_task_list.md` 或 `task_list.md`

Agent Task List 用于交给项目管理工具、coding agents 或人工执行者。MVP 可以保留 `task_list.md` 兼容命名，但对外推荐使用 `agent_task_list.md` 来体现 agent-ready 交接语义。

任务粒度默认以 Node 为基础，但允许一个 Node 拆成多个任务。

### 20.4.1 任务拆分规则

| Node 类型 | 默认任务生成方式 |
|---|---|
| Human Only | 生成一个人工任务 |
| AI Draft + Human Review | 生成 AI Draft 任务 + Human Review 任务 |
| Human Lead + AI Assist | 生成 Human Lead 任务，附 AI Assist Prompt |
| AI Execute + Human Approval | 生成 AI Execute 任务 + Human Approval 任务 |
| AI Autonomous | 生成 AI Auto Task，并标记约束条件 |

### 20.4.2 Task 示例

```md
## Task: PRD Draft Generation

- Phase: Product Design
- Execution Mode: AI Draft + Human Review
- Human Owner: Product Manager
- AI Role: Generate first draft and identify open questions
- Required Inputs:
  - Project Goal
  - Context Pack Summary
- Expected Output:
  - prd-draft.md
- Review Gate:
  - PM Review required before downstream execution
- Related Prompt:
  - prompt-prd-draft-v1
- Acceptance Criteria:
  - PRD includes scope boundaries
  - PRD includes assumptions and open questions
```

---

## 20.5 `prompt_pack.md`

Prompt Pack 包含所有 AI 节点的最终 Prompt。

每个 Prompt 必须包含：

- Node ID；
- Node Name；
- Execution Mode；
- AI Role；
- Prompt Content；
- Context Required；
- Output Format；
- Acceptance Criteria；
- Failure Handling；
- Version；
- Generated From。

---

## 20.6 `review_checklists.md`

Review Checklist 按 Review Gate 生成，而不是单纯按 Node 生成。

一个节点如果有多个 Review Gate，则生成多个 Checklist。

Checklist 示例：

```md
## Review Checklist: PM Review for PRD Draft

- Node: PRD Draft Generation
- Reviewer Role: Product Manager
- Required: Yes

### Criteria
- [ ] Does the PRD define the target users?
- [ ] Does the PRD define scope boundaries?
- [ ] Does the PRD list assumptions and risks?
- [ ] Are AI-generated sections reviewed by the owner?

### Pass Condition
All required criteria must be checked.

### Reject Condition
Any missing scope, risk or acceptance criteria blocks downstream execution.
```

---

## 20.7 `artifact_templates.md`

Artifact Templates 为节点产出物提供结构模板。

例如 PRD、技术方案、测试报告、上线检查表。

每个模板应包含：

- Artifact Name；
- Node 来源；
- Format；
- Required Sections；
- Optional Sections；
- Completion Criteria。

---

## 20.8 `responsibility_map.md`

Responsibility Map 用于表达人和 AI 在项目中的责任分布。

至少提供三种视角：

1. By Role：每个角色负责哪些节点；
2. By Phase：每个阶段由谁主导；
3. By Execution Mode：哪些节点由 AI / 人工 / 人机协作完成。

示例：

```md
## By Role

### Product Manager
- Project Goal Clarification
- PRD Draft Review
- Scope Review

### Tech Lead
- Architecture Proposal
- API Contract Review
- Code Review
```

---

## 20.9 `risk_report.md`

Risk Report 不只是列风险，也应提供修复建议。

每条风险至少包含：

- Risk Title；
- Risk Level；
- Affected Node；
- Reason；
- Suggested Mitigation；
- Related Review Gate；
- Whether Blocking Final。

---

## 20.10 Draft Kit 与 Final Kit

MVP 中允许导出 Draft Kit 和 Final Kit。

| Kit 类型 | 使用场景 | 要求 |
|---|---|---|
| Draft Kit | 讨论、评审、内部预览 | 可包含 Warning / Error，但必须标记 |
| Final Kit | 正式交接执行 | 不允许 Blocking Error |

导出 Draft Kit 时必须提示：

> This kit contains unresolved validation issues and should not be used as a final execution handoff.

## 20.11 Agent-ready Execution Kit 可选输出

在默认 Execution Kit 目录结构中，可以增加以下 Agentic Development 输出：

```text
execution-kit/
├─ 08_agent_execution_plan.md
├─ 09_sandbox_execution_contracts.yaml
└─ 10_promotion_gates.md
```

说明：

- P0 只要求生成 Agent-ready Execution Kit，不要求真实 dispatch；
- `08_agent_execution_plan.md` 描述哪些 Node 可以交给 Agent、执行等级、目标 Agent、是否需要人工确认；
- `09_sandbox_execution_contracts.yaml` 描述每个 Agent 节点的沙箱执行契约；
- `10_promotion_gates.md` 描述 sandbox → PR → staging → production 的门禁规则。

## 20.12 Sandbox Execution Contract Spec

Sandbox Execution Contract 定义 Coding Agent 在沙箱执行开发节点时的完整约束。P0 中它可以作为导出对象存在，不要求 RoleUnion 真正创建沙箱或派发 Agent。

```yaml
sandbox_execution_contract:
  id: "sandbox-contract-login-page-v1"
  node_id: "node-frontend-login-page"
  status: "draft"

  execution_target:
    type: "coding_agent"
    provider: "codex"
    adapter: "codex_cloud_sandbox"
    dispatch_mode: "manual_confirmed"

  repo_scope:
    repository: "company/app"
    base_branch: "develop"
    working_branch: "agent/login-page-redesign"
    allowed_paths:
      - "apps/web/src/pages/login/**"
      - "apps/web/src/components/auth/**"
    forbidden_paths:
      - "packages/payment/**"
      - "infra/**"
      - ".github/workflows/**"

  runtime_scope:
    sandbox_type: "ephemeral"
    allow_network: false
    allow_package_install: true
    max_runtime_minutes: 30
    allowed_commands:
      - "npm install"
      - "npm run lint"
      - "npm run test"
      - "npm run build"

  secret_scope:
    production_secrets: "forbidden"
    test_secrets: "allowed"
    env_profile: "preview"

  cost_budget:
    max_cost_usd_per_run: 2.00
    max_iterations: 2
    max_model_calls: 20

  acceptance_tests:
    required:
      - "npm run lint"
      - "npm run test"
      - "npm run build"
    optional:
      - "npm run e2e"

  output_required:
    - "code_diff"
    - "test_report"
    - "risk_summary"
    - "preview_url"

  review_gate:
    reviewer_role: "Tech Lead"
    required: true
    merge_allowed_after_review: true

  promotion_policy:
    can_create_pr: true
    can_merge: false
    can_deploy_preview: true
    can_deploy_staging: false
    can_deploy_production: false
```

---

# 21. Planning vs Execution Boundary

## 21.1 章节目标

本章用于明确 RoleUnion 的产品边界，防止项目从“人机分工蓝图系统”膨胀成“全流程项目管理 + AI 执行平台”。

RoleUnion prepares work before agents execute. 它不替代 Codex / Claude Code / GitHub Copilot / Cursor，也不替代项目管理工具，而是在这些工具执行或承接任务之前定义任务边界、上下文、输出契约、Review Gate 和验收标准。

---

## 21.2 核心边界

RoleUnion 默认不直接执行项目工作，也默认不执行真实项目任务。

它负责：

- 生成工作流蓝图；
- 定义人机分工边界；
- 生成 Prompt、Checklist、Artifact Template；
- 导出 Agent-ready Execution Kit；
- 将工作交接给 Codex / Claude Code / GitHub Copilot / Cursor / GitHub Issues / 外部工具或人员。

它默认不负责：

- 自动调用 AI Coding 工具写代码；
- 自动发布生产环境；
- 自动完成 Jira / GitHub Issue 状态流转；
- 替代项目管理工具；
- 作为唯一项目管理系统追踪实际完成情况；
- 替代人工审批。

---

## 21.3 Execution Mode 的语义澄清

RoleUnion 中的 Execution Mode 表达的是：

> 该节点在真实项目中建议采用的人机协作方式。

它不等于 RoleUnion 自身会执行该节点，也不表示 RoleUnion 一定会调用某个 coding agent 或自动推进真实项目任务。

例如：

| Execution Mode | 在 RoleUnion 中的含义 |
|---|---|
| AI Execute + Human Approval | RoleUnion 生成 AI 执行提示词和人工批准清单，不代表系统自动调用 AI 完成任务 |
| AI Autonomous | 该节点可被下游系统自动执行，不代表 MVP 中 RoleUnion 自动执行 |
| Human Only | 该节点不生成 AI 执行 Prompt，只生成人工 checklist 或说明 |

---

## 21.4 MVP 执行边界

MVP 阶段 RoleUnion 只做到：

- 生成蓝图；
- 校验蓝图；
- 生成执行资产；
- 导出执行资产；
- 提供示例 Workflow。

MVP 不做：

- 真实任务运行；
- 外部系统状态回写；
- 多人审批流；
- 自动执行 AI Coding；
- 自动部署。

---

## 21.5 后续扩展方向

后续可以新增 Execution Adapter，例如：

- GitHub Issue 创建；
- Linear Issue 创建；
- Jira Task 创建；
- Codex Prompt Pack 导出；
- Cursor / Claude Code 指令包导出；
- 通过 Agent Adapter 发起受控执行。

但这些仍应被定义为“导出 / 交接 / 适配”，而不是 RoleUnion 自己成为全流程执行系统。RoleUnion 后续可以通过 Agent Adapter 发起受控执行，但这不意味着 RoleUnion 成为通用 Agent Runtime。正确分层是：

```text
RoleUnion
= 规划 + 边界 + 审核 + 成本 + 授权 + 证据回收 + 发布门

Coding Agent / External Agent
= 在受控沙箱或外部工具中执行具体任务
```

```text
Agent 负责执行，RoleUnion 负责决定什么能执行、怎么执行、花多少钱、谁审核、结果能不能进入下游。
```

---

# 22. Workflow Diff & Change Application Rules

## 22.1 章节目标

AI Assisted Edit 是 RoleUnion 的关键交互能力，但 AI 不能直接修改正式 Workflow。

本章定义 Workflow Diff 的结构、应用规则和校验流程。

---

## 22.2 Diff 基本原则

1. AI 对 Workflow 的修改必须先生成 Diff；
2. Diff 必须可读、可审查、可逐条接受或拒绝；
3. Diff 应说明修改原因和影响范围；
4. Diff 应在应用前通过规则校验；
5. Diff 应用后，受影响资产必须重新检查是否 Outdated。

---

## 22.3 Diff 类型

| 类型 | 含义 |
|---|---|
| `add_node` | 新增节点 |
| `update_node` | 修改节点字段 |
| `remove_node` | 删除节点 |
| `add_edge` | 新增连线 |
| `remove_edge` | 删除连线 |
| `add_review_gate` | 新增审核门 |
| `update_execution_mode` | 修改执行模式 |
| `update_artifact_contract` | 修改交付物契约 |
| `mark_asset_outdated` | 标记资产过期 |
| `add_prompt` | 新增 Prompt |
| `update_prompt` | 修改 Prompt |
| `add_checklist` | 新增 Checklist |

---

## 22.4 Diff Patch 结构

```yaml
diff:
  id: "diff-2026-001"
  source: "ai_assisted_edit"
  user_request: "Make this workflow more conservative and add review gates to all high-risk nodes."
  status: "pending_review"
  summary:
    added: 2
    updated: 4
    removed: 0
    warnings: 2
  changes:
    - id: "change-001"
      type: "add_review_gate"
      target_type: "node"
      target_id: "node-architecture-proposal"
      title: "Add Tech Lead Review Gate"
      reason: "Architecture decisions should be reviewed before development begins."
      before: null
      after:
        review_gate:
          name: "Tech Lead Review"
          reviewer_role: "Tech Lead"
          required: true
      validation:
        status: "passed"
      impact:
        prompts_marked_outdated:
          - "prompt-architecture-v1"
```

---

## 22.5 Diff 应用模式

| 模式 | 说明 |
|---|---|
| Apply All | 应用全部通过校验的变更 |
| Apply Selected | 只应用用户勾选的变更 |
| Reject All | 拒绝全部变更 |
| Reject Change | 拒绝单条变更 |

---

## 22.6 Diff 依赖关系

部分 Diff 之间存在依赖。

例如：

- 新增节点后才能新增该节点的 Prompt；
- 新增 Review Gate 后才能生成该 Gate 的 Checklist；
- 删除节点会影响相关 Edge、Prompt、Checklist 和 Artifact。

Diff 结构应允许声明依赖：

```yaml
change_dependencies:
  - change_id: "change-002"
    depends_on:
      - "change-001"
```

如果用户只选择子变更但未选择依赖变更，系统应提示：

> This change depends on another change that has not been selected.

---

## 22.7 Apply 后处理

应用 Diff 后，系统必须执行：

1. 更新 Workflow；
2. 生成新的 Workflow Version；
3. 运行受影响范围的规则校验；
4. 标记受影响 Prompt / Checklist / Artifact 为 Outdated；
5. 记录变更历史；
6. 更新 UI 状态。

---

## 22.8 Reject 处理

用户拒绝 Diff 后，系统应：

- 不修改 Workflow；
- 保留 Diff 历史；
- 允许用户重新生成 Diff；
- 允许用户手动编辑 Workflow。

MVP 不要求用户填写拒绝原因，但可以提供可选输入。

---

# 23. Context Pack Ingestion & Refresh Rules

## 23.1 章节目标

Context Pack 是模型生成蓝图、推荐人机分界和判断风险的重要依据。

本章定义 Context Pack 的来源、摘要、刷新和过期规则。

---

## 23.2 Context 来源

MVP 阶段支持以下来源：

| 来源 | 是否 MVP 必须支持 | 说明 |
|---|---:|---|
| 手动表单录入 | 是 | 组织角色、审批流程、工具栈、风险约束 |
| 文本粘贴 | 是 | 粘贴已有流程、规范、会议纪要 |
| 文件上传 | 可选 | Markdown / txt / doc 内容，MVP 可暂缓 |
| URL 导入 | 否 | 后续扩展 |
| 外部系统导入 | 否 | Jira / GitHub / 飞书等后续扩展 |

---

## 23.3 Context 处理流程

```text
Raw Context Input
      ↓
Context Parsing / Manual Entry
      ↓
Context Summary Generation
      ↓
User Review
      ↓
Context Pack Reviewed
      ↓
Workflow Generation / Refresh
```

---

## 23.4 Context Summary

系统应将用户输入整理为结构化摘要。

摘要包括：

- 已识别角色；
- 审批流程；
- 工具栈；
- 风险约束；
- 缺失上下文；
- 对 Workflow 生成的影响。

Context Summary 必须可编辑。

原因：如果模型摘要错误，后续 Workflow 生成也会错误。

---

## 23.5 原始材料保存策略

MVP 阶段可以不强制保存完整原始材料，但必须至少保存：

- 输入来源类型；
- 标题；
- 摘要；
- 用户确认后的结构化结果。

对于敏感材料，系统应允许用户选择：

- 仅用于本次生成；
- 保存摘要；
- 保存完整原文；
- 不保存。

---

## 23.6 Context 更新后的影响

当 Context Pack 发生以下变化时，系统应触发影响分析：

- 新增或删除组织角色；
- 修改审批流程；
- 修改风险约束；
- 修改工具栈；
- 修改历史流程摘要；
- 修改输出语言。

影响范围：

| Context 变化 | 影响 |
|---|---|
| 角色变化 | Human Owner / Reviewer Role 可能过期 |
| 审批流程变化 | Review Gate / Checklist 可能过期 |
| 风险约束变化 | Risk Level / Execution Mode 可能过期 |
| 工具栈变化 | Export Target / Prompt 可能过期 |
| 输出语言变化 | Prompt Pack / Checklist / Artifact Template 需要重新生成 |

---

## 23.7 Refresh 策略

Context Pack 变化后，系统不应自动覆盖 Workflow。

应提供三个选项：

1. **Mark Affected Items Outdated**  
   只标记受影响对象过期。

2. **Generate Workflow Diff**  
   基于新 Context 生成修改建议。

3. **Regenerate Workflow Draft**  
   重新生成完整 Workflow Draft，但不覆盖当前正式 Workflow。

---

## 23.8 敏感信息与模型调用

用户应能知道 Context 是否会进入模型调用。

MVP 至少需要在模型调用前提示：

> The selected context may be sent to the configured LLM provider to generate workflow recommendations.

对于开源项目，README 和配置说明中也应明确：

- RoleUnion 默认使用用户配置的模型供应商；
- 是否发送上下文取决于用户触发的生成动作；
- 企业或本地部署场景可以选择私有模型或关闭详细日志。

---

# 24. Prompt Generation & Versioning Rules

## 24.1 章节目标

Prompt 是 AI 节点真正进入执行阶段的核心资产。

RoleUnion 必须让 Prompt 可见、可编辑、可版本化、可导出，并与 Node Contract 绑定。

---

## 24.2 Prompt 标准结构

每个 Prompt 至少应包含以下部分：

```md
# Role

# Objective

# Context Required

# Input Materials

# Output Format

# Constraints

# Acceptance Criteria

# Failure Handling
```

---

## 24.3 Prompt 内容要求

### 24.3.1 Role

说明 AI 在该节点中扮演的角色。

示例：

```md
You are an AI assistant helping a product manager draft a structured PRD.
```

### 24.3.2 Objective

说明任务目标。

```md
Generate a PRD draft based on the project goal, context pack summary, target deliverables and risk constraints.
```

### 24.3.3 Context Required

列出执行该 Prompt 必须提供的上下文。

```md
- Project Goal
- Target Deliverables
- Context Pack Summary
- Risk Constraints
- Existing Approval Process
```

### 24.3.4 Output Format

明确输出格式。

```md
Output a Markdown document with the following sections:
1. Background
2. Goals
3. Scope
4. User Stories
5. Acceptance Criteria
6. Risks
7. Open Questions
```

### 24.3.5 Constraints

明确限制条件。

```md
Do not make final architecture decisions.
Mark assumptions explicitly.
Do not remove human review requirements.
```

### 24.3.6 Acceptance Criteria

说明人工审核时应检查什么。

```md
- The PRD contains scope boundaries.
- All assumptions are marked.
- Risks and open questions are listed.
```

### 24.3.7 Failure Handling

说明输出不合格时如何处理。

```md
If required context is missing, list missing inputs instead of fabricating details.
If output is incomplete, return a revision checklist.
```

---

## 24.4 Prompt 变量占位符

Prompt 应支持变量占位符，以便导出时注入实际内容。

示例：

```md
{{project.goal}}
{{context_pack.summary}}
{{node.inputs}}
{{node.outputs}}
{{artifact_contract.required_sections}}
{{review_gate.criteria}}
```

MVP 阶段可以先支持简单变量，不要求复杂模板语言。

---

## 24.5 Prompt 生成来源

每个 Prompt 必须记录生成来源：

- Node ID；
- Node Contract Version；
- Context Pack Version；
- Review Gate Version；
- Artifact Contract Version；
- Model Config；
- 生成时间。

---

## 24.6 Prompt 版本规则

| 触发行为 | 版本处理 |
|---|---|
| 首次生成 Prompt | version = 1 |
| 用户编辑 Prompt | 当前版本增加 revision 或生成新版本 |
| 重新生成 Prompt | 新增 version |
| Node Contract 变化 | 旧 Prompt 标记 Outdated |
| Prompt 进入 Execution Kit | 标记为 Final，并绑定 Kit ID |

---

## 24.7 用户手动修改 Prompt

用户可以直接修改 Prompt。

修改后：

- Prompt 状态变为 `reviewed` 或 `draft`，取决于用户是否标记确认；
- 系统应记录该 Prompt 已被人工修改；
- 后续重新生成 Prompt 时，必须提醒用户可能覆盖人工修改。

提示文案：

```text
This prompt has been manually edited. Regenerating it may overwrite your changes.
```

---

## 24.8 Prompt 缺少上下文时的处理

如果 Prompt 所需 Context 缺失，系统不应编造内容。

应显示：

- Missing Context 列表；
- 是否允许继续生成；
- 缺失上下文对输出质量的影响。

MVP 策略：

| 缺失类型 | 处理方式 |
|---|---|
| 非关键上下文缺失 | 允许生成，但加 Warning |
| 必填输入缺失 | 不允许进入 Final Prompt |
| 审批角色缺失 | 允许生成 Prompt，但 Review Gate 显示角色待确认 |

---

## 24.9 Prompt 与 Human Only 节点

Human Only 节点不得生成 AI 执行 Prompt。

但可以生成：

- Human Operation Checklist；
- Review Checklist；
- Decision Record Template。

---

# 25. Built-in Example Workflow

## 25.1 章节目标

MVP 必须提供一个内置示例 Workflow，让用户首次进入项目时快速理解 RoleUnion 的价值。

这个示例也应作为 GitHub README、Demo 截图和测试数据的默认样例。

---

## 25.2 默认示例项目

```text
AI SaaS Feature MVP
```

项目目标：

```text
Plan and deliver an AI-assisted SaaS feature from idea to launch, while clearly defining where AI drafts, where humans review, and where human approval is mandatory.
```

项目类型：

```text
ai_saas_feature
```

默认风险等级：

```text
medium
```

默认输出语言：

```text
en
```

---

## 25.3 默认阶段

```text
Discovery → Product Design → Technical Design → Development → Testing → Launch
```

---

## 25.4 默认节点

| 阶段 | 节点 | 执行模式 | 风险 | Review Gate |
|---|---|---|---|---|
| Discovery | Project Goal Clarification | Human Lead + AI Assist | Medium | PM Review |
| Discovery | Context Pack Summary | AI Draft + Human Review | Medium | PM Review |
| Product Design | PRD Draft Generation | AI Draft + Human Review | Medium | PM Review |
| Product Design | Scope Review | Human Only | High | Product Lead Approval |
| Technical Design | Architecture Proposal | Human Lead + AI Assist | High | Tech Lead Review |
| Technical Design | API Contract Draft | AI Draft + Human Review | Medium | Tech Lead Review |
| Development | Task Breakdown | AI Execute + Human Approval | Medium | Engineer Approval |
| Development | Code Generation Prompt | AI Execute + Human Approval | High | Code Review |
| Testing | Test Case Generation | AI Draft + Human Review | Medium | QA Review |
| Testing | QA Review | Human Only | High | QA Lead Approval |
| Launch | Launch Checklist | AI Draft + Human Review | High | Release Manager Review |
| Launch | Production Approval | Human Only | High | Release Manager Approval |

---

## 25.5 默认连线

```text
Project Goal Clarification
  → Context Pack Summary
  → PRD Draft Generation
  → Scope Review
  → Architecture Proposal
  → API Contract Draft
  → Task Breakdown
  → Code Generation Prompt
  → Test Case Generation
  → QA Review
  → Launch Checklist
  → Production Approval
```

---

## 25.6 示例中必须展示的产品能力

该示例必须覆盖以下能力：

1. 至少 5 种 Execution Mode 中的 4 种；
2. 至少 3 个 High Risk 节点；
3. 至少 3 个 Review Gate；
4. 至少 3 个 AI Prompt；
5. 至少 3 个 Human Checklist；
6. 至少 1 个 Prompt Outdated 示例；
7. 至少 1 个 Validation Warning；
8. 至少 1 个可应用的 Workflow Diff；
9. 至少 1 个 agent-ready task list 示例；
10. 至少 1 个 AI coding prompt；
11. 至少 1 个人工 review checklist；
12. 至少 1 个 risk gate；
13. 至少 1 个 output contract；
14. 至少 1 个可以导出给 GitHub Issue / Codex / Claude Code 的任务样例。

---

## 25.7 示例 Prompt

示例节点：PRD Draft Generation。

```md
# Role

You are an AI assistant helping a product manager draft a structured PRD.

# Objective

Generate a PRD draft for the AI SaaS Feature MVP based on the project goal, context pack summary and target deliverables.

# Context Required

- Project Goal
- Context Pack Summary
- Target Deliverables
- Risk Constraints

# Output Format

Output a Markdown PRD with the following sections:

1. Background
2. Goals
3. Users
4. Scope
5. User Stories
6. Acceptance Criteria
7. Risks
8. Open Questions

# Constraints

- Do not make final business decisions.
- Mark assumptions clearly.
- Keep human review requirements visible.

# Acceptance Criteria

- Scope boundaries are clear.
- Risks are listed.
- Open questions are not hidden.
- The document is ready for PM review.

# Failure Handling

If required context is missing, list missing inputs instead of inventing details.
```

## 25.8 示例 Agent-ready Task

示例节点：Code Generation Prompt。该任务样例应可以导出为 GitHub Issue，也可以作为 Codex / Claude Code 的执行前任务说明。

```md
## Agent Task: Implement Feature Flag Guard

- Phase: Development
- Source Node: Code Generation Prompt
- Execution Mode: AI Execute + Human Approval
- Target: Codex / Claude Code / GitHub Issue
- Required Context:
  - workflow_spec.yaml
  - API Contract Draft
  - Coding standards
  - Risk constraints
- Output Contract:
  - Pull request with implementation notes
  - Unit tests for enabled and disabled states
  - No production rollout changes
- Review Gate:
  - Engineer Approval and Code Review required before merge
- Acceptance Criteria:
  - Feature flag defaults to off
  - Existing behavior is preserved when disabled
  - Tests pass locally
  - Security-sensitive paths are not modified without explicit approval
```

---

# 26. MVP Acceptance Criteria

## 26.1 章节目标

本章定义 RoleUnion MVP 的产品验收标准。

MVP 不要求功能完整，但必须证明 RoleUnion 不是普通流程图工具，而是一个可生成、校验、编辑和导出人机分工蓝图与 Agent-ready Execution Kit 的系统。

---

## 26.2 创建与生成验收标准

1. 用户可以创建一个项目；
2. 用户可以输入项目目标、项目类型、目标交付物和风险等级；
3. 用户可以选择 Quick Start 或 Organization-Aware Setup；
4. 用户可以在 Quick Start 模式下生成 Workflow Draft；
5. 用户可以在 Organization-Aware 模式下补充 Context Pack；
6. 系统可以基于 Project + Context Pack + Template 生成初始 Workflow Draft；
7. 初始 Workflow Draft 应至少包含阶段、节点、连线、执行模式和 Review Gate 建议。

---

## 26.3 Studio 验收标准

1. 用户可以在 Studio 中查看完整 Workflow；
2. Workflow 应按阶段展示，而不是只显示散点节点；
3. 用户可以点击节点查看详情；
4. 用户可以编辑节点名称、目标、输入、输出、执行模式、风险等级；
5. 用户可以查看每个节点的人机协作模式；
6. 高风险节点必须有明显标识；
7. AI 节点必须显示 Prompt 状态；
8. 节点应显示是否存在 Review Gate；
9. 用户可以手动新增、删除或调整节点；
10. 用户可以运行 Validate。

---

## 26.4 AI Assisted Edit 验收标准

1. 用户可以通过自然语言提出 Workflow 修改请求；
2. 系统必须生成 Diff，而不是直接修改正式 Workflow；
3. Diff 必须显示新增、修改、删除、警告和影响范围；
4. 用户可以逐条接受或拒绝 Diff；
5. 用户应用 Diff 后，系统必须重新校验受影响对象；
6. Diff 导致的 Prompt / Checklist 过期必须被标记。

---

## 26.5 Execution Assets 验收标准

1. AI 节点可以生成 Prompt Draft；
2. Prompt 可查看、可编辑、可复制；
3. Prompt 必须包含 Role、Objective、Context Required、Output Format、Acceptance Criteria；
4. Human Only 节点不得生成 AI 执行 Prompt；
5. 有 Review Gate 的节点可以生成 Checklist；
6. Checklist 可查看、可编辑、可导出；
7. Artifact Template 可查看；
8. Prompt / Checklist 应展示状态：Draft、Reviewed、Final、Outdated；
9. 节点输入输出变化后，相关 Prompt 应标记 Outdated。

---

## 26.6 Validation 验收标准

1. 高风险节点无 Review Gate 时，系统必须提示 Error；
2. AI 节点无输出格式时，系统必须提示 Error；
3. AI 节点无验收标准时，系统必须提示 Error；
4. Human Only 节点存在 AI Prompt 时，系统必须提示 Error；
5. Prompt Outdated 时，系统必须提示 Warning；
6. Validate 结果应显示 Error、Warning、Suggestion 三类；
7. 有 Blocking Error 的 Workflow 不应进入 Final。

---

## 26.7 Export 验收标准

1. 用户可以生成 Execution Kit Preview；
2. Execution Kit 至少包含 Workflow Spec、Agent Task List / Task List、Prompt Pack、Review Checklist；
3. 用户可以导出 Markdown；
4. 用户可以导出 YAML 或 JSON Workflow Spec；
5. 导出前如存在 Error / Warning，系统必须提示；
6. 用户可以选择导出 Draft Kit 或 Final Kit；
7. Final Kit 不允许包含 Blocking Error；
8. 每个 Execution Kit 必须绑定 Workflow Snapshot。

---

## 26.8 Model Access 验收标准

1. MVP 必须支持 OpenAI-compatible 模型配置；
2. `.env.example` 必须包含模型供应商、API Key、Base URL、默认模型、规划模型、Prompt 模型、Diff 模型等配置；
3. 模型调用失败时，用户仍可手动编辑 Workflow；
4. 模型输出必须经过结构化解析和规则校验；
5. 模型生成结果默认是 Draft，不得直接成为 Final；
6. 用户应能看到至少摘要级模型调用状态。

---

## 26.9 示例项目验收标准

1. 系统必须内置 `AI SaaS Feature MVP` 示例项目；
2. 示例项目应包含至少 6 个阶段；
3. 示例项目应包含至少 12 个节点；
4. 示例项目应包含至少 4 种 Execution Mode；
5. 示例项目应包含 Prompt、Checklist、Artifact Template 示例；
6. 示例项目应可用于生成 Agent-ready Execution Kit；
7. 示例项目应可用于 README / Demo 展示；
8. 示例项目应包含至少 1 个可导出给 GitHub Issue / Codex / Claude Code 的任务样例。

---

## 26.10 MVP 成功标准

RoleUnion MVP 完成后，应满足以下最终判断：

1. 用户能在 3 分钟内创建项目并生成一版人机分工 Workflow Draft；
2. 用户能在 5 秒内看懂哪些节点由人、AI 或人机协作完成；
3. 用户能点击任意 AI 节点查看对应 Prompt；
4. 用户能看到高风险节点为什么需要人工审核；
5. 用户能通过 AI Edit 生成 Diff，并手动确认是否应用；
6. 用户能导出一份 Agent-ready Execution Kit；
7. 开发者能基于示例 Workflow 验证 CLI / Studio / Export 的主链路；
8. GitHub 用户能通过 README 和示例项目理解 RoleUnion 与普通流程图工具、Agent 框架和项目管理工具的区别；
9. README 能清晰说明 RoleUnion 是 AI Agent 项目启动与治理层；
10. 示例项目能导出 Agent-ready Execution Kit；
11. 用户能理解 RoleUnion 与 Codex / Claude Code / GitHub Copilot / Cursor 的关系；
12. Community Core 不包含完整 Pro templates；
13. Commercial assets 不应被误标记为 Apache-2.0 开源资产。

---


