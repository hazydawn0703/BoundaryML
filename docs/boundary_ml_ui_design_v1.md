# BoundaryML UI 设计方案 v0.1

> 适用范围：本文基于《BoundaryML PRD v0.1》产出，用于指导 MVP 阶段的前端页面设计、交互设计与视觉组件设计。本文不定义数据库结构，不限定具体前端技术栈，重点定义用户界面、信息架构、页面布局、组件状态和关键交互。

---

## 1. UI 设计目标

BoundaryML 的 UI 不应该做成普通项目管理后台，也不应该做成纯 AI Chat 工具。

它的核心界面应表达一个清晰定位：

> 这是一个用于生成、编辑、审核、导出“人机协作边界蓝图”的 Studio。

因此 UI 设计需要同时满足四个目标：

1. **可视化**：用户能直观看到项目从启动到交付的完整 Workflow。
2. **可控**：用户能明确控制每个节点由人、AI 或人机协作完成。
3. **可解释**：系统推荐执行模式、Review Gate、Prompt 时，需要让用户看到原因。
4. **可交接**：最终产出不是停留在图上，而是能导出 Execution Kit。

---

## 2. 产品整体信息架构

MVP 阶段建议采用以下主导航结构：

```text
BoundaryML
├─ Projects 项目列表
├─ Studio 工作流编排台
│  ├─ Workflow Canvas
│  ├─ Node Detail Panel
│  ├─ AI Edit Panel
│  └─ Diff Review Drawer
├─ Execution Assets 执行资产
│  ├─ Prompt Pack
│  ├─ Review Checklist
│  └─ Artifact Templates
├─ Export 导出
│  ├─ Execution Kit Preview
│  ├─ Markdown Export
│  ├─ YAML / JSON Export
│  └─ Prompt / Checklist Export
└─ Settings 设置
   ├─ Model Access
   ├─ Boundary Rules
   └─ Export Preferences
```

MVP 可以先把 Settings 弱化为二级入口，主路径保持：

```text
Projects → Create Project → Context Pack → Generate Workflow → Studio → Execution Assets → Export
```

---

## 3. 全局布局设计

### 3.1 Web App 基础框架

建议采用典型 SaaS 工作台布局：

```text
┌─────────────────────────────────────────────────────────────┐
│ Top Bar                                                     │
│ Logo / Project Switcher / Model Status / Export / User      │
├───────────────┬─────────────────────────────────────────────┤
│ Sidebar       │ Main Content                                │
│ Projects      │                                             │
│ Studio        │                                             │
│ Assets        │                                             │
│ Export        │                                             │
│ Settings      │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

### 3.2 Top Bar

Top Bar 用于承载当前项目的全局状态。

建议元素：

| 区域 | 内容 |
|---|---|
| 左侧 | BoundaryML Logo、当前项目名称、项目状态 |
| 中间 | 当前 Workflow 状态：Draft / Reviewed / Final |
| 右侧 | Model Connected 状态、Generate Execution Kit、Export、用户入口 |

状态展示示例：

```text
Project: AI SaaS MVP Planning  ·  Workflow Draft  ·  12 Nodes  ·  4 AI Nodes  ·  3 Review Gates
```

### 3.3 Sidebar

Sidebar 需要保持克制，不要做成复杂后台。

建议导航：

```text
Projects
Studio
Execution Assets
Export
Settings
```

每个项目内部可显示当前进度：

```text
Setup        ✓
Context Pack 70%
Workflow     Draft
Assets       8 Drafts
Export       Not Generated
```

---

## 4. 视觉语言

### 4.1 设计关键词

BoundaryML 的视觉风格建议是：

- 专业；
- 结构化；
- 工程感；
- 可信赖；
- 不花哨；
- 有 AI 能力，但不做“魔法感”过强的界面。

### 4.2 色彩策略

核心不是炫酷，而是让用户一眼看清人机边界。

建议把颜色优先用于 Execution Mode，而不是装饰。

| 执行模式 | 建议颜色语义 | UI 表现 |
|---|---|---|
| Human Only | 深灰 / 黑 | 严肃、人工兜底 |
| AI Draft + Human Review | 蓝色 | AI 初稿 + 人审 |
| Human Lead + AI Assist | 紫色 | 人主导，AI 辅助 |
| AI Execute + Human Approval | 橙色 | AI 执行，需要批准 |
| AI Autonomous | 绿色 | 低风险自动化 |

风险等级颜色：

| 风险等级 | 颜色 |
|---|---|
| Low | 绿色 |
| Medium | 黄色 / 琥珀色 |
| High | 红色 |

状态颜色：

| 状态 | 颜色语义 |
|---|---|
| Draft | 灰蓝 |
| Reviewed | 蓝 |
| Applied | 绿 |
| Rejected | 红 |
| Outdated | 橙 |
| Failed Validation | 红 |

### 4.3 字体与密度

建议默认桌面端优先。

- 页面标题：20–24px；
- 分区标题：16–18px；
- 表格 / 节点正文：13–14px；
- 标签 / 状态：12px；
- Canvas 内节点不宜堆过多文字，关键信息通过标签展示。

---

## 5. 页面一：项目列表页 Projects

### 5.1 页面目标

让用户快速进入已有项目，或创建一个新的 BoundaryML 项目。

### 5.2 页面布局

```text
┌─────────────────────────────────────────────────────┐
│ Projects                              + New Project │
│ Generate human-AI workflow boundaries before build. │
├─────────────────────────────────────────────────────┤
│ Filter: All / Draft / Final / Has Execution Kit      │
│ Search projects...                                  │
├─────────────────────────────────────────────────────┤
│ Project Card Grid / Table                           │
└─────────────────────────────────────────────────────┘
```

### 5.3 项目卡片信息

每个项目卡片展示：

- 项目名称；
- 项目类型；
- 风险等级；
- Workflow 状态；
- 节点数量；
- AI 节点数量；
- Review Gate 数量；
- 是否已生成 Execution Kit；
- 最近更新时间。

示例卡片：

```text
AI SaaS MVP Planning
SaaS · Medium Risk

