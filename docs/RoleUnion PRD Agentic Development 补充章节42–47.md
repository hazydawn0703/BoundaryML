# RoleUnion PRD Agentic Development 补充章节42–47

> 文档定位：本文作为 RoleUnion PRD 的 Agentic Development 场景补充文件，用于定义 Coding Agent 沙箱执行治理、Agent Execution Level、Sandbox Execution Contract、Execution Evidence、Promotion Gate 和 Agent 安全 / 成本 / 权限规则。
>
> 本文不改变 RoleUnion 的通用产品定位。RoleUnion 仍然是面向人机协作工作流的边界建模与治理层；Agentic Development 是第一个重点落地场景和商业爆破点。

---

# 42. Agentic Development Runtime & Sandbox Execution Contract

软件开发正在从“人拉代码 + AI 补代码”走向“Agent 在受控沙箱中执行任务”。但企业不能把沙箱环境直接推到生产环境。

Agentic Development 是 RoleUnion 的第一个重点落地场景，不是 RoleUnion 的全部产品定义。它依赖通用 RoleUnion Spec、Workflow、Node、Execution Mode、Review Gate 和 Execution Kit，并在此基础上扩展 Agent Execution Plan、Sandbox Execution Contract、Agent Run、Execution Evidence、Promotion Gate 等场景对象。

核心原则：

```text
沙箱跑好了，生成可验证变更；通过 RoleUnion 定义的 Review Gate、测试门、权限门、成本门和发布门后，再进入正式工程链路。
```

Sandbox 是执行场，不是 production 来源本体。

正式进入工程链路的不是 mutable sandbox，而是 versioned diff、commit、PR、build artifact、test report、preview URL、risk report、cost report 和 rollback note。

RoleUnion 与 Coding Agent 的分工：

- RoleUnion 负责规划、边界、审核、成本、授权、证据回收和发布门；
- Coding Agent 负责在受控沙箱或外部工具中执行具体任务。

RoleUnion 不做通用 Coding Agent Runtime，不直接替代 Codex、Claude Code、Cursor、Hermes、OpenClaw 等 Agent，也不直接把沙箱环境推到生产环境。

---

# 43. Coding Agent Execution Levels

Execution Mode 是通用人机协作方式；Coding Agent Execution Level 是 Agentic Development 场景下的 Agent 权限等级；两者不能混用。

| 等级 | 名称 | 含义 | 典型任务 |
|---|---|---|---|
| L0 | Human Only | Agent 不可执行，只能生成 checklist 或建议 | 生产发布审批、法务、安全策略 |
| L1 | Agent Suggest | Agent 只读仓库和上下文，输出方案，不改代码 | 影响面分析、技术方案、重构建议 |
| L2 | Agent Patch | Agent 可生成代码补丁，但不运行完整环境、不创建 PR | 小修、文档、低风险组件改动 |
| L3 | Agent Sandbox | Agent 可在隔离沙箱中改代码、运行测试、生成 preview / PR | 普通前端功能、Bugfix、测试补充 |
| L4 | Agent Pipeline | Agent 可触发 CI/CD 到 staging，但不能进入 production | 内部工具、低风险服务、预发布验证 |
| L5 | Agent Autonomous | Agent 可在强约束内自动完成、合并或发布 | 极低风险、强测试覆盖、可快速回滚任务 |

补充规则：

- High Risk 节点默认不得超过 L2，除非有明确 Review Gate 和 Promotion Gate；
- production release 默认 L0 或最多 L1；
- 涉及 customer data / secrets / payment / legal 的节点不得 L4 / L5；
- L3 以上必须有 Sandbox Execution Contract；
- L4 以上必须有 Promotion Gate；
- L5 不进入 MVP，仅作为长期方向。

---

# 44. Sandbox Execution Contract Spec

Sandbox Execution Contract 是 Agentic Development 场景扩展对象。它定义 Coding Agent 在受控沙箱中执行开发节点时的完整约束。

| 字段 | 说明 |
|---|---|
| `execution_target` | 目标 Agent / Adapter、provider、dispatch mode |
| `repo_scope` | repository、base branch、working branch、allowed / forbidden paths |
| `runtime_scope` | sandbox 类型、网络策略、包安装策略、最长运行时间、命令白名单 |
| `secret_scope` | production secrets、test secrets、env profile 的访问策略 |
| `cost_budget` | 单次运行成本、迭代次数、模型调用次数、token 或 runtime 预算 |
| `acceptance_tests` | required / optional 测试、构建和扫描要求 |
| `output_required` | 必须产出的 diff、test report、preview URL、risk summary、cost report 等 |
| `review_gate` | 审核角色、是否必需、审核后是否允许进入 merge / promotion |
| `promotion_policy` | 是否可创建 PR、merge、deploy preview、deploy staging、deploy production |
| `failure_handling` | 测试失败、越权改动、成本超限等失败处理策略 |

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

  failure_handling:
    on_test_failure: "return_evidence_and_stop"
    on_forbidden_path_change: "block_promotion"
    on_cost_budget_exceeded: "require_human_review"
