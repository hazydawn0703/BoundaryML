# BoundaryML MVP（产品内核驱动版）

BoundaryML 是一个面向 AI 转型项目的 **人机协作边界编排系统**。本仓库当前实现的是前端本地 MVP：

- 支持项目创建与内置示例项目（AI SaaS Feature MVP）
- 通过 mock model service 生成 Workflow Draft
- 使用结构化 Workflow / Node / Assets 数据驱动 Studio（非静态写死 DOM）
- 支持 Node Detail 编辑、Boundary Rule 校验、AI Diff 审核应用
- 支持 Execution Assets 管理与 Execution Kit Preview 生成

## 本版已实现能力

### 页面
1. Projects
2. Create Project
3. Context Pack
4. Workflow Studio（左中右三栏 + AI Edit + Diff Review）
5. Execution Assets
6. Export Execution Kit Preview
7. Settings / Model Access（只读 + model call logs）

### 核心模型（前端内存 + localStorage）
统一字段契约定义见 `src/domain/schema.js`。

- Project
- ContextPack
- Workflow / Phase / Node / Edge
- ReviewGate / ArtifactContract
- PromptAsset / ChecklistAsset
- ValidationResult
- WorkflowDiff
- ExecutionKit

### 内置规则校验
- high_risk_requires_review_gate
- ai_node_requires_output_format
- ai_node_requires_acceptance_criteria
- human_only_no_ai_prompt
- outdated_prompt_warning
- node_requires_input_and_output
- ai_autonomous_low_risk_only

### 内置 generators（mock）
- generateWorkflowDraft(project, contextPack)
- recommendExecutionMode(node, contextPack, rules)
- generatePrompt(node)
- generateChecklist(node)
- generateWorkflowDiff(userRequest, currentWorkflow)
- generateExecutionKit(workflow, assets)

## 本地运行

```bash
npm install
npm run dev
```

打开：`http://localhost:5173`

## 数据与规则验证

```bash
npm run check
```

该检查会验证：
- example workflow 至少 12 个节点
- 高风险节点缺失 review gate 可被识别
- human-only 节点有 prompt 会报错
- ai_autonomous + high risk 会报错
- execution kit preview 可生成

## 手动验收路径

1. 打开 Projects
2. 进入 `AI SaaS Feature MVP`（Open Studio）
3. 在 Studio 点击一个 AI 节点
4. 切换到 Node Detail 的 `assets` 查看/生成 Prompt
5. 点击 `Validate`
6. 点击 `AI Edit` 输入建议并 `Generate Diff`
7. `Apply Selected` 或 `Apply All`
8. 进入 `Execution Assets` 查看 prompts/checklists/templates
9. 进入 `Export` 点击 `Generate Preview` 生成 Execution Kit

## 说明

- 当前模型调用全部为 mock service（无真实后端、无真实 LLM）。
- 状态会保存到 localStorage，方便本地持续演示。

## Roadmap

- 接入真实后端与持久化 API
- 接入真实结构化 LLM 输出
- 增加流程连线可视化与图布局优化
- 增加更细粒度权限、审批流与审计日志
- 增加自动化测试覆盖 UI 关键交互