Workflow: Draft
Nodes: 18
AI Nodes: 7
Review Gates: 5
Execution Kit: Not Generated

Updated 2 hours ago
[Open Studio]
```

### 5.4 空状态

首次进入时不要只显示空表格，而要解释产品价值。

空状态文案：

```text
Start with a project goal.
BoundaryML will generate a draft workflow, recommend human-AI execution modes, and help you export an execution kit.

[Create First Project]
```

---

## 6. 页面二：项目创建页 Create Project

### 6.1 页面目标

以最低成本收集生成初始蓝图所需信息，同时支持用户选择 Quick Start 或 Organization-Aware Setup。

### 6.2 推荐交互：分步表单

```text
Step 1  Project Basics
Step 2  Delivery Scope
Step 3  Risk & AI Scope
Step 4  Setup Mode
```

### 6.3 Step 1：Project Basics

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| Project Name | Input | 项目名称 |
| Project Goal | Textarea | 必填，项目目标 |
| Project Type | Select | SaaS / Internal Tool / Legacy Modernization / AI Feature / Other |
| Current Stage | Select | Idea / Planning / Development / Testing / Before Launch |

### 6.4 Step 2：Delivery Scope

目标交付物建议用多选 Checkbox Card。

选项：

- PRD；
- Prototype；
- Technical Design；
- API Contract；
- Source Code；
- Test Cases；
- Test Report；
- Launch Plan；
- Retrospective Report。

### 6.5 Step 3：Risk & AI Scope

字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| Risk Level | Segmented Control | Low / Medium / High |
| Expected AI Scope | Multi Select | PRD / Code / Test / Docs / Review / Report |
| Sensitive Areas | Checkbox | Customer Data / Production Release / Payment / Legal / Security |

### 6.6 Step 4：Setup Mode

使用两个大卡片让用户选择：

```text
┌──────────────────────────────┐
│ Quick Start                  │
│ Use project goal and risk    │
│ level to generate a generic  │
│ workflow.                    │
│                              │
│ Best for: MVP / demo / early │
│ planning                     │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Organization-Aware Setup     │
│ Add roles, approval process, │
│ tools and risk constraints   │
│ for a more realistic plan.   │
│                              │
│ Best for: enterprise / team  │
│ delivery                     │
└──────────────────────────────┘
```

主按钮：

- Quick Start：`Generate Workflow Draft`
- Organization-Aware：`Continue to Context Pack`

---

## 7. 页面三：Context Pack 配置页

### 7.1 页面目标

让用户补充组织角色、审批流程、工具栈、风险约束和历史流程材料，以便生成更贴近真实组织的 Workflow。

### 7.2 页面布局

采用左右结构：

```text
┌───────────────────────────────┬──────────────────────────────┐
│ Context Input                 │ Context Summary              │
│                               │                              │
│ Roles                         │ System extracted:            │
│ Approval Process              │ - Roles                      │
│ Tool Stack                    │ - Review Gates candidates    │
│ Risk Constraints              │ - Risk warnings              │
│ Historical Process            │ - Missing context            │
│                               │                              │
│ [Generate / Refresh Summary]  │ [Generate Workflow Draft]    │
└───────────────────────────────┴──────────────────────────────┘
```

### 7.3 Context Input 区域

建议分为 5 个 Accordion：

1. Team Roles；
2. Approval Process；
3. Tool Stack；
4. Risk Constraints；
5. Historical Process Materials。

### 7.4 Team Roles 录入

推荐用可增删表格：

```text
Role Name        Responsibility              Required in Review?
Product Manager  Requirement definition      Yes
Tech Lead        Architecture decisions      Yes
QA Lead          Test strategy               Yes
Security Owner   Customer data review        Yes
```

### 7.5 Approval Process 录入

MVP 不需要做复杂 BPMN，可以用文本 + 简单步骤列表。

```text
Approval Step        Owner          Trigger
PRD Review           Product Lead   Before development
Architecture Review  Tech Lead      Before coding
Security Review      Security Owner If customer data involved
Launch Approval      PM / Ops       Before production release
```

### 7.6 Context Summary

系统生成摘要后，右侧展示：

- 已识别角色；
- 可能影响人机分界的规则；
- 建议添加的 Review Gate；
- 缺失上下文提醒；
- 生成 Workflow 前的风险提示。

示例：

```text
Context Summary

