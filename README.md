# hermes-skills

Hermes Agent 多 Profile 团队的自研技能集（多机同步用）。

## 技能清单

| 技能 | 所属 Profile | 用途 |
|---|---|---|
| `leader-task-orchestration` | leader | 任务统筹 SOP：澄清→拆解→下发(Kanban)→跟踪→验收；含四类卡模板、卡级模型路由、证据阶梯 |
| `engineer-delivery` | engineer | 实现与构建交付：产出可追溯制品，不部署 |
| `builder-deploy-ops` | builder | 部署上线/发布/回滚/环境维护（sd 与 ark-server 双通道） |
| `tester-testing` | tester | 运行态测试 SOP 与报告模板（冒烟/E2E/回归） |
| `independent-review` | reviewer | 独立审查流程与证据核对 |

## 卡体系约定

- **五段必填模板**：目标 / 验收标准（部署卡式：逐条 `- [ ]`、以读回证据为准）/ 执行任务规范 / 执行步骤 / 完成后报告规范。
- **执行报告硬规则**：完成后必须返回执行报告，开头两块必填——验收标准完成情况（逐条 `- [x]` 附读回证据）+ 目标实现情况（达成/部分达成/未达成）。
- **证据阶梯**（同步自 OMH 源码）：状态词（done/completed/passed…）只是声明不是证据；证据五类 = execution / verification / review / ci / merge，验收时逐类回答"已观测/缺失"。
- **依赖链**：实现卡 → 部署卡 → 测试卡 / 审查卡（parents 门控，父卡 done 子卡才 ready）。

## 同步方式

改动在本仓库提交推送后，各机器从对应 profile 的 `~/.hermes/profiles/<name>/skills/` 目录拉取更新，或打 tar 分发。
