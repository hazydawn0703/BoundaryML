# BoundaryML PRD Agentic Development 补充章节42–47

> 文档定位：本文作为《BoundaryML PRD》的 Agentic Development 补充文件，定义 Coding Agent 沙箱执行治理、Agent 执行等级、Evidence 回收、Promotion Gate 和安全 / 成本 / 权限规则。本文不要求 P0 实现通用 Agent Runtime，也不要求 P0 真实 dispatch 外部 Agent。

---

# 42. Agentic Development Runtime & Sandbox Execution Contract

软件开发正在从“人拉代码 + AI 补代码”走向“Agent 在沙箱中执行任务”。Coding Agent 可以读取仓库、修改文件、运行测试、生成 diff、创建 PR 或触发预览环境，但如果缺少执行前治理，团队很难判断 Agent 能碰哪些代码、能运行哪些命令、能花多少钱、结果是否可信、以及是否可以进入正式工程链路。

BoundaryML 的目标不是替代 Coding Agent，而是为 Coding Agent 定义执行边界。BoundaryML 不做通用 Coding Agent Runtime，不直接替代 Codex、Claude Code、Cursor、Hermes、OpenClaw 等 Agent，也不直接把沙箱环境推到生产环境。BoundaryML 负责定义 Agent 能做什么、访问什么、花多少钱、必须通过哪些测试、谁审核、如何进入正式工程链路。

核心原则：

```text
沙箱跑好了，生成可验证变更；通过 BoundaryML 定义的 Review Gate、测试门、权限门、成本门和发布门后，再进入正式工程链路。
```

Sandbox 是执行场，不是 production 来源本体。正式进入工程链路的应是 versioned diff / commit / PR / artifact / evidence，而不是 mutable sandbox。Sandbox 的成功只能说明“某次受控执行产生了候选变更”，不能直接等同于 Node 完成、PR 可合并或生产可发布。

---

# 43. Coding Agent Execution Levels

Execution Mode 表达“人机协作方式”，例如 Human Only、AI Draft + Human Review、AI Execute + Human Approval。Coding Agent Execution Level 表达“Agent 可执行权限等级”，用于决定 Agent 是否能读仓库、改代码、运行测试、创建 PR、触发 staging 或进入更下游工程链路。

| 等级 | 名称 | 含义 | 典型任务 | 允许能力 |
| -- | --- | --- | --- | --- |
| L0 | Human Only | Agent 不可执行，只能生成 checklist 或建议 | 生产发布审批、法务、安全策略 | 生成说明、检查清单、风险提示 |
| L1 | Agent Suggest | Agent 只读仓库和上下文，输出方案，不改代码 | 影响面分析、技术方案、重构建议 | 读取允许上下文、输出建议 |
| L2 | Agent Patch | Agent 可生成代码补丁，但不运行完整环境、不创建 PR | 小修、文档、低风险组件改动 | 生成 patch / diff 建议 |
| L3 | Agent Sandbox | Agent 可在隔离沙箱中改代码、运行测试、生成 preview / PR | 普通前端功能、Bugfix、测试补充 | 受控改代码、运行 allowlist command、产出 Evidence |
| L4 | Agent Pipeline | Agent 可触发 CI/CD 到 staging，但不能进入 production | 内部工具、低风险服务、预发布验证 | 触发预览、CI、staging gate |
| L5 | Agent Autonomous | Agent 可在强约束内自动完成、合并或发布 | 极低风险、强测试覆盖、可快速回滚任务 | 自动推进受限任务；不进入 MVP |

默认上限规则：

- High Risk 节点默认不得超过 L2，除非有明确 Review Gate 和 Promotion Gate；
- production release 默认 L0 或最多 L1；
- 涉及 customer data / secrets / payment / legal 的节点不得 L4 / L5；
- L3 以上必须有 Sandbox Execution Contract；
- L4 以上必须有 Promotion Gate；
- L5 不进入 MVP，仅作为长期方向。

---

# 44. Sandbox Execution Contract Spec

Sandbox Execution Contract 是 Agent 可执行节点的完整约束对象。它应至少定义以下字段：

| 字段 | 说明 |
| --- | --- |
| `execution_target` | 目标 Agent / Adapter、provider、dispatch mode |
| `repo_scope` | repository、base branch、working branch、allowed / forbidden paths |
| `runtime_scope` | sandbox 类型、网络策略、包安装策略、最长运行时间、命令白名单 |
| `secret_scope` | production secrets、test secrets、env profile 的访问策略 |
| `cost_budget` | 单次运行成本、迭代次数、模型调用次数、token 或 runtime 预算 |
| `acceptance_tests` | required / optional 测试、构建和扫描要求 |
| `output_required` | 必须产出的 diff、test report、preview URL、risk summary、cost report 等 |
| `review_gate` | 审核角色、是否必需、审核后是否允许进入 merge / promotion |
| `promotion_policy` | 是否可创建 PR、merge、deploy preview、deploy staging、deploy production |
| `failure_handling` | 失败重试、回滚说明、Evidence 保存、阻断下游策略 |

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
    - "cost_report"

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

  failure_handling:
    max_retries: 1
    preserve_partial_evidence: true
    require_rollback_note_on_failure: true
    block_promotion_on_failure: true