Recognized Roles
- Product Manager
- Tech Lead
- QA Lead
- Security Owner

Suggested Review Gates
- Architecture Review before coding
- Security Review for customer data nodes
- Launch Approval before production release

Missing Context
- No export target specified
- No AI coding tool selected
```

---

## 8. 页面四：Workflow Studio 主工作台

### 8.1 页面目标

这是 BoundaryML 的核心页面。

用户需要在这里完成三件事：

1. 查看完整人机协作 Workflow；
2. 精确编辑节点、连线、阶段和执行模式；
3. 通过 AI 对话发起批量修改，并在 Diff Review 后应用。

### 8.2 推荐主布局：三栏工作台

```text
┌────────────────────────────────────────────────────────────────────┐
│ Studio Top Toolbar                                                  │
├───────────────┬───────────────────────────────────┬────────────────┤
│ Left Panel    │ Workflow Canvas                   │ Right Panel    │
│               │                                   │                │
│ Stage List    │ Phase lanes + Nodes + Connections │ Node Detail /  │
│ Filters       │                                   │ AI Edit Panel  │
│ Legend        │                                   │                │
└───────────────┴───────────────────────────────────┴────────────────┘
```

建议宽度：

| 区域 | 宽度 |
|---|---:|
| Left Panel | 240px |
| Canvas | 自适应 |
| Right Panel | 380–460px |

### 8.3 Studio Top Toolbar

工具栏内容：

```text
[Back] Project Name / Workflow Draft

View: Canvas | Table | Risk
Filter: All modes | Human Only | AI Nodes | High Risk

[Add Node] [Auto Layout] [AI Edit] [Validate] [Generate Execution Kit]
```

按钮优先级：

- 主按钮：Generate Execution Kit；
- 次按钮：Validate；
- AI Edit 可以用高亮描边按钮，不要压过主流程。

### 8.4 Left Panel

Left Panel 包含：

1. 阶段列表；
2. 执行模式过滤；
3. 风险过滤；
4. 图例说明；
5. Workflow 验证状态。

示例：

```text
Phases
✓ Discovery      4 nodes
! Design         5 nodes
✓ Development    6 nodes
! Testing        3 nodes
✓ Launch         2 nodes

Execution Mode
□ Human Only
□ AI Draft + Human Review
□ Human Lead + AI Assist
□ AI Execute + Human Approval
□ AI Autonomous