```

阶段说明：

- P0 可以只导出 Sandbox Execution Contract，不真实派发；
- P1 可以支持 CLI / 文件导出；
- P2 再做真实 dispatch / callback。

---

# 45. Agent Dispatch, Evidence & Callback Rules

受控执行流程：

```text
RoleUnion Node
→ Generate Sandbox Execution Contract
→ User / Policy Approves Dispatch
→ Create Sandbox / Agent Task
→ Agent Executes
→ Collect Diff / Test Report / Preview URL / Cost Report / Risk Summary
→ RoleUnion Validation
→ Human Review Gate
→ PR / Staging / Production Gate
```

执行策略：

- P0 不要求真实 dispatch；
- P1 可以做手动导出 / CLI Adapter；
- P2 再做 dispatch + callback；
- Agent 返回结果不能直接改正式 Workflow；
- Agent 返回结果必须作为 Execution Evidence 存储；
- Agent 结果通过 Review Gate 后才允许进入下一工程链路。

Execution Evidence 示例：

```yaml
execution_evidence:
  id: "evidence-agent-run-001"
  agent_run_id: "agent-run-001"
  node_id: "node-frontend-login-page"
  status: "submitted"
  artifacts:
    code_diff: "diffs/login-page.diff"
    test_report: "reports/login-page-test.md"
    preview_url: "https://preview.example.com/login-page"
    risk_summary: "reports/login-page-risk.md"
    cost_report: "reports/login-page-cost.md"
  validation:
    schema_valid: true
    boundary_rules_passed: true
    required_tests_passed: true
  review_status: "needs_review"
```

Agent Run 状态：

| 状态 | 含义 |
|---|---|
| `draft` | 已生成计划，但未派发 |
| `pending_approval` | 等待人工确认派发 |
| `queued` | 已创建运行任务，等待执行 |
| `running` | Agent 正在执行 |
| `succeeded` | Agent 执行成功并返回 Evidence |
| `failed` | Agent 执行失败 |
| `cancelled` | 用户或系统取消 |
| `blocked_by_policy` | 被权限、成本、测试或发布规则阻止 |
| `needs_review` | 结果已返回，等待 Review Gate |
| `promoted` | 结果已进入下一工程链路 |
| `rejected` | 人工审核拒绝 |

---

# 46. Promotion Gates & Engineering Chain

工程链路：

```text
sandbox
→ code diff
→ PR
→ CI
→ staging
→ production
```

| Gate | 进入条件 | 是否允许 Agent 自动触发 | 是否需要人工确认 |
|---|---|---:|---:|
| Sandbox Gate | Sandbox Contract 已确认 | 是 | 取决于等级 |
| Test Gate | required tests 全部通过 | 是 | 否 |
| Review Gate | 指定 Reviewer 通过 | 否 | 是 |
| Staging Gate | CI 通过 + 风险可接受 | 可选 | 中高风险需要 |
| Production Gate | 发布审批通过 | 否 | 是 |

必须明确：

- Production 默认不得由 Agent 自动发布；
- 生产发布必须 Human Only 或 Human Approval；
- Agent 可生成 release checklist、rollback plan、risk report，但不能绕过发布审批；
- sandbox 执行成功不等于 production 可发布；
- Agent Run succeeded 不等于 Node completed；
- Promotion Gate 通过后才允许进入下一工程链路。

---

# 47. Agent Safety, Cost & Permission Governance

| Rule ID | 触发条件 | 级别 | 阻止 Dispatch | 阻止 Promotion | Auto-fix |
|---|---|---|---:|---:|---|
| `sandbox_contract_required_for_agent_execution` | Node agent_execution.enabled = true 且无 Sandbox Execution Contract | error | 是 | 是 | 生成 Contract 草案 |
| `agent_access_scope_required` | Contract 缺少 repo_scope / runtime_scope / secret_scope | error | 是 | 是 | 生成默认 scope 草案 |
| `high_risk_agent_execution_requires_review_gate` | High Risk 节点启用 Agent 执行但无 Review Gate | error | 是 | 是 | 添加 Review Gate 草案 |
| `production_deploy_requires_human_approval` | promotion_policy.can_deploy_production = true 且无人工审批 | error | 是 | 是 | 改为 false 并添加 Production Gate |
| `required_tests_must_pass_before_promotion` | required tests 未通过但尝试 promotion | error | 否 | 是 | 无 |
| `cost_budget_required_for_agent_run` | Agent Run 缺少 cost_budget | warning / error | 取决于组织策略 | 是 | 生成默认预算 |
| `external_network_requires_explicit_approval` | runtime_scope.allow_network = true 但无审批 | warning / error | 是 | 是 | 改为 false 或添加审批 |
| `production_secrets_forbidden_in_sandbox` | secret_scope 允许 production secrets | error | 是 | 是 | 改为 forbidden |
| `forbidden_path_change_blocks_promotion` | Evidence 中 diff 修改 forbidden_paths | error | 否 | 是 | 无 |
| `agent_output_requires_evidence_validation` | Agent 输出未通过 Evidence schema validation | error | 否 | 是 | 要求重新提交 Evidence |

补充说明：

- Agent 输入是不可信执行上下文；
- Agent 输出也是不可信输出；
- Agent 返回的 diff / report / preview URL 必须经过 schema validation 和 Boundary Rules validation；
- 外部 Agent 不能因为 prompt 或任务描述而覆盖 Boundary Rules；
- sandbox 不得默认拥有 production deploy 权限；
- shell command 必须基于 allowlist；
- 外部网络访问必须显式授权；
- 生产密钥默认禁止进入 sandbox。
