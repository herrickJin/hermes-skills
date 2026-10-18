# 新增一个可派发的 specialist Profile（本机流程）

用于“再造一个专业执行者”（已有：engineer / reviewer / researcher / builder）。每一步的验收写在步内；**没跑过真实派发就不算建好**。

## 0. 先盘点，不要直接开建

```bash
hermes profile list; hermes kanban assignees      # 会不会重名、当前有谁
```

- 读一个现有 specialist 的 `config.yaml` + `SOUL.md` 当模板（形状比凭空写靠谱）。
- **先查有没有并行会话/未关闭卡正在做同一件事**（见 SKILL.md 常见坑），有就先弄清楚谁在动。

## 1. 备份

把你可能碰到的文件 `cp -p` 到一个带时间戳的备份目录（700）：目标 Profile 的目录（若已存在）、以及任何你要改的现有 Profile 的 `config.yaml` / `SOUL.md` / `.env` / 技能文件。

## 2. 建户

```bash
hermes profile create <name> --no-alias --no-skills --description '<一句话职责，供 kanban 路由>'
```

- `--no-skills` 是故意的：只要职责所需的最小技能集（详细理由见下第 6 步的必装项）。
- `description` 会被 orchestrator 用来按职责路由，不是装饰——写“做什么、不做什么”。

## 3. 配模型与运行环境

逐项 `hermes -p <name> config set ...`：

| 键 | 值 |
|---|---|
| `model.provider` / `model.default` | 目标 provider 与模型；**改 provider 时 CLI 会自动清掉上一家的 `model.base_url`/`api_mode`**（codex 专用） |
| `model.base_url` | 仅当该 provider 需要非默认端点时（如 token-plan 类的 key） |
| `terminal.cwd` | `~/.hermes/profiles/<name>/workspace` |
| `agent.reasoning_effort` / `agent.max_turns` | 与该角色的风险相当（部署/审查类不要用 `low`） |
| `display.language` | `zh` |
| `curator.enabled` | `false` |
| `fallback_providers` | JSON 数组；每级一个**独立凭据**的 provider |
| `platform_toolsets.cli` | 显式列表；**顶层 `toolsets` 已废弃且会被静默忽略** |

兜底链的方向：主模型挂的时候要能接上，所以**别配与主模型同一个 provider 的兜底**（等于没兜底），也别把共享配额/共享订阅的 provider 放进全队每个人的链里（会互相抢额度）。

## 4. 凭据只配给需要它的 Profile

Profile **不共享** `~/.hermes/.env` 的 API-key 变量。从根 `.env` 取对应行，**追加**到 `<profile>/.env`（600）；输出只打印键名，绝不回显值。缺 key 的表现是**静默落到回退链**，不会报错——所以配完必须验实际服务模型（第 8 步）。

## 5. 接入 OMH

```bash
# 先 dry-run，确认它只写这个 Profile 自己的 config.yaml（managed_config_writes 应只有一条）
omh --hermes-home <profile-home> --omh-home ~/.omh/profiles/<name> setup \
  --core --no-omh-tui --no-menubar --no-interactive \
  --memory-mode auto-safe --default-executor hermes --json --dry-run
# 确认后再去掉 --dry-run 执行
```

然后：把共享的 `specialist-omh-runtime` 适配插件目录复制进 `<profile>/plugins/`（复用已验证的同一份，不要另建源码），并 `config set`：`plugins.enabled`（含该适配器与 `omh`）、`memory.provider`（适配器名）、`plugins.entries.omh.settings.omh_home`（该 Profile 自己的 OMH 目录）。收尾：

```bash
hermes -p <name> plugins doctor <adapter>; hermes -p <name> plugins doctor omh
```

两个都必须 OK——插件注册成功不等于工具已启用（工具集在 `platform_toolsets.cli` 里另行控制）。

## 6. 技能：写一份专业工作技能 + 三个必装

- 写 `skills/<role>-<verb>/SKILL.md`：把这个角色的**固定执行流程**、引用的真实命令/路径、以及已知坑写进去；并 `config set skills.auto_load '["<role>-<verb>"]'`。
- 必装三件：① 自写专业技能；② `autonomous-ai-agents/hermes-agent`（用 Hermes 自身的参考）；③ **`devops/sdlc-review`**。③不能省：review 通道派发**强制加载** `sdlc-review`，`--no-skills` 建的 Profile 缺它就会让任何同卡评审启动即 `Error: Unknown skill(s)` 并重试后自动 block。
- 技能内容要**钉在真实命令上**（先 grep 出脚本真实子命令再写），并在建好后让一个真实派发来证明这些引用存在。

## 7. 身份

写 `SOUL.md`（身份 / 职责 / 边界 / 固定执行流程 / 交付物 / 汇报要求），并用 `hermes profile describe <name> --text '<同步的职责描述>'` 对齐路由元数据。SOUL 里要明确它**不做什么**（与哪些角色分工），否则它会在边缘越界。

## 8. 验收：用真实执行，不用读配置

1. `hermes profile list` / `hermes kanban assignees` 里真实出现。
2. `hermes -p <name> tools list` 按职责逐项核对；测试专员应启用 browser/vision 等实际所需能力，不把其他 specialist 的禁用清单照搬成全员模板；delegation、cronjob、computer_use 等按任务需要与授权决定。
3. 发一张受控能力验证卡（`--workspace dir:<绝对路径>`），要求报告 SOUL 首行原文、实际加载技能和真实工具调用，产物写入预先指定的持久目录。普通角色采用只读探针；测试专员使用隔离夹具，执行真实浏览器交互、可判定的正向断言及故意不匹配的负向断言，负向结果必须如实记录 FAIL 并注明属于能力验证而非业务缺陷。证据保存截图或页面状态、实际断言与结果；临时服务用后关闭，禁止触碰业务数据。若创建 worker 尚未完成，验证卡仅引用创建卡而不以它为 parent，避免循环等待；把后续收尾卡依赖验证卡，创建 worker 不轮询等待。
4. `hermes kanban runs <id>` 看 outcome（completed 而非 crashed），`log <id>` 有输出。
5. **亲自复跑**卡里的关键证据（文件在不在、命令输出对不对）——报告是自述，不是证据。
6. 判实际服务模型：查该 Profile `state.db` 的 **`session_model_usage`**（计费口径），不要信 `sessions.model`（它记的是声明的主模型，兜底轮次里仍显示主模型且 `api_call_count=0`）。
7. 副作用核对：若有环境基线（容器列表等）就 diff；`hermes kanban list` 无未关闭卡。

## 9. 收尾

把该 Profile 加进 Leader 的 SOUL.md、统筹 SKILL.md 的执行者清单与路由规则，并核对 `hermes kanban assignees` 的实际输出；这些属于交付，不留给下一次聊天再补。明确区分已注册、验证执行中、独立验收通过；未验证时写清能力待验，只安排受控验证。新角色的配置报告与真实验证结果分别交付，最后由独立 reviewer 核证，不把 Profile 创建成功等同于专业能力可用。