Validation
2 warnings
1 failed rule
```

### 8.5 Workflow Canvas 表达方式

建议采用横向阶段泳道，而不是自由散点图。

原因：BoundaryML 表达的是项目生命周期，不是任意知识图谱。

推荐结构：

```text
Discovery → Design → Development → Testing → Launch → Review
```

Canvas 示意：

```text
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Discovery   │   │ Design      │   │ Development │
│             │   │             │   │             │
│ [Node] ─────┼──▶│ [Node] ─────┼──▶│ [Node]      │
│ [Node]      │   │ [Node]      │   │ [Node]      │
└─────────────┘   └─────────────┘   └─────────────┘
```

### 8.6 阶段 Phase Card

每个阶段展示：

- 阶段名称；
- 节点数量；
- 高风险节点数量；
- 未完成配置数量；
- 阶段状态。

### 8.7 节点卡片 Node Card

节点卡片是最关键的 UI 组件。

建议结构：

```text
┌────────────────────────────────────┐
│ PRD Draft Generation        Draft  │
│ AI Draft + Human Review            │
│                                    │
│ Input: Project Goal, Context Pack  │
│ Output: PRD Draft                  │
│                                    │
│ PM Review Gate       Medium Risk   │
└────────────────────────────────────┘
```

节点卡片必须展示：

| 信息 | 是否必须展示 |
|---|---:|
| 节点名称 | 必须 |
| 执行模式 | 必须 |
| 状态 | 必须 |
| 风险等级 | 必须 |
| 是否有 Review Gate | 必须 |
| Prompt 状态 | AI 节点必须 |
| 输入输出摘要 | 建议展示 |
| 责任角色 | 建议展示 |

### 8.8 节点卡片状态

| 状态 | UI 表现 |
|---|---|
| Draft | 节点右上角 Draft 标签 |
| Reviewed | 蓝色 Reviewed 标签 |
| Applied | 绿色 Applied 标签 |
| Outdated | 橙色 Outdated 标签，并提示相关 Prompt 需更新 |
| Failed Validation | 红色边框和错误图标 |

### 8.9 节点右键 / 快捷操作

节点 Hover 或右键显示快捷菜单：

```text
Edit Node
Change Execution Mode
Generate Prompt
Generate Checklist
Add Review Gate
Duplicate Node
Delete Node
Explain Recommendation
```

### 8.10 连线 Connection

连线表达上下游依赖。

连线 Hover 后显示：

- 上游输出；
- 下游输入；
- 是否有 Review Gate；
- 是否存在缺失输入。

如果 Review Gate 位于节点之间，可以在连线上展示小型 Gate 图标：

```text
[AI Draft Node] ── ◆ PM Review ──▶ [Development Node]
```

---

## 9. 右侧面板：Node Detail Panel

### 9.1 页面目标

点击节点后，右侧面板展示该节点的完整契约，让用户编辑节点目标、输入输出、执行模式、责任角色、Review Gate、Prompt 和验收标准。

### 9.2 面板结构

建议使用 Tabs：

```text
Node Detail
├─ Overview
├─ Boundary
├─ Inputs / Outputs
├─ Review Gate
├─ Execution Assets
└─ History
```

### 9.3 Overview Tab

字段：

- Node Name；
- Node Goal；
- Phase；
- Status；
- Risk Level；
- Upstream Nodes；
- Downstream Nodes。

### 9.4 Boundary Tab

这里是人机分界的核心配置。

字段：

| 字段 | 类型 |
|---|---|
| Execution Mode | Select / Radio Card |
| Human Owner Role | Select |
| AI Role | Textarea / Generated Suggestion |
| Recommendation Reason | Readonly Explanation |
| Boundary Rule Warnings | Alert |

Execution Mode 建议使用 Radio Card，而不是普通下拉框。

```text
○ Human Only
  Only humans can complete this node.

● AI Draft + Human Review
  AI generates a draft. Human must review before downstream.

○ Human Lead + AI Assist
  Human owns the decision. AI provides support.

○ AI Execute + Human Approval
  AI executes the node. Human approves output before applying.

○ AI Autonomous
  AI can complete this node within constraints.
```

### 9.5 Inputs / Outputs Tab

展示结构：

```text
Required Inputs
- Project Goal
- Context Pack Summary
- Existing PRD Notes