```

---

# 45. Agent Dispatch, Evidence & Callback Rules

受控执行流程：

```text
BoundaryML Node
→ Generate Sandbox Execution Contract
→ User / Policy Approves Dispatch
→ Create Sandbox / Agent Task
→ Agent Executes
→ Collect Diff / Test Report / Preview URL / Cost Report / Risk Summary
→ BoundaryML Validation
→ Human Review Gate
→ PR / Staging / Production Gate
```

阶段策略：

- P0 不要求真实 dispatch，只要求生成 Agent-ready Execution Kit、Agent Execution Plan、Sandbox Execution Contract 和 Promotion Gate；
- P1 可以做手动导出 / CLI Adapter；
- P2 再做 dispatch + callback；
- Agent 返回结果不能直接改正式 Workflow；
- Agent 返回结果必须作为 Execution Evidence 存储；
- Agent 结果通过 Review Gate 后才允许进入下一工程链路。

Execution Evidence 至少应支持 code diff、commit、test report、build log、preview URL、risk summary、cost report、rollback note。Evidence 必须绑定 Agent Run 的 input snapshot 和 output evidence，且必须通过 schema validation 与 Boundary Rules validation。

---

# 46. Promotion Gates & Engineering Chain

从 sandbox 到 production 的工程链路应显式建模：

```text
sandbox
→ code diff
→ PR
→ CI
→ staging
→ production
```

| Gate | 进入条件 | 是否允许 Agent 自动触发 | 是否需要人工确认 |
| --- | --- | ---: | ---: |
| Sandbox Gate | Sandbox Contract 已确认 | 是 | 取决于等级 |
| Test Gate | required tests 全部通过 | 是 | 否 |
| Review Gate | 指定 Reviewer 通过 | 否 | 是 |
| Staging Gate | CI 通过 + 风险可接受 | 可选 | 中高风险需要 |
| Production Gate | 发布审批通过 | 否 | 是 |

Production 默认不得由 Agent 自动发布。生产发布必须 Human Only 或 Human Approval。Agent 可生成 release checklist、rollback plan、risk report，但不能绕过发布审批。

---

# 47. Agent Safety, Cost & Permission Governance

| Rule ID | 触发条件 | 结果级别 | 是否阻止 dispatch | 是否阻止 promotion | auto-fix 是否可用 |
| --- | --- | --- | ---: | ---: | ---: |
| `sandbox_contract_required_for_agent_execution` | Node `agent_execution.enabled=true` 且等级 >= L3 但缺少 Sandbox Contract | error | 是 | 是 | 可生成 draft contract |
| `agent_access_scope_required` | Agent 节点缺少 repo/runtime/secret scope | error | 是 | 是 | 可生成最小 scope 建议 |
| `high_risk_agent_execution_requires_review_gate` | High Risk 节点允许 Agent 执行但缺少 Review Gate | error | 是 | 是 | 可创建 review gate draft |
| `production_deploy_requires_human_approval` | promotion policy 允许 production 且无人工审批 | error | 是 | 是 | 可将 production 设置为 false |
| `required_tests_must_pass_before_promotion` | required tests 未通过或 Evidence 缺失 | error | 否 | 是 | 不可自动修复 |
| `cost_budget_required_for_agent_run` | Agent Run 缺少成本预算 | error | 是 | 是 | 可填默认预算草稿 |
| `external_network_requires_explicit_approval` | runtime_scope 允许网络但未显式授权 | warning / error | 中高风险阻止 | 是 | 可关闭网络访问 |
| `production_secrets_forbidden_in_sandbox` | sandbox secret_scope 允许 production secrets | error | 是 | 是 | 可改为 forbidden |
| `forbidden_path_change_blocks_promotion` | diff 命中 forbidden_paths | error | 否 | 是 | 不可自动修复 |
| `agent_output_requires_evidence_validation` | Agent output 未通过 Evidence schema / Boundary Rules validation | error | 否 | 是 | 不可自动修复 |

这些规则应由 Boundary Rules 执行，而不是由 Agent Adapter 自行判断。Adapter 可以报告事实和 Evidence，但不能覆盖规则结论。
