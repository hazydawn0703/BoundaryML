# BoundaryML 开源部分功能验收报告
- 运行 ID: `2026-07-04T06-43-54-021Z`
- 验收状态: **通过**
- 验收项目: `Open Source Acceptance Agentic Dev 2026-07-04T06-43-54-021Z` / `project_1783147434867`
- 本地持久化数据目录: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data`
- 验收证据目录: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\open-source-acceptance`
- 项目文件: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\workspaces\local_default\projects\project_1783147434867.json`
- 通过检查数: 13
- 失败检查数: 0
- Server URL: http://127.0.0.1:59490
- Studio URL: http://127.0.0.1:16622/apps/studio/index.html
## 验收范围
本报告使用一个真实创建并通过 FileStorage 持久化到本地的项目，验收开源 Community Core Phase 0-9 的主要能力：Local Server API、Project Agent 创建项目、Context Pack、Workflow 编辑、Agent / Sandbox 配置、Workflow Agent Diff、Execution Assets、Execution Kit 导出、Jobs / History、Model Access、模型调用日志持久化、模板 / 示例，以及 Studio 静态页面和 API proxy 可用性。
## 验收结果
| 模块 | 检查项 | 状态 | 证据 |
| --- | --- | --- | --- |
| Phase 1 / API | Health envelope and Studio proxy are reachable | PASS | {<br>  "server": "ok",<br>  "studio_proxy": "ok"<br>} |
| Phase 7 / Model Access | Configure OpenAI-compatible model and run model test | PASS | {<br>  "mode": "real",<br>  "test_status": "succeeded"<br>} |
| Phase 9 / Templates | Public templates are present and no commercial templates leak | PASS | {<br>  "templates": [<br>    "template-ai-saas-feature-mvp",<br>    "template-internal-ai-tool",<br>    "template-legacy-system-ai-modernization",<br>    "template-custom-ai-workflow"<br>  ]<br>} |
| Phase 1 / Project Agent | Create a real persisted project through Project Agent confirmation | PASS | {<br>  "project_id": "project_1783147434867",<br>  "workflow_nodes": 5,<br>  "generation_job": "succeeded"<br>} |
| Phase 0-2 / Workflow Generation | Regenerate workflow and assets for the acceptance project | PASS | {<br>  "version": 1,<br>  "phases": 5,<br>  "nodes": 5<br>} |
| Context Pack | Save, summarize, and refresh impact with security boundary | PASS | {<br>  "summary_source": "deterministic_context_policy",<br>  "affected_nodes": 5,<br>  "affected_assets": 14<br>} |
| Phase 4 / Agent Sandbox Tab | Persist Agent Execution Plan, Sandbox Contract, Promotion Gate, and Evidence Template | PASS | {<br>  "node_id": "node-code-generation",<br>  "workflow_version": 4,<br>  "contract_version": 2<br>} |
| Phase 8 / Workflow Agent | Generate, apply, and reject natural-language Agent/Sandbox diffs | PASS | {<br>  "sandbox": {<br>    "diff_id": "diff-1783147435066-batch-1",<br>    "session_id": "edit_session_317a56bf-d152-4727-8027-3c11d4a8f70c",<br>    "changes": 3,<br>    "workflow_version": 5<br>  },<br>  "testCommands": {<br>    "diff_id": "diff-1783147435136-batch-1",<br>    "session_id": "edit_session_b06e2172-6937-4aa9-9fd8-db8bbce76315",<br>    "changes": 2,<br>    "workflow_version": 6<br>  },<br>  "production": {<br>    "diff_id": "diff-1783147435207-batch-1",<br>    "session_id": "edit_session_2f90c5a6-8941-481d-955d-56cbbdcdeca2",<br>    "changes": 5,<br>    "workflow_version": 7<br>  },<br>  "reject": {<br>    "diff_id": "diff-1783147435283-batch-1",<br>    "session_id": "edit_session_0d688482-4fa9-40e3-810b-c30f09bfc756",<br>    "changes": 1,<br>    "rejected": true,<br>    "before_version": 7<br>  }<br>} |
| Phase 5 / Execution Assets | Read, regenerate, edit, and protect generated assets | PASS | {<br>  "prompt_id": "prompt-node-context-intake",<br>  "checklist_id": "checklist-node-context-intake",<br>  "manual_regen_code": "ASSET_MANUAL_EDIT_WARNING"<br>} |
| Phase 6 / Execution Kit | Preview, generate, and download Agent-ready Final Kit | PASS | {<br>  "kit_id": "kit_1783147435466",<br>  "files": 11,<br>  "download": "kit_1783147435466.json"<br>} |
| Phase 2 / Jobs and History | Exercise workflow versioning, undo, history, jobs, and retry | PASS | {<br>  "history_entries": 1,<br>  "jobs": 9,<br>  "retried_job": "job_c43b98fa-6cf7-4efa-ba44-f7dc5de98430"<br>} |
| Storage / Traceability | Restart server and verify persisted project plus model-call logs | PASS | {<br>  "restarted_server": 47192,<br>  "restored_project": "project_1783147434867",<br>  "model_calls": 24<br>} |
| Phase Plan / Release Hardening | Phase 0-9 statuses are all complete and check script guards them | PASS | {<br>  "phases": [<br>    "Phase 0: 完成",<br>    "Phase 1: 完成",<br>    "Phase 2: 完成",<br>    "Phase 3: 完成",<br>    "Phase 4: 完成",<br>    "Phase 5: 完成",<br>    "Phase 6: 完成",<br>    "Phase 7: 完成",<br>    "Phase 8: 完成",<br>    "Phase 9: 完成"<br>  ]<br>} |
## 验收产物
- acceptance_dir: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\open-source-acceptance`
- data_dir: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data`
- model_config_file: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\open-source-acceptance\model-config.json`
- fake_model_url: `http://127.0.0.1:16617/v1`
- server_log: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\open-source-acceptance\logs\server-2026-07-04T06-43-54-021Z.log`
- server_url: `http://127.0.0.1:59490`
- studio_log: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\open-source-acceptance\logs\studio-2026-07-04T06-43-54-021Z.log`
- studio_url: `http://127.0.0.1:16622/apps/studio/index.html`
- project_file: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\workspaces\local_default\projects\project_1783147434867.json`
- model_calls_file: `D:\HuaweiMoveData\Users\89735\Documents\BoundaryML\data\model-calls.json`
## 结论
开源 Community Core Phase 0-9 的真实项目验收全部通过。验收项目和日志已保留在本地持久化目录，后续可直接用于复查或缺陷修复。