Expected Outputs
- PRD Draft
- Requirement List
- Open Questions

Artifact Contract
- Format: Markdown
- Required sections: Background, Goal, Scope, Acceptance Criteria
```

支持用户编辑，也支持按钮：

- Regenerate Contract；
- Validate Inputs；
- Mark as Reviewed。

### 9.6 Review Gate Tab

如果节点需要审核，在这里配置：

- Review Gate Name；
- Reviewer Role；
- Review Criteria；
- Pass Condition；
- Reject Condition；
- Allow AI Revision；
- Required Materials。

如果高风险节点没有 Review Gate，显示强提醒：

```text
This node is marked as high risk but has no Review Gate.
Boundary Rules recommend adding a human approval step before downstream execution.

[Add Review Gate]
```

### 9.7 Execution Assets Tab

AI 节点必须出现这个 Tab。

Human Only 节点不展示 AI Prompt，而展示 Human Checklist。

AI 节点结构：

```text
Execution Assets

AI Role
You are responsible for generating a structured PRD draft based on the project goal and context pack.

Prompt Draft     Status: Draft / Outdated
[Prompt Editor]

Context Required
- Project Goal
- Target Deliverables
- Risk Constraints

Output Format
Markdown with required sections...

Acceptance Criteria
- Covers all target deliverables
- Lists assumptions
- Marks open questions

Failure Handling
If output is incomplete, return to AI revision once, then escalate to human owner.

Export Target
Prompt Pack / Markdown / AI Coding Tool Input
```

操作按钮：

- Generate Prompt；
- Regenerate Prompt；
- Mark Reviewed；
- Copy Prompt；
- Open in Execution Assets。

### 9.8 History Tab

展示该节点的变更历史：

```text
10:12 AI suggested execution mode: AI Draft + Human Review
10:14 User changed risk level from Low to Medium
10:16 Prompt marked Outdated because output contract changed
10:20 User marked Prompt Reviewed
```

---

## 10. AI 修改对话面板 AI Edit Panel

### 10.1 页面目标

让用户用自然语言提出复杂修改意图，但 AI 不直接改正式 Workflow，而是生成 Diff。

### 10.2 触发方式

入口：

- Studio 顶部按钮 `AI Edit`；
- 右侧面板中的 `Ask AI to modify this node`；
- Canvas 空白处快捷入口。

### 10.3 面板布局

可作为右侧 Drawer 或右侧 Tab。

```text
AI Assisted Edit

Describe the change you want to make:
[Text Area]

Suggested prompts:
- Make this workflow more conservative
- Add review gates to all high-risk nodes
- Add testing nodes before launch
- Generate prompts for all AI execution nodes

[Generate Diff]
```

### 10.4 AI 建议生成后

不要直接修改 Canvas。

先显示摘要：

```text
AI generated a workflow diff:

+ 2 nodes added
~ 4 nodes updated
+ 3 review gates added
! 2 prompts will be marked outdated

[Review Diff]
```

---

## 11. Diff Review 设计

### 11.1 页面目标

防止 AI 越权修改正式 Workflow。

用户必须能看清：新增了什么、删除了什么、修改了什么、会影响什么。

### 11.2 推荐形式：底部 / 右侧大 Drawer

```text
┌─────────────────────────────────────────────────────┐
│ Review AI Workflow Diff                             │
│ +2 Added  ~4 Updated  -0 Removed  !2 Warnings        │
├─────────────────────────────────────────────────────┤
│ [ ] Add Node: Code Review Checklist Generation       │
│ [ ] Add Review Gate: Security Review                 │
│ [ ] Update Execution Mode: Launch Approval           │
│ [ ] Mark Prompt Outdated: PRD Draft Generation       │
├─────────────────────────────────────────────────────┤
│ [Reject All] [Apply Selected] [Apply All]            │
└─────────────────────────────────────────────────────┘
```

### 11.3 Diff 类型

| 类型 | UI 标识 |
|---|---|
| Added | 绿色 + |
| Updated | 蓝色 ~ |
| Removed | 红色 - |
| Warning | 橙色 ! |
| Failed Validation | 红色错误块 |

### 11.4 Diff Detail

点击每条 Diff 展开详情：

```text
Execution Mode changed

Before:
Human Lead + AI Assist

After:
AI Execute + Human Approval

Reason:
The node output is structured and can be generated by AI, but requires Tech Lead approval before downstream use.

Rule Check:
Passed

Impact:
Prompt needs regeneration.
```

---

## 12. Execution Assets 页面

### 12.1 页面目标

集中管理所有 AI 节点 Prompt、人工审核 Checklist 和 Artifact Templates。

这是 BoundaryML 区别于普通流程图工具的核心页面之一。

### 12.2 页面布局

```text
┌────────────────────────────────────────────────────┐
│ Execution Assets                                   │
│ Prompts / Checklists / Artifact Templates          │
├────────────────────────────────────────────────────┤
│ Filters: Phase / Execution Mode / Status / Outdated│
├───────────────┬────────────────────────────────────┤
│ Asset List    │ Asset Detail Preview               │
└───────────────┴────────────────────────────────────┘
```

### 12.3 Asset List

列表字段：

| 字段 | 说明 |
|---|---|
| Asset Name | 资产名称 |
| Type | Prompt / Checklist / Template |
| Node | 来源节点 |
| Phase | 所属阶段 |
| Status | Draft / Reviewed / Final / Outdated |
| Model | 生成模型 |
| Updated | 更新时间 |

### 12.4 Asset Detail

Prompt 详情展示：

```text
Prompt: Generate PRD Draft
Node: PRD Draft Generation
Status: Draft
Model: gpt-xxx-planning
Generated from: Node Contract v3

[Prompt Editor]

Context Required
[Checklist]

Output Format
[Markdown / JSON Preview]

Acceptance Criteria
[Checklist]

[Regenerate] [Mark Reviewed] [Copy] [Export]
```

Checklist 详情展示：

```text
Review Checklist: PM Review for PRD Draft
Reviewer Role: Product Lead

Criteria
□ Does the PRD define target users?
□ Does the PRD define scope boundaries?
□ Does the PRD list assumptions and risks?
□ Are AI-generated parts clearly marked?

[Mark Reviewed] [Export]
```

### 12.5 Outdated 提醒

当节点输入输出、Review Gate 或 Artifact Contract 变化后，相关资产需标记 Outdated。

UI 提醒：

```text
This prompt is outdated because the node output contract changed after it was generated.

[View Change] [Regenerate Prompt] [Keep Manually]
```

---

## 13. Export 页面

### 13.1 页面目标

让用户选择导出内容，预览 Execution Kit，并导出为通用格式。

### 13.2 页面布局

```text
┌────────────────────────────────────────────────────┐
│ Export Execution Kit                               │
│ Generate a portable package for project handoff.   │
├─────────────────────┬──────────────────────────────┤
│ Export Options      │ Preview                      │
│                     │                              │
│ □ Workflow Spec     │ Markdown / YAML / JSON View  │
│ □ Task List         │                              │
│ □ Prompt Pack       │                              │
│ □ Review Checklist  │                              │
│ □ Artifact Templates│                              │
│ □ Risk Report       │                              │
│                     │                              │
│ Format: Markdown    │                              │
│ [Generate Preview]  │                              │
│ [Export]            │                              │
└─────────────────────┴──────────────────────────────┘
```

### 13.3 导出前校验

如果 Workflow 未通过校验，不应阻止导出所有内容，但要明确提示。

```text
Export Warning

This Execution Kit contains unresolved issues:
- 1 high-risk node has no Review Gate
- 2 AI prompts are outdated
- 1 AI node has no acceptance criteria

[Export Anyway] [Fix Issues]
```

### 13.4 Execution Kit 内容结构

预览中建议按以下结构：

```text
Execution Kit
├─ 01_workflow_spec.yaml
├─ 02_task_list.md
├─ 03_prompt_pack.md
├─ 04_review_checklists.md
├─ 05_artifact_templates.md
└─ 06_risk_report.md
```

---

## 14. Settings：Model Access 配置页

### 14.1 页面目标

让用户知道当前蓝图由哪个模型能力生成，并能配置模型接入参数。

MVP 如果暂时只用 env 文件，也建议在 UI 中展示只读状态。

### 14.2 页面布局

```text
Model Access

Provider: OpenAI-compatible
Base URL: ********
Default Model: ********
Planning Model: ********
Prompt Model: ********
Diff Model: ********
Structured Output: Enabled
Log Level: Summary

[Test Connection]
```

### 14.3 调用日志摘要

可展示最近调用：

```text
Recent Model Calls

Workflow Draft Generation   Success   10:12   Applied
Prompt Generation           Success   10:18   Draft
Workflow Diff Generation    Failed    10:21   Validation Error
```

---

## 15. 核心组件规范

### 15.1 Execution Mode Badge

统一显示执行模式。

```text
[Human Only]
[AI Draft + Human Review]
[Human Lead + AI Assist]
[AI Execute + Human Approval]
[AI Autonomous]
```

Badge 需要在以下位置复用：

- Node Card；
- Node Detail；
- Execution Assets；
- Diff Review；
- Export Preview。

### 15.2 Risk Badge

```text
[Low Risk]
[Medium Risk]
[High Risk]
```

高风险 Badge 需要显著，但不要满屏红色。

### 15.3 Status Badge

```text
[Draft]
[Reviewed]
[Applied]
[Rejected]
[Outdated]
[Failed Validation]
```

### 15.4 Review Gate Chip

```text
◆ PM Review
◆ Tech Lead Approval
◆ Security Review
◆ Launch Approval
```

用于节点卡片和连线。

### 15.5 Prompt Status Indicator

AI 节点卡片上建议展示：

```text
Prompt: Draft
Prompt: Reviewed
Prompt: Outdated
Prompt: Missing
```

### 15.6 Validation Alert

规则校验反馈统一分为三类：

| 类型 | 含义 |
|---|---|
| Error | 必须处理，否则不能 Final |
| Warning | 可导出但应提醒 |
| Suggestion | 优化建议 |

---

## 16. 关键交互流程

### 16.1 Quick Start 流程

```text
Projects
→ Create Project
→ 填写项目目标、类型、交付物、风险等级
→ 选择 Quick Start
→ Generate Workflow Draft
→ 进入 Studio
→ 用户确认 / 编辑 Workflow
→ 配置节点
→ Generate Execution Kit
→ Export
```

### 16.2 Organization-Aware 流程

```text
Projects
→ Create Project
→ 选择 Organization-Aware Setup
→ Context Pack
→ 录入角色、审批流程、工具栈、风险约束
→ Generate Context Summary
→ Generate Workflow Draft
→ Studio
→ Diff / Edit / Validate
→ Execution Assets
→ Export
```

### 16.3 AI Assisted Edit 流程

```text
Studio
→ 点击 AI Edit
→ 输入自然语言修改要求
→ Generate Diff
→ 查看 Diff Review
→ 逐条接受 / 拒绝
→ Apply Selected
→ Workflow 更新
→ 受影响 Prompt 标记 Outdated
```

### 16.4 节点 Prompt 生成流程

```text
点击 AI 节点
→ Node Detail / Execution Assets
→ Generate Prompt
→ 查看 Prompt Draft
→ 人工编辑
→ Mark Reviewed
→ Generate Execution Kit 时进入 Final Prompt Pack
```

---

## 17. MVP 页面优先级

### P0：必须做

1. Projects 项目列表页；
2. Create Project 项目创建页；
3. Context Pack 基础配置页；
4. Workflow Studio；
5. Node Detail Panel；
6. AI Edit Panel；
7. Diff Review；
8. Execution Assets 页面；
9. Export 页面。

### P1：建议做

1. Model Access 只读配置页；
2. Workflow Table View；
3. Risk View；
4. 节点历史记录；
5. Prompt Outdated 影响提示。

### P2：后续做

1. 多人协作；
2. 企业权限；
3. Jira / Linear / 飞书集成；
4. 组织模板库；
5. 模型调用成本看板；
6. 高级版本管理。

---

## 18. MVP 首屏建议

如果要做一个适合 GitHub README / Hacker News 展示的首屏 Demo，建议优先展示 Studio，而不是项目列表。

首屏 Demo 应该能一眼看出 BoundaryML 的差异：

```text
左侧：阶段 / 过滤 / 验证状态
中间：横向 Workflow Canvas，节点按执行模式着色
右侧：Node Detail，展示 Execution Mode、Review Gate、Prompt Draft
底部或右侧：AI Diff Review Drawer
顶部：Generate Execution Kit
```

这个首屏比普通 Dashboard 更能说明：

- BoundaryML 是可视化编排工具；
- 它解决的是人机协作边界；
- AI 参与不是黑箱，而是有 Prompt、Checklist、Review Gate；
- AI 修改不会静默生效，需要 Diff Review。

---

## 19. 推荐默认示例项目

为了让用户首次进入时快速理解产品，建议内置一个 Example Workflow。

示例项目：

```text
AI SaaS Feature MVP
```

阶段：

```text
Discovery → Product Design → Technical Design → Development → Testing → Launch
```

示例节点：

| 阶段 | 节点 | 执行模式 |
|---|---|---|
| Discovery | Project Goal Clarification | Human Lead + AI Assist |
| Discovery | Context Pack Summary | AI Draft + Human Review |
| Product Design | PRD Draft Generation | AI Draft + Human Review |
| Product Design | Scope Review | Human Only |
| Technical Design | Architecture Proposal | Human Lead + AI Assist |
| Technical Design | API Contract Draft | AI Draft + Human Review |
| Development | Task Breakdown | AI Execute + Human Approval |
| Development | Code Generation Prompt | AI Execute + Human Approval |
| Testing | Test Case Generation | AI Draft + Human Review |
| Testing | QA Review | Human Only |
| Launch | Launch Checklist | AI Draft + Human Review |
| Launch | Production Approval | Human Only |

---

## 20. 设计验收标准

MVP UI 完成后，应满足以下验收口径：

1. 用户能在 3 分钟内创建一个项目并生成初始 Workflow Draft；
2. 用户能在 Canvas 上看清每个节点的执行模式；
3. 用户能点击节点查看输入、输出、责任角色、Review Gate 和 Prompt；
4. 用户能通过 AI Edit 提出修改，并看到 Diff Review；
5. AI 修改不能绕过用户确认直接生效；
6. 高风险节点没有 Review Gate 时，界面必须明确提示；
7. AI 节点没有输出格式或验收标准时，界面必须明确提示；
8. 用户能集中查看所有 Prompt、Checklist 和 Artifact Templates；
9. 用户能生成并预览 Execution Kit；
10. 用户能导出 Markdown / YAML / JSON 中至少一种格式。

---

## 21. 一句话设计原则

BoundaryML 的 UI 设计不应该追求“AI 自动替你完成一切”的幻觉。

它应该让用户清楚看到：

> 哪些事交给人，哪些事交给 AI，哪些事必须人机协作，以及每一次 AI 介入如何被审核、解释和交接。



---

# 21. Agentic Development / Sandbox Governance UI 补充

## 21.1 Node Detail Panel 增加 Agent / Sandbox Tab

Node Detail Tabs 应补充 Agent / Sandbox：

```text
Node Detail
├─ Overview
├─ Boundary
├─ Inputs / Outputs
├─ Review Gate
├─ Execution Assets
├─ Agent / Sandbox
└─ History
```

Agent / Sandbox Tab 展示：

- Agent Execution Level；
- Execution Target；
- Repo Scope；
- Allowed Paths；
- Forbidden Paths；
- Runtime Scope；
- Secret Policy；
- Cost Budget；
- Required Tests；
- Output Evidence；
- Promotion Policy；
- Dispatch Status。

## 21.2 Execution Assets 页面新增 Agent Contracts

Execution Assets 页面新增筛选类型：

- Prompt；
- Checklist；
- Artifact Template；
- Agent Execution Plan；
- Sandbox Execution Contract；
- Promotion Gate。

## 21.3 Export 页面新增 Agent-ready Execution Kit

Export 页面新增选项：

- Agent Execution Plan；
- Sandbox Execution Contracts；
- Promotion Gates；
- Execution Evidence Template。

## 21.4 Studio 节点卡片增加 Agent Level Badge

Node Card 上可显示：

```text
Agent Level: L3 Sandbox
Target: Codex
Tests: 3 required
Gate: Tech Lead Review
```

## 21.5 Dispatch / Review UI

P0 只展示和导出，不做真实 dispatch；P1/P2 再支持：

```text
[Generate Sandbox Contract]
[Export Agent Task]
[Dispatch to Agent]
[View Evidence]
[Approve Promotion]
```

这些按钮必须体现执行等级和门禁状态。若 Boundary Rules 阻止 dispatch 或 promotion，UI 应展示阻断原因，而不是隐藏失败。
