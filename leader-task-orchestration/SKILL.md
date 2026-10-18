---
name: leader-task-orchestration
description: "统筹多 Profile 交付：澄清、拆解、下发、跟踪、验收。"
version: 1.0.0
author: jinmo, Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [orchestration, kanban, multi-profile, delivery, leader]
    related_skills: [hermes-agent]
---

# Leader 任务统筹工作规范

把你（leader）接到的目标推进到可验证的结果：澄清 → 定义 → 拆解 → 下发 → 跟踪 → 验收 → 汇总。跨 Profile 的协作一律走 Hermes 原生 Kanban，不依赖聊天上下文传递状态。

## 何时使用

- 用户给出目标，需要你判断谁来做、拆成几步、怎么验收。
- 已有任务在跑，需要你跟进状态、处理阻塞、验收结果。
- **不适用**：单条命令就能答完的问题、纯咨询性问题——直接回答，不要为它建卡。

## 环境事实（本机，2026-10 核实）

- Hermes v0.22.2，源码 `~/.hermes/hermes-agent`（git 安装）。
- Profile：`default`、`leader`、`engineer`、`reviewer`、`builder`、`tester`（`default` = 根目录 `/Users/abc/.hermes` 本身，其余在 `~/.hermes/profiles/<name>`；researcher 已于 2026-10-17 废弃）。可用 `hermes profile list` / `hermes kanban assignees` 复核。
- Kanban 板**跨 Profile 共享**：`kanban_home()` 解析到安装根，默认板 DB 为 `~/.hermes/kanban.db`（不随 `HERMES_HOME` 分叉）。所以 `hermes -p leader kanban ...` 与 default 看到的是同一个板。
- 调度器（dispatcher）跑在 host gateway 进程内（`kanban.dispatch_in_gateway: true`），默认每 60s 扫描所有板：回收陈旧 claim、提升 ready、原子认领、spawn 被指派的 Profile 作为 worker。
- 同一个 gateway 是多路复用模式，当前服务全部 6 个 Profile（default/leader/engineer/builder/tester/reviewer）；它同时是 cron 调度宿主。
- leader 的 `kanban_*` 工具已启用（`platform_toolsets.cli` 含 `kanban`）。可用工具：`kanban_show/list/create/link/unlink`（unlink 走 CLI）、`kanban_complete/block/unblock`、`kanban_request_review/request_changes`、`kanban_heartbeat`、`kanban_comment`、`kanban_attach/attach_url/attachments`。
- 通知链路：`kanban.auto_subscribe_on_create: true`——你在持久会话里 `kanban_create` 后，任务终态事件会唤醒你的会话。leader 目前没有消息平台频道，跨会话跟进靠 cron 巡检（见下）。

## 工作流

1. **前置检查（每次开工前）**
   - `hermes profile list` + `hermes kanban assignees`：确认执行者真实存在、当前负载。
   - 涉及具体项目时先读该项目的 `AGENTS.md` / `.hermes.md`，把适用约定写进任务 body。
   - 盘点能力时，读取各 Profile 的 SOUL.md、配置中的 platform_toolsets 与技能目录；用 `hermes -p <profile> tools list` 核对启用工具集。不要使用未经当前 CLI 验证的 `hermes chat --list-tools`。
   - 严格分开「技能文档存在 / 工具已启用 / CLI 已安装 / 凭证已授权 / 实际执行通过」；不能把技能目录分类（如 researcher、reviewer）当成真实 Profile。CLI 出现在 PATH 也可能无法启动，必要时用版本或只读健康命令验证。
   - 功能验收依赖登录时，先核对实际执行 Profile/浏览器的授权通道；Leader 能列出凭据不证明 tester 也能使用。已确认同一通道受阻后，不把它原样安排进后续测试卡反复检查；先解决安全供给，或在既有授权内由 Leader 交互会话补做范围限定的验证，并把证据标为 Leader 执行而非 tester 能力通过。不要复制凭据文件、跨 Profile 复用 vault handle 或绕认证。
   - 完成判据：能列出「本任务可用执行者」清单，且每人能力有依据（不是靠名字猜）。

2. **澄清（能自己决定的就不要问）**
   - 明确目标、背景、约束、优先级、完成标准。
   - 非关键细节自行合理假设，并**把假设写进任务 body**；只有影响目标/范围/结果的缺失信息才集中一次性问用户，附上你的建议方案。
   - 完成判据：能用一句话复述目标 + 可验证的完成标准；需要用户决定的事项已一次性发出。

3. **定义与拆解**
   - 修改既有业务流程前，先走真实用户入口，再追源码调用链，最后定方案；仅看模板或接口会漏掉会话移交、草稿确认、失败回退和异步副作用。分别标明浏览器亲见、静态核查与未执行的提交后行为；未授权创建时停在确认前，不把查看表单当作端到端验证。
   - 保留既有业务负责人的端到端职责，先完善其工作规范，再补它缺少的确定性工具与回执；不要因工具需要代码强制，就把负责人降为话术引导者、另造平台流程替代。职责开通由 spec-manager 编排，具体领域规范负责业务准备，平台/节点/spec_tool 负责受约束执行。
   - 规划对话型 Agent 的体验时，将认证、持续范围授权与单次操作确认分开；已授权明确读取直接执行，不强迫用户跳工作台，也不每次重走认证和项目发现。用户要求少轮次时优先补确定性工具与固定 SOP，不靠放松权限校验提速；无法安全证明原始指令涵盖精确写载荷时，将一次对话确认明确列为待批准体验取舍，而非偷偷改变需求。
   - 将普通任务与故障排障明确分流：优先使用当前实例既定工具；异常影响结果或明显延迟时反馈，在授权内限次恢复并续接原任务，不借自愈自行启动服务、安装依赖、换身份或扩权。写请求结果未知时先核验，不盲目重发。
   - 已有技术字段默认值不等于合格业务模板；模板应区分接口最低字段、质量要求和未知事实，集中补问关键缺失，不将严重程度、计划日期或复现状态等技术默认值冒充用户确认的事实。
   - 用户要求先保证现有流程正常时，以最小可运行闭环为本次范围；在线发布、完整回滚和批量迁移等扩展另列后续，不用连续设计审查扩大当前任务。保留旧方案快照，按用户新的责任归属和范围修订合同，不把早期建议当作已批准决定。
   - 按复杂度决定是否拆分；**每个子任务一个明确成果、唯一负责人**。
   - 区分真并行与必须串行的工作；并行卡不得各自发明同一项决策（命名、格式、接口）——由你定好并写进每张卡的 body。
   - 完成判据：每个子任务都满足下面的「任务下发模板」全部必填项。

4. **下发（Kanban）**
   - 优先用工具 `kanban_create`（结构化、免 shell 转义）；CLI 等价命令见速查表。
   - 依赖用 `parents=[...]` 或 `kanban_link`。**方向：父卡完成 → 子卡才 ready**。
   - 下发成功必须有真实 `t_xxxx` 返回；没有 ID 就是没下发成功。
   - 预建依赖独立审查的部署卡时，在合同中增加结论门：父卡 done 只解除调度依赖，builder 仍须读取审查结论；只有明确准入通过且无阻塞才执行，否则停止并回报 Leader。制品准入通过不得替代部署后业务验收。
   - 完成判据：每张卡有 ID、有 assignee、有验收标准；依赖关系在 `hermes kanban show` 中可见。

5. **跟踪**
   - 事件驱动：完成/阻塞/失败通知到达后立刻判断下一步。
   - 主动巡检：`hermes kanban stats`（各状态计数 + 最老 ready 年龄）、`hermes kanban list --status running/blocked`。
   - ready 卡超过预期调度间隔仍无运行记录时，立即核查调度宿主，不把“已就绪”等同于执行中。依次执行 `hermes gateway list`、目标宿主的 `gateway status`、`hermes -p leader kanban dispatch --dry-run --json`，区分依赖、容量、锁与宿主退出；桌面聊天可用不证明后台调度存活，过期 running 标记也不证明进程存在。
   - 确认共享网关退出且无替代调度器后，按当前 CLI help 恢复原宿主服务；default 多路复用部署使用 `hermes -p default gateway start`，不加 `--force` 创建重复网关。随后读回 gateway 状态及任务 running/runs；必要时手动 dispatch 一轮。若手动返回 spawned 为空，先查是否已被后台派发，避免重复启动。恢复成功必须有真实 worker 运行记录，不能止于“Service started”；原退出原因未查明时单独说明。
   - 常驻 gateway 健康时优先由其派发；手动 dispatch 返回后先核对当前 run，不连续催派。遇 pid gone 或重复 worker，按下节的进程身份核验与去重步骤处理，不把派发宿主退出与崩溃通知的相关性当作已确认根因。
   - worker 超过 1 小时应有心跳；`hermes kanban runs <id>` 看尝试历史，`hermes kanban log <id>` 看 worker 日志。
   - 完成判据：任何时候都能说出每张卡的真实状态（todo/ready/running/review/blocked/done）。

6. **异常处理**
   - 先判因：信息不足 / 依赖未完成 / 能力不足 / 技术故障 / 范围不清。
   - 信息不足 → 补 body 或 comment 后 `unblock`；依赖未完成 → 等父卡，或 `unblock`（有父卡未完成会自动回到 todo）。
   - 能力不足 → 换 assignee（`hermes kanban assign`）或 `reassign`；重新分派前先 `reclaim` 释放原 claim，避免重复执行。
   - 技术故障（凭证/模型被拒）→ 卡会被自动 block 并注明原因；修好对应 Profile 的 provider 后 `unblock`。
   - 收到超时通知，先 `kanban_show` 与 `hermes kanban runs <id>` 核对实际 error、outcome 和事件，再区分墙钟超时、迭代耗尽与依赖等待；通知里的 `max_runtime=0s` 可能是缺失字段的默认显示，不能直接据此修改运行上限。
   - 收到 `worker crashed (pid gone)` 时，先读 `kanban_show`、`hermes kanban runs <id>` 和 `hermes kanban log <id>`，提取旧 run 与当前 run 的 PID；再用 `ps -p <old_pid>,<current_pid> -o pid=,ppid=,stat=,etime=,args=` 核对进程身份、任务 ID 与 Profile。通知是调度器判断，不是进程已退出的证明；PPID=1 也只能作为孤儿线索，不能单独证明崩溃原因。
   - 若自动重试已启动且旧 worker 仍存活，先确认当前有效认领及两份进程身份，仅对失去认领的旧 worker 发 `kill -TERM <old_pid>`；给清理留出短暂时间后再次检查退出，保留当前有效 worker。不因旧 run 的失败通知对当前 run 执行 reclaim/unblock/再次 dispatch，不按 Profile 批量杀进程、不重启共享 gateway，因为这会中断有效重试或制造更多副本。将核查、终止及退出证据写回原卡；进程去重成功与调度误判根因查明分开汇报。旧进程若进入 `Z/<defunct>`，记录为已退出待父进程回收，不当作仍在执行而重复终止。若审查包含变异或临时源码编辑，去重后先将目标文件哈希与工程交付基线比对，再允许重试继续；发现不一致先查残留与并行修改，不盲目覆盖，因为旧 worker 可能在失去认领后仍改过共享文件。复现出“某种指纹偏差可令存活进程判死”只证明误判机制；只有捕获同一 PID 在认领与检查时的指纹、读取方及判定分支，才可归因具体事故。保留真实退出、PID 复用与读取失败等反例，不因 fixture 与现象吻合就宣称唯一根因；源码已有容差函数也不代表任意容差都安全。
   - 迭代耗尽后先读取已落盘报告、制品与清单、真实测试输出及未完成标准，把续作限定为可逐项关闭的剩余交付；已存在且哈希一致的制品不得重打，也不要重新创建 Profile、安装插件、重查全链或重复建验证卡。为附带核查提供已定位的精确入口与停止条件，防止收尾再次退化为全仓探索；先写最小交接记录，再做可选调查，避免再次中断时成果只留在日志。等待独立验证时用依赖释放 worker，不靠心跳或轮询耗尽迭代预算。若收尾卡已 ready 且验证卡无反向依赖，可 `kanban_link(验证卡, 收尾卡)` 门控重试，读回确认 todo；running 卡按现有认领规则处理，不能强塞依赖。
   - 阻塞事件 reason/kind 为空时，先读真实 worker 日志与已执行证据，不能凭空归因为权限或凭据不足；若只是反复推演，给出有边界的具体下一步与非空阻塞报告要求，不替未执行方案背书。恢复动作返回“not blocked”时先重读卡及 runs：并行会话可能已解除并派发，不重复 unblock、reclaim 或启动第二份 worker。
   - 有界诊断在预算结束前先落盘「已证事实 / 待证假说 / 最小下一步」；自动重试只续既有探针或补报告，不重新盘点环境。恢复预算不是新增调查授权，否则诊断会变成独立于业务目标的无限工作流。
   - 若执行者反复偏离收尾范围而已有候选制品，先 block 原卡、核对并终止其精确 worker、确认无并发写入，再由 Leader 写阶段交接；保留测试自述与独立验证的区别，不替执行者宣布实现完成。需要提前审查时，先读回依赖图，解除「实现→审查」旧边后再加「审查→实现」门控，避免环路；原实现卡保持 blocked，审查给出具体结论后由 Leader 决定恢复，不以审查 done 自动放行。
   - 同一个操作失败后**不要重复相同操作**；改了方案再重试。
   - 完成判据：每个阻塞卡都有明确的下一步责任人和动作。

7. **验收**
   - **证据阶梯（零信任验收，2026-10-17 同步自 OMH 源码）**：`done/completed/passed/success/ok` 等状态词只是完成声明，永远不是证据；证据只有五类——execution（真实执行被观测）/ verification（验证被观测）/ review（独立审查被观测）/ ci（构建通过被观测）/ merge（合并发布被观测）。验收一张卡 = 逐类回答"已观测/缺失"，**缺失清单必须完整，不许省略从未检查的项**。详见 `references/card-templates.md` 证据阶梯节（OMH 源码：`/Users/abc/workspaces/code/oh-my-hermes`）。
   - 执行者报完成后，逐条核对交付物与验收标准（读文件、跑验证命令），**不采信口头"已完成"**。
   - 重要/复杂成果另建 assignee=`reviewer` 的独立审查卡，`parents=[被审卡]`；不要把 `request-review` 本身当作独立 Profile 审查，因为同卡 review 通道可能仍使用原 assignee。只有已核实实际指派及派发行为后才用同卡独立审查。
   - 不通过先区分审查通道：从 review 认领的同卡审查使用 `kanban_request_changes`；若独立 reviewer 卡已 done 但结论为“需修改”，读取完整 findings，不把审查任务 completed 解释为验收通过，也不对非 review 卡套用 request-changes。实质设计或实现缺陷另建原执行者修正卡及下游独立复验卡；若架构本体已通过、只剩审查给出的少量精确文档替换，由 Leader 在确认无并发写入后直接补齐、程序化核对并在原审查卡记录差异，不再为补句重启完整审查链。Leader 核对不冒称 reviewer 已重新批准，代码与安全行为变更仍需独立验证。
   - 设计审查按一份唯一合同收敛：先固定数据结构、身份域、接口、状态与准入不变量，再用新建、更新、半程失败、重启和回滚反例推演；要求审查给出位置、触发序列、影响和最小替换，而不是只说“需完善”。正文、接口、矩阵与附录同步修改，不能以对照表逐项回应代替设计自洽。
   - 审查前先走一条完整正常时序并写成正例，再加安全负例；对话提议与用户确认天然分属前后两轮，不能把来源 turn 的追溯绑定写成确认必须同轮，导致规则和测试共同封死正常路径。对话授权与单执行协议按 `references/conversational-authorization-review.md` 核对。
   - 核对每次 run 的实际 Profile 后才认可独立性；加载审查技能、进入 review 状态或自称独立核证，都不能把执行者自审变成另一位审查者。发现同 assignee 的 review 循环时停止原样重交，改用真实独立 reviewer；不要为重复自审累积“通过轮次”。
   - 将未追实的关键注入点、可信身份传递和发送回执列为明确的有界技术验证门，并在实现前验证；接口支持透传字段不证明上游实际注入，不应通过继续润色文档把未知变成“无阻塞”。依赖启动环境变量的 Agent SOP，还须追到目标运行快照的工具环境过滤与派生逻辑；宿主源码、父进程变量或人工注入的容器冒烟都不能替代真实模型工具调用。将真实会话验证单列部署后阻塞验收项，未覆盖原旧会话时不得声称原会话已恢复。
   - 连续修订仍引入新冲突时，Leader 先收窄到已证实缺陷并明确技术取舍，再下发差异合同；不继续追加概念、扩大范围或把纯技术一致性抛给用户。将非阻塞实施注意项与真正阻塞分开；仅对产品范围或使用方式的实质选择集中请用户拍板，避免以报告版本增长冒充交付进度。
   - 固定部署输入前，同时核对控制面版本、实例 manifest 和运行文件字节；原地升级可能保留旧版本目录名，目录名及本机 dist 的最高版本不能代表当前部署基线。范围证明须对当前已部署内容逐文件比较，保留已上线但未提交的修复；前端 bundle 还须解释全部语义差异与哈希改名引用，少量特征串存在或仅几个 chunk 变化都不证明无夹带。将相对 Git HEAD 的源码差异与相对线上制品的实际新增行为分开报告，避免把已上线但未提交的修复算作本次成果。文件级 MANIFEST 另以预期键集合与包内真实字节独立校验，zip 总哈希正确不代表清单正确。
   - 固定部署输入前，验证产物内容属于本次批准范围，而不只验证哈希一致；共享脏工作区须从基线加批准白名单在独立 staging 打包，不能把“已披露并行改动”当作批准连带发布。不可变路径和 sha256 仅用于精确标识制品，不能替代发布唯一版本、实例升级和缓存准入检查；同号不同内容先查现有显式版本参数并重构建，不覆盖历史制品、不擅自 commit、不把“按 sha 取包”写成未经验证的安装能力。详细核证方法见 `references/provisioning-workflow-verification.md`。
   - 部署准备不得抢先消耗功能验收的前置条件：需验证自然缺包自动恢复时，先协调 builder 与 tester 的供给边界；若部署阶段已手工装好，只能报告工具安装成功，不能把后续已安装路径称为会话缺包恢复通过。
   - 部署报告与真实会话的工具可用性冲突时，先只读核对「实例映射 → 部署根 → HERMES_HOME → 会话工作目录/执行边界 → 解释器与工具绝对路径」，再决定是否补包或修路径规则；只搜索 HERMES_HOME 不能证明整个实例未安装工具，部署目录存在文件或 `docker exec` 成功也不能证明目标 Agent 会话可达。分别记录部署侧成功、会话侧调用与未验证项，不把未经证实的绝对路径写成固定 SOP，也不让用户猜安装位置或盲目重试。
   - 按用户最终目标判断发现的阻塞性，不按“是否本次引入”豁免：工具能定位和 `list` 退出码为零仍须核对台账路径、真实条目及绑定回执；输出同时提示台账不存在时，不宣布职责创建链恢复。本机会话实测只证明本机行为，目标实例的具体环境值须独立实读或明确保留为推断，不能靠修改报告收口运行验收。
   - 将职责落账、异步实例化、profile可见切入、真实模型业务工具调用分别验收；internal service 工具已注册不证明宿主机器认证可用，机器认证成功也不证明业务授权成立。遇首查401先核签发/落位/有效期/origin及身份边界，不复制其他profile凭据或让模型生成凭证；界面持续处理中先读真实会话终态，避免把已执行并失败误判为死锁。确认卡单次刷新消失与DB只有一行仅证明当次无重复，不能替代跨浏览器墓碑恢复及服务端防重放核证。
   - 升级前把必须保留的安装包、登记启用位、安装终态记录、台账、草稿、会话和业务调度做成状态基线；升级后逐项语义对比，而不只核对版本和文件存在。包重装后启用位变化属于未关闭的部署差异，不以“平台默认”或“旧问题”宣告保留成功；恢复已证实的原状态与新增业务授权分开，后者仍需用户授权。发现差异即纳入修复及最终独立核证依赖，未经核实的恢复方式不当作已验证 SOP。
   - 将代码准入、运行恢复和部署授权分别设门；审查者认为某通道“不是热更新”不构成对显式替换容器要求的豁免。需要例外时，集中说明精确目标、固定版本、停止/替换/启动机制、保全与回滚条件并取得明确答复；确认超时保持未授权，仅继续可独立完成的实现和核证，不因后续完成通知自动解锁，也不在每条状态通知中重复发确认表单。
   - 将恢复结果与执行合规分开验收：旧文档认可人工改配置，不证明它满足当前显式部署约束；变更前先确认应用/激活机制并取得原始快照，不能先写运行文件再解释为受控恢复。若已发生偏差，独立报告实际效果、违规步骤和证据缺口；逆向重构件必须标为重构，不能当变更前原始证据。不要为补齐形式而事后重启或重复写入。
   - 完成判据：每个交付物都有一条可复现的验证记录（命令 + 结果）。

8. **汇总交付**
   - 全部必要子任务 done 后，整合结果并向用户汇报（模板见下）。
   - 完成判据：用户能凭汇报独立验证结果，且知道还有哪些未决事项。

## 任务下发模板（写进 Kanban 卡的 body）

**五段必填（2026-10-17 定，缺任何一段执行者应 block 而不是猜）**：① 目标 ② 验收标准（部署卡式：`- [ ]` 逐条、以读回证据为准、含正向验证+非回归）③ 执行任务规范 ④ 执行步骤 ⑤ 执行完成后报告的标准规范。**执行报告硬规则：完成后必须返回执行报告，开头两块必填——验收标准完成情况（逐条 `- [x]` 附读回证据 / `- [ ]` 附原因，禁止总结性一句话）+ 目标实现情况（达成/部分达成/未达成 + 依据）；缺任一块视为未完成交付。**

**四类卡的完整现成模板**（实现卡/部署卡/测试卡/审查卡，均已按五段必填固化）见 `references/card-templates.md`——建卡直接抄对应模板，不要每次从本文件各处拼装。通用底座字段如下：

```
## 目标
<要达成什么>；对总目标的作用：<一句话>

## 负责人
<真实存在的 Profile 名>

## 背景与输入
<必要背景、已知决策、参考文件绝对路径>

## 范围与约束
<做什么、不做什么；必须遵守的约定（如项目 AGENTS.md、Docker 部署约定）>

## 交付物
<具体产物 + 保存位置的绝对路径>

## 验收标准
- [ ] <可验证的判据 1，以读回证据为准>
- [ ] <可验证的判据 2>

## 前置依赖
<父卡 ID 或"无">

## 优先级
<P0/P1/P2>

## 截止时间
<仅当用户提供或有明确依据时填写；否则写"未指定">
```

body 应当自包含：执行者无需读你和用户的聊天记录就能开工。

## 卡级模型与思考等级路由

### 卡型默认匹配表（2026-10-17 定，按本机已验证三 provider）

**原则：profile 默认已按角色分档，建卡时默认不写 override（继承第 1 层）；只在下列"升级/降级"条件成立时用卡级覆盖。**

| 卡型 | assignee | 默认（继承 profile） | 升级为卡级 `--model glm-5.3` 当 | 降级/换挡当 |
| --- | --- | --- | --- | --- |
| 实现卡 | engineer | glm-5.3:medium | 跨模块架构改动、疑难缺陷根因分析（保持旗舰，无需 override，改用 high 需卡级 effort——见下"半成品"） | 琐碎改动（单文件小修/文案/样式）→ `--model glm-5.3-flash --provider zai` |
| 部署卡 | builder | glm-5.3-flash:low | 涉及数据迁移、多服务联动、回滚演练等高风险部署 → `--model glm-5.3` | 常规单服务替换不 override |
| 测试卡 | tester | glm-5.3-flash:low | 复杂 E2E 编排/缺陷复测需要推理用例设计 → `--model glm-5.3` | 冒烟/固定 SOP 不 override |
| 审查卡 | reviewer | glm-5.3:high | 无需升级（已是旗舰+high） | 轻量文档核对类审查 → flash |
| 汇总/杂活 | default | glm-5.3-flash:medium | — | 纯机械操作（批量重命名/日志收集）→ mimo |

**故障绕开**（第 2 层的真用途）：主 provider 临时故障时 `hermes kanban set-model <id> <model> --provider <p>` 单卡换到 mimo 或 deepseek，不动 profile 配置；恢复后 `set-model <id> none` 清除。环境故障不靠升级模型解决——先判因（环境/输入/范围/推理）。

**OMH 类别链 ↔ 卡型对照**（链已按本机三 provider 重设，2026-10-17）：ultrabrain/deep/deep-work/architect ≈ 实现卡的升级档（glm-5.3:high）；capable/writing/unspecified-high ≈ 标准档（glm-5.3:medium）；quick/simple-work/unspecified-low ≈ flash/mimo 档。`omh_delegate_route` 的建议须过滤到本机已验证模型后才可写入卡字段。

**已知半成品**：卡级 reasoning_effort 在 DB 层支持（列+校验存在），但工具 Schema/CLI/dispatch 三层未接通——当前**卡级只能换模型不能单独调思考度**。补齐路径见 `references/kanban-routing-contract.md`（源码级施工合同）。在此之前，思考度差异靠 profile 默认值实现，不为调思考度改卡。

1. 先按职责选择 assignee，再分别评估复杂度与操作风险；不要用描述长度或风险高低单独决定模型。记录目标明确度、跨模块范围、推理深度与验证难度，以及路由理由和升级条件。模型候选须受本机已验证 provider、订阅覆盖和用户配额策略约束；候选分档不等于已启用的自动路由。
2. 配置前区分四层：当前工具 Schema / CLI 参数、处理函数透传、数据库保存、派发器及 provider 实际请求。先查 `kanban_create` 的当前 Schema、`hermes kanban create --help` 和 `hermes kanban set-model --help`，再追踪源码；底层存在字段不能证明创建入口暴露了参数。负责人、模型、依赖和思考等级必须落在受支持的结构化字段，不能靠正文描述生效。
3. 卡级覆盖与 Profile 默认分开核对；不为一张卡修改整个 Profile。思考等级应可独立于模型指定，未填写保持继承语义；复用底层规范化规则，不在入口维护另一份枚举。将请求等级与 provider 映射后的等级分开说明，不把不同模型的 high 当作等量算力，也不把请求被接受当作效果已验证。
4. 采用 OMH 建议前，先读 `omh_delegate_route(action='status')` 并核对类别链的模型、provider 和来源；不要盲用内置或本机旧映射。区分工作流推荐、模型类别建议和实际执行：`omh_delegate_route` 针对下一次 `delegate_task`，不自动填写 Kanban 卡字段。要用于持久看板，须显式将批准的建议写进卡级字段并读回；Jev 参与遵守下文同意边界，不把一次讨论扩展成后台永久调用授权。
5. 失败后先区分环境、输入、范围与推理问题，再决定是否升级。环境故障不靠强模型解决；运行中的卡先安全处理原 worker 和成果归属再重派，防止双写。校准路由先做只给建议的历史样本比较，不能将这种比较冒称换模型后的效果实测；实际效果以审查结论、有效测试、返工原因和实际服务模型衡量，不以 done 数量代替。

扩展创建参数或排查透传时，按 `references/kanban-routing-contract.md` 检查完整链路；只读定位与建议不得报告为已实施。

## 暂停与只读查看任务

### 用户要求暂停一组相关任务

1. 先读当前看板，按主题、负责人和依赖链确定范围；包含相关 builder/reviewer 卡，不只筛选执行专员本人。保留已 done 的历史状态和成果，不把暂停写成完成或验收通过。
2. 先阻止后续调度，再处理进程。**不要把 todo 当作暂停状态**：无未完成父卡的 todo 可被自动提升为 ready 并立即派发；有未完成父卡的 todo 也只是在等依赖，父卡结束便可能运行。暂停应使用已核实的不可派发状态，并覆盖相关依赖链，不能只靠一张当前受阻的上游卡。核对当前 CLI help 与状态转换：`hermes kanban block <id> '<暂停原因及恢复条件>' --kind needs_input` 可用于 running/ready；todo 卡若被拒，不重复同一调用，核对当前实现后用 `hermes kanban schedule <id> '<用户暂停，无自动恢复时间，仅用户明确要求后恢复>'` 停放。scheduled 在此是不可派发的停放状态，不表示配置了定时恢复。批量命令逐卡检查输出，因为进程退出码不保证每张卡都转换成功。
3. 对正在执行的卡，从该卡最新 run/spawn 记录取得 PID，用 `ps -p <pid> -o pid=,ppid=,stat=,command=` 核对任务 ID、Profile 与进程身份后才 `kill -TERM <pid>`；随后确认退出。不要把 block/reclaim 成功当作 worker 已停，存活进程仍可能继续写文件。仅核查和清理归属于该任务的临时服务，不按 Profile 名批量杀进程，不停共享 gateway。
4. 在相关任务记录中写明暂停来源、保留成果及“仅用户明确恢复后续派”；已有 done 卡用 comment 记录后续暂停，不改写其历史结论。不要通过新建替代卡绕过暂停。收到 todo、unblocked 或 running 通知不等于获得恢复授权；先读回该卡最新状态、父依赖和 run，不能沿用上一条通知判断它仍在等待。若未获明确恢复授权却已派发，重新阻止调度并按第 3 步终止该卡 worker；若状态变更来自用户操作但意图不明，询问是否恢复，不把状态通知自动解释为指令。
5. 读回精确目标卡，确认未完成卡均不可派发、无活动 claim，运行进程已退出且无新增替代卡；同时核对无关任务未被改动。重复阻塞可能被系统升级为 triage，成功返回的实际状态优先于预期的 blocked；不要为凑状态标签反复 block/unblock，也不要把 triage 说成验收通过。汇报分别列出已停止、已停放和保留历史的卡，不笼统声称全部改成同一种状态。

### 用户要看执行过程或打开执行会话

- 先区分任务摘要、运行日志与完整聊天轨迹；前两者不能冒充“模型发言→工具调用→工具结果”的完整会话。
- 优先给桌面端路径：看板 → 点击任务卡 → 详情中的 Comments / Activity / Runs / Worker Log，分别对应交接说明、状态事件、执行尝试与输出日志。标签及入口随版本变化时，先核对当前界面或实现，不凭记忆指路。
- 终端只读入口用 `hermes kanban runs <id>` 与 `hermes kanban log <id>`。查记录不需要 unblock、dispatch 或 resume；查看已暂停任务时维持暂停状态。
- 用户明确要完整会话时，先定位具体 run 对应的 worker session ID 与所属 Profile，再核对当前桌面导航能力。可从 run metadata 的 `worker_session_id`、日志及该 Profile 会话记录交叉确认；任务 ID、run ID 与 session ID 不可混用。未验证跳转入口时，不编造“打开会话”按钮，也不将当前版本未见入口固化为永久功能限制。

## Kanban 速查（CLI）

```bash
hermes kanban assignees                      # 有哪些 profile 可指派（= 能力盘点入口）
hermes kanban stats                          # 各状态/各人计数 + 最老 ready 年龄
hermes kanban list [--status ready]          # 列卡
hermes kanban show <id>                      # 卡详情：body/comments/事件/依赖
hermes kanban context <id>                   # worker 实际看到的上下文
hermes kanban create "<标题>" \
  --assignee <profile> --body-file <路径> \
  --parent <父卡id> --priority <n> \
  --workspace dir:/abs/path \
  --skill <附加技能> --max-retries <n> --json
hermes kanban link <parent_id> <child_id>    # 追加依赖
hermes kanban unlink <parent_id> <child_id>  # 解除依赖
hermes kanban comment <id> "<内容>"          # 协作/交接记录
hermes kanban assign <id> <profile>          # 改指派人
hermes kanban reclaim <id>                   # 释放运行中的 claim（重派前必做）
hermes kanban block <id> "<原因>"            # 阻塞
hermes kanban unblock <id>                   # 回到 source 阶段（review/ready/todo）
hermes kanban request-review <id>            # 交评审
hermes kanban request-changes <id> "<要求>"  # 评审退回
hermes kanban complete <id> --result "<结论>"
hermes kanban runs <id> / log <id>           # 尝试历史 / worker 日志
hermes kanban dispatch                       # 手动催一次派发（不等 60s tick）
hermes kanban watch                          # 实时事件流
```

工作区选择：默认 `scratch`（完成即删，只适合临时产物）；交付物必须落盘用 `--workspace dir:/abs/path`，或在完成时把绝对路径写入 `artifacts`/`summary`。

## 汇报模板（对用户）

```
完成：<做成了什么>
交付物：<绝对路径 / 任务 ID>
验证：<可复现的命令与结果>
未决/需你决定：<无 或 具体事项 + 你的建议>
```

## 跨 Profile 上下文一致性

- 先分别核对共同规则文件、共享 Kanban、各 Profile 的 memory.provider 与存储范围；不要把“都启用 OMH”或“共用看板”说成已经共享长期记忆。
- 用版本化规则承载必须执行的约束，用 Kanban 承载当前状态与交接，用记忆承载有来源的背景事实；召回结果不能替代当前源码、运行状态或独立验收证据。
- 新增角色时同时更新 Leader 的 SOUL、统筹技能和实际可指派人员核对结果，区分“列表可见”与“能力验收通过”，避免只在当前聊天里知道该交给谁。
- 评估共享记忆先加载 `hermes-agent` 与 `omh-external-connector-readiness`；盘点单外部 provider 槽对现有 OMH 自动生命周期的替换影响，再确认上传触发、共享范围、服务端权限、纠错/删除、费用与回滚。不得把客户端只召回配置当 ACL，或把关闭自动 retain 当作已禁止所有上传。
- 把共享 bank、私有 bank、桥接与统一规则文件写成候选方案，直到用户批准并实际验证后才标为已采用；文档/源码研究不能当作跨 Profile 召回、迁移或回滚实测。先用无敏感语料做隔离试点，不为验证共享能力全量上传历史聊天。

## Profile 身份与看板配置（本机实操）

- **在 leader 会话里跑 CLI 必须显式指定 Profile**：该会话 shell 里 `HERMES_HOME=/Users/abc/.hermes/profiles/leader`，裸 `hermes <cmd>` 操作的是 leader 自己。读配置一律 `hermes -p <name> ...`。
- **`hermes profile describe <name>` 把 `default` 解析成「当前 HOME」**（`_describe_target_dir`）：在 leader 会话里 `hermes profile describe default` 读写的是 **leader 的** profile.yaml。给 default 写描述必须显式指定 HOME：`HERMES_HOME=/Users/abc/.hermes hermes profile describe default --text '<描述>'`；写完把 `/Users/abc/.hermes/profile.yaml` 和目标 Profile 的 profile.yaml 各读一遍确认没写错人。
- **看板工具集默认是关的**：`kanban` 属于 `_DEFAULT_OFF_TOOLSETS`，用默认 `hermes-cli` 组合的 Profile 在 `hermes -p <name> tools list` 里显示 `✗ disabled  kanban`（被派发的 worker 仍会被注入 kanban 工具，所以「卡能跑」不等于配置已开）。开启：`hermes -p <name> tools enable kanban --platform cli`（会把 `platform_toolsets.cli` 展开成显式列表，不丢原能力），改完用 `tools list` 复核，并在该 Profile 的**普通会话**里实测一次 `kanban_list` 才算验证。
- **`--no-skills` 建的 Profile 必须补装 `sdlc-review`**：`kanban_db_dispatch.py` 对 review 通道派发**强制加载 `sdlc-review`**（`claimed.skills` 里 append）。用 `hermes profile create --no-skills` 建的 Profile 不含它，任何 `kanban_request_review` 都会导致 review worker 启动即 `Error: Unknown skill(s): sdlc-review`，重试 2 次后自动 block。建新 specialist Profile 后必须 `cp -R ~/.hermes/skills/devops/sdlc-review ~/.hermes/profiles/<name>/skills/devops/`，并用 `hermes -p <name> skills list` 核对。全机只有这一个强制注入技能（已 grep 源码确认）。
- Profile 身份 = `SOUL.md`（角色/边界/看板规则）+ `profile.yaml` 的 `description`（供 kanban 编排者路由）。改完身份用一个真实派发卡验证注入生效（让 worker 报告身份文件首行原文），别无凭据地宣布“已配置好”。
- **要新建一个可派发的 specialist Profile（或给已有 Profile 改职责），按 `references/new-profile-setup.md` 的步骤顺序做**：盘点 → 备份 → `profile create --no-skills` → 配模型/工具集/兜底链 → 按 Profile 配凭据 → OMH 接入 → 写专业技能 + 必装三件 → 写 SOUL → **用真实派发卡验收** → 回写执行者清单。里面每一步都带验收点与踩过的坑，不要凭印象重新发明一遍。

## 常见坑

- **依赖方向反了**：把「汇总卡」写成执行卡的父卡，会让执行卡被汇总卡阻塞。汇总卡应是执行卡的子卡（parents = 执行卡）。
- **给被阻塞的父卡挂支援卡**：支援卡会变成它的子卡一起被卡住，死锁。要在 body 里引用父卡 ID，而不是 `link`。
- **对 running 的子卡加依赖会被拒绝**——依赖只能在认领前建立。
- **link 会把 ready 的子卡降级为 todo**（返回 `gated: true`），这是正常的门控行为，不是失败。
- **assignee 必须是真实存在的 Profile**（`kanban dispatch_profiles` 未限制时本机可认领任意已存在 Profile）。写错名字的卡会连续 spawn 失败后被自动 block。
- **scratch 工作区完成后会被删除**；交付物不落盘就等于没交付。
- **配置出现意外 diff 时，先排除「并行会话有意改」，再怀疑 worker 越权**（2026-10-16 实测踩坑）：`engineer/config.yaml` 的 `model` 从 `gpt-6.1-sol/openai-codex` 变成 `glm-5.3-flash/zai`，我判定为被停掉的 worker 越权，照备份回滚了一次——**这是误判**：那是并行会话有意做的主模型切换（同时在该 Profile 的 `.env` 放了 `GLM_API_KEY` + `GLM_BASE_URL`），随后被重新落盘并写进 SOUL。正确顺序：先 `stat` 看 mtime、读目标文件与 SOUL/技能里的记录、对照其它 Profile 是否有同类改动，再做决定；**回滚别人有意的变更比漏掉一次越权更糟**。中断 worker 或验收后仍要把目标 Profile 配置与改前备份 diff（这能抓到真实越权），但要先弄清是谁改的。
- **并行工卡会双写同一批文件**：reviewer 审查后会自行建修正卡派给 engineer；若你（Leader）同时在直接改同一批文件，就会双写。直接改文件前先 `hermes kanban list` 查有无未关闭卡指向同一批文件；已双写时先 `kill -TERM <pid>` + `hermes kanban reclaim <id>`，再用 `hermes kanban complete --force <id>` 关闭冗余卡（有未完成父卡的卡需先父后子）。判断“到底谁写了”用 sha256 对比基线，不要相信 worker 的 mtime 推断（本次两个 worker 互相误判 mtime、均声称对方在写，实际文件未被改动）。
- **`--no-skills` Profile 上跑 `kanban_request_review` 会崩**：review 通道强制加载 `sdlc-review`，缺失即 worker 启动失败并重试 2 次后自动 block（现象：`Error: Unknown skill(s): sdlc-review`，run 连续 `crashed`）。修法是补装技能后用 `hermes kanban unblock <id>` 让卡回到 review 重新派发；不要靠 `--force` 关闭卡来掩盖。
- **review 通道的 worker 用的是卡自己的 assignee**：`kanban_request_review` 不是把卡转给 `reviewer` Profile，而是由 dispatcher 以**同一 assignee** 重跑一次 review 轮次（force-load `sdlc-review`）。需要真正的独立 profile 审查时，另开一张 assignee=`reviewer` 的卡（`parents=[被审卡]`）——这是本机已实跑通过的独立审查方式。
- **不要为了分工而分工**：简单任务自己做，避免增加沟通成本。
- **制品版本冲突先查现有显式版本参数**：hit-ark/de-dev 的 mac/linux `pack.sh` 已支持 `--version X.Y.Z`，Git 提交计数仅在未指定版本时作默认值。不能因同号包被发布闸门拒绝，就把“授权 commit / 绕版本按 sha 安装”当成仅有选项。复用已审干净 staging 和固定 agent_ref，以显式唯一版本重构建，逐条目核对只允许生成元数据差异；发布前仍预检版本占用，不覆盖历史包、不擅自 commit。
- **改了有影响的事要回写**：决策、变更、卡状态都进 Kanban/comment，别只留在对话里。
- **可能已有并发会话在做同一件事**：leader 往往是多会话并行（用户在别的窗口/Profile 同时开工，甚至同时在改同一份 SOUL/技能）。动手前先看现状——`stat -f "%Sm %N" -t "%m-%d %H:%M"` 看 mtimes、直接读目标文件、再 `hermes profile list` / `kanban list` 对照；如果发现用户这次要的改动已经落了（例如文本逐字相同），只做核对并如实汇报“已存在、与原文一致”，不要重做一遍或二次覆盖。
- **改共享身份/技能文件时用单行 surgical patch，并读回 diff**：`patch` / `skill_manage` 的返回里出现 `_warning` 提到 sibling subagent 改过同一文件，或 mtime 比你以为的新，说明有并发写入——先重读文件再改，改完核对 diff 里没有别人的行被抹掉。没有确认独占时不要用整文件覆盖写。
- **OMH 记忆捕获有硬限制**：`omh_memory(action='capture')` 的 summary 上限 500 字符（超了直接拒绝，理由 `summary_too_long`），且把凭证名/环境变量名写进去会被判 `unsafe_content` 落成 pending_review 而不生效。捕获写成一句能独立读懂的决策或事实，凭证只说“该 Profile 的 `.env` 已补入该 provider 所需变量”。

## Jev 完成判定（prepared, not executed）

Jev（TypeSafe）是非生成式概率预言机：只对带 `state` 的定型问题回概率、不写文字；`omh-jev-done-check` 只能**提出反对**，`jev-review-gate` 永不批准。本机已配好路由（leader/.env 的 `TYPESAFE_API_KEY`；`omh doctor` 的 `plugin_jev_sidekick` 行应显示 `route typesafe by variable name`）。

**硬边界（工具自身强制，不是策略）**：只有用户本人在当下那轮点名 Jev 才算同意——cron / kanban worker / 子代理 / 单次查询的轮次**永远不构成同意**，调用只会拿到 `consent_not_observed` 且不发送任何内容。因此 **Jev 不能当自动化编排的完成门禁**，也**不要用任何方式伪造一个人的轮次**。

自动化里可用的本地取证（无需同意）：七层验收阶梯 + `omh_gather_evidence`（白名单本地探针）+ 独立 `reviewer` 卡。Jev 是叠加在它们之上的、人在场时的一道额外复核。

**做法**：汇报完成时顺手附一个可发射的 Jev 包，让用户一句话就能跑——每个 claim 一节：`claim` / `evidence_excerpt`（贴真实输出片段，不转述）/ `goal`，**用英文写**（该端点对 CJK 效果差），最多 6 个 claim，一次性说清“如果发射会送出哪些内容”并请用户回 `ask jev`。

**不要问 Jev 代码能算的东西**（计数、日期、算术、字符串检查）。汇报时要带 `status` / `ask_id` / `served_model` / cost 来源；非答案写成 `not_observed`，**绝不当成 Jev 的结论**。

**工具叫不动时怎么处置（不要绕路）**：

- 插件工具在**会话启动时**按凭据门控注册；本会话被拒（`'<name>' is not available in this session`）就去新会话，不要在同一会话里反复试。注意 `tool_describe` **能读出 schema 不代表可调用**——它只证明目录里有这个工具，不代表本会话能发。
- **不要为了完成一步而绕开工具直接打端点**（自写 HTTP / 跑它的 client 模块）。同意闸门与 metadata-only 账本是这个工具设计的一部分，绕过它等于把“用户说了才能外发”变成“我能就算了”；OMH 自己的恢复指引也只要求报不可用并继续。这种绕路要用户明确点头才做，并且只做一次、如实标注不进账本。
- 分层验证“这类受控外发工具是否通”时，不要拿“回答成功”当结论：按 ① 路由解析（`omh doctor`）→ ② 新会话里工具确实注册 → ③ 同意闸门真拦（用一次非人轮次拿 `consent_not_observed` + 账本零字节）→ ④ 端点可达与证书真实 → ⑤ 凭据有效（**必须一次带凭据的、用户在场的提问，无法代劳**）逐层测；把已验证层与未验层分开写，不要把 ①–④ 说成“连通”。

完整规则（同意边界、什么会离开本机、状态枚举与重试语义、账本与成本口径、请求形状上限）见 `references/jev-verification.md`。

## 验证

- 下发验证：`hermes kanban show <id>` 能看到 assignee、body、依赖；`hermes kanban stats` 计数随之变化。
- 执行验证：`hermes kanban runs <id>` 出现一次 outcome 为完成的运行，`log <id>` 有 worker 输出。
- 交付验证：交付物绝对路径真实存在且内容符合验收标准（亲自 `read_file`/跑命令）。
- 链路健康：`hermes gateway list` 显示 gateway 运行（dispatcher 依赖它），`hermes cron status` 显示 serving profiles 含 leader。
- 通知投递：`hermes kanban notify-list` 能看到订阅；任务完成后 `~/.hermes/kanban.db` 中 `kanban_notify_subs.last_event_id` 推进到该卡最后一个事件 id，即表示轮询器已认领并投递（本机桌面会话已实测通过）。

## 执行者清单与路由（2026-10-16 建立并实测）

本机可用 Profile 与真实职责（用 `hermes kanban assignees` / `hermes profile list` 复核，不要凭技能目录分类当 Profile）：

| Profile | 真实职责 | 派什么 |
| --- | --- | --- |
| `engineer` | 依据任务合同实现代码、跑有效测试与构建、产出可追溯构建产物（镜像 tag/digest 或发布包+MANIFEST）；**不部署** | 实现、修缺陷、测试/构建、产出可部署产物 |
| `builder` | 接 engineer 产物做部署上线、发布包流程、回滚，维护本机 Docker 环境（巡检、配置/密钥受控变更、备份） | 部署、发布、回滚、环境巡检与维护 |
| `tester` | 只负责已部署环境的测试与记录，不修业务代码、不部署；实际能力以独立验收证据为准 | 浏览器自动化、业务端到端、冒烟、缺陷复测与回归；报告、缺陷和证据 |
| `reviewer` | 独立核对原任务/源码/测试构建证据、复跑验证、给出 通过/需修改/受阻 | 独立审查、复跑核证、退回修正 |
| `default` | 通用执行（未专业化） | 本机诊断、资料整理、一次性脚本 |
| `leader`（我） | 统筹、拆解、派发、跟踪、验收、汇报 | 目标/合同/验收；简单任务自己做 |

路由规则：**不要把什么都派给 engineer**。调研/来源核证类任务已无专职 researcher（2026-10-17 废弃）——轻量调研 leader 自己做或派 default，需要深度调研时先向用户提出补装专职角色；实现与单元/集成测试派 engineer；部署后的真实环境功能测试、浏览器自动化、冒烟、端到端、缺陷复测与回归派 tester；**部署上线、发布、回滚、运行环境维护一律派 builder，不要派 engineer**；凡有实现或部署的交付都要另派 reviewer，不让执行者自审；只有本机杂活或未专业化的任务才给 default。

依赖方向示例（已实跑）：实现卡 → 部署卡（`parents=[实现卡]`）→ 审查卡（`parents=[部署卡]`）；需要功能验收时补测试卡：实现 → 部署 → 测试 → 审查。子卡自动等父卡 done 才 ready。变动需要上线时，部署卡 assignee=`builder`，body 必须给出产物绝对路径 + 版本（提交号/镜像 digest/发布包+MANIFEST）+ 目标 Compose 项目与服务名。

需要功能验收时，依赖链补成：实现 → builder 部署 → tester 测试与记录 → reviewer 独立核证 → Leader 最终验收。tester 不自派修复卡，失败由 Leader 安排 engineer 修复 → builder 部署新版本 → tester 复测及影响面回归。测试卡必须指定环境 URL、目标版本、账号角色（无秘密）、授权的数据范围与操作、适用 SOP、断言、报告与证据绝对路径；缺凭证/浏览器故障记受阻，未测不算通过，done 只表示执行结束，不能代替测试结论。Profile 出现在 assignees 不代表能力已经验收，验收前只安排受控验证。身份/路由同步属于新角色交付的一部分，不能只创建 Profile 不更新 Leader。

`engineer` 的卡必须传递 Docker 构建阶段约定（禁热更新、产物固定版本、只构建受影响服务、不启停生产容器）；`builder` 的卡必须传递部署约定（禁热更新、显式构建替换受影响容器、只动受影响服务、`--no-deps`、部署后核对非目标容器 ID+启动时间未变、备份与回滚路径）；`reviewer` 的独立审查技能里已含同一份约定用于证据核对。

限定 hit-ark 部署前，先检查所选入口的实际副作用：`deploy/ark-server/bin/update.sh` 的整包路径无参调用 `compose_up_retry`，会触及全项目；其整包与补丁路径还会重启 `sd-apisix`。不要把脚本固有副作用当作非目标容器允许变化的默认豁免：优先选显式目标服务的 `docker compose … up -d --no-deps <services>`，并核对构建上下文与配置均来自批准制品。若确需额外重启，执行前明确扩大范围并取得批准；执行后分别核对容器 ID 与 StartedAt，不能仅以 ID 不变掩盖非目标重启。

- 本机 Docker 部署主力项目是 `/Users/abc/workspaces/hit-ark`，有两条真实通道：开发/测试栈用 `server-deploy/bin/sd`（`list/update/release/start|stop|restart|status|logs/top/nacos publish/apisix sync/keys/dist build/infra backup|reset|m2m-reconcile/reissue-credentials`，共 24 个子命令）；正式发布包通道用 `deploy/ark-server/bin/{install,update,start,stop,status,logs}.sh`（`update.sh <发布包.tar.gz>` 支持整包/补丁包/静态包，回滚=上一版包重跑）。派 builder 的卡直接引用这些入口，不要臆造命令。
- 现网容器：`docker ps -a` 约 26 个（`ark-*`、`sd-*`、`kb-*`）。发起任何部署前先用 `docker ps -a` 存基线，部署后 diff 核对非目标容器 ID/启动时间未变。

## 本机 provider 与 worker 环境事实（2026-10-16 实测）

- `openai-codex`（历史参考，**本机不可用**——OAuth 未迁移，gpt-6.1-sol 无法调用；若未来重新登录则以下恢复生效）：（ChatGPT/Codex 订阅，`cost_status=included`）会整账号耗尽额度并返回 429（`usage_limit_reached`，`plan_type=plus`，`limit_window_minutes=300`，5 小时窗），提示重置时间；此时凡用该 provider 的会话（含 cron 任务、新建会话）都走回退链。**gpt 配额是 leader 的稀缺资源**：不要把 openai-codex 放进其他 Profile 的主模型或回退链；leader 自己的 cron 作业单独钉便宜模型（`hermes cron edit <job_id> --model glm-5.3-flash --provider zai`，`kanban-巡检` 05a445c9256e 已如此设置且 2026-10-17 验证通过）。
- **2026-10-17 全队模型策略与计费真相（先看 plan/订阅，别看 list price）**：用户的 zai 走 coding plan 端点（`open.bigmodel.cn/api/coding/paas/v4`），`glm-5.3` 与 `glm-5.3-flash` 实测 `estimated_cost_usd=0`（plan 覆盖、边际≈0）；真正按量付费的是 `deepseek-flash`（$0.15/$0.60，key 已存 .env 备用但按 10-16 定策不入链）与 `mimo-v2.6-flash`（$0.14/$0.28，便宜，全队真兜底）。**本机无 openai-codex 凭据（旧机 OAuth 未迁移），gpt-6.1-sol 在本机不可用**——若未来重新登录 OAuth 可再切回（配额规则见 SOUL 历史段）。当前路由：`default` = zai/glm-5.3-flash → mimo（medium）｜`leader` = zai/glm-5.3 → flash → mimo（high）｜`engineer` = zai/glm-5.3（旗舰，plan 覆盖） → flash → mimo（medium）｜`reviewer` = zai/glm-5.3 → flash → mimo（high）｜`builder` = zai/glm-5.3-flash → mimo（low）｜`tester` = zai/glm-5.3-flash → mimo（low）。`fallback_providers` 是 **per-profile** 顶层键，复核用 `hermes -p <profile> fallback list`（leader 会话里裸 `hermes` 只读 leader 自己）。
- 改回退链用 `hermes -p <profile> config set fallback_providers '[{"provider": ..., "model": ...}, ...]'`：`hermes fallback add` 走 TTY picker，非交互会话里是静默 no-op（什么都不写）。主模型保持 `model.provider`/`model.default` 不变，只把备份放进链里。配完三层都要验：① `fallback list` 看顺序 ② `hermes -p <p> auth status <provider>`（必须带 provider 参数）③ 对**每个**回退项跑一次 `hermes chat -q "Reply with exactly: OK" --provider X --model Y` —— 只有第③步才算证明端点与凭证可用；模型 id 用 provider 自己列出的名字（`$HERMES_HOME/provider_models_cache.json`），写错 id 不会报错、只在首次使用时失败。链是每轮热重载，不需要重启网关或新建会话。用 `hermes config set` 写，不要手改 config.yaml。
- 改完 Profile 的模型路由后，**同一次操作里回写该 Profile 的 SOUL.md 事实行**（本节也同步）：留一条"leader 没有回退、需人工处理"之类的过期事实，会让后续会话据此做出错误处置。
- Profile 不共享 `~/.hermes/.env` 里的 provider key：新 Profile 要用某个 API-key provider，必须在它自己的 `.env` 放对应 key；而 openai-codex 这类 OAuth 走机器级凭据，无需复制。**写 `.env` 用追加，不要整文件重写**（重写会丢空行与注释结构，也会把不该动的行卷进来）；必须重写时先 `cp -p` 备份，且只打印键名、绝不回显值。
- **把某 Profile 的主模型从 `openai-codex` 换成 API-key provider（本机实测：engineer → zai/glm-5.3-flash）时，三件事一起做**：① 把该 provider 的变量复制进这个 Profile 自己的 `.env`（zai 用 `GLM_API_KEY` + `GLM_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4`，值取自根 `.env`，只打印变量名不打印值；profile 缺 key 会静默落到回退链）；② `hermes -p <p> config set model.provider zai` + `config set model.default glm-5.3-flash`——改 `model.provider` 时 CLI 会自动清掉上一家的 `model.base_url`/`model.api_mode`（codex 专用），不要手改 config.yaml；③ 真跑一次 `hermes -p <p> chat -q "..."`，然后查该 Profile `state.db` 的 `session_model_usage` 表，确认 `model`/`billing_provider` 就是目标家——**只看回答成功会被回退链掩盖**（zai 挂了也会由 deepseek 出结果）。
- **判定“实际上谁在服务”只信 `session_model_usage`（计费口径），不要信 `sessions.model`**：后者记的是**声明的主模型**，牌底轮次里它仍是主模型名且 `api_call_count=0`（我会据此误判过两次），另由 `logs/agent.log` 的 `Fallback activated: X → Y` + `RateLimitError` 行佐证。同理，`hermes chat -q` 成功、退出码 0、终端无告警都不算证据。
- 卡级 override 可绕开主 provider 的临时故障：先从当前已授权、实测可用的模型中选择，再用 `hermes kanban set-model <id> <model> --provider <p>`；以 `set-model <id> none` 清除覆盖前先核对 CLI help。遵守用户订阅与费用策略，不用已弃用的按量 provider 作默认应急示例。重试前读取卡级 model/provider override 及变更事件，因为它优先于 Profile 配置；来源不明且与合同冲突时先核实并行会话或用户意图，不盲目回滚或继续按冲突配置派发。
- 对被派发 worker 分别核验 OMH 工具暴露、记忆 provider 注册、自动召回注入和自动捕获落盘；工具集可能被收窄，插件 doctor OK 只证明注册，不证明自动记忆已生效。用真实目标 Profile 会话的生命周期证据与存储/召回结果判定，未测项标未验证，不用手工写库冒充自动捕获。
- **不要用顶层 `toolsets` 键配置工具**——它已废弃并被忽略（会静默给 Profile 全量工具）；必须用 `platform_toolsets.cli`。改完用 `hermes -p <name> tools list` 逐项核对。
- 共享网关是多路复用：新增 Profile 无需重启网关（`hermes gateway list` 会显示 "served by the default multiplexer"）；不要为了生效而重复启动或重启网关。

## 验收实操（比模板更硬的部分）

- 遇到下载、安装、实例化与业务准备串联的交付，按 `references/provisioning-workflow-verification.md` 核对身份、确认顺序、异步终态和参数消费；文件出现、工具声明存在或模型回复成功，都不能替代实际完成回执。用户要求初始化并可交互时，必须验收「当前对话确认 → 平台职责落账 → 自动实例化绑定 → 刷新后可见并可切入 profile → 真实授权范围内业务查询」；只读工具探针通过或修复卡开始运行不算完成，也不得用手工创建 profile 替代正常开通链路。

- 开通验收按状态逐段推进：确认卡恢复后只提交一次，立即读回平台生成的稳定职责标识，再分别核对自动派发终态、运行台账、可切换 profile 和业务查询；平台职责列表中的展示名不等于运行 profile 已生成。平台已落账但 profile 未出现时，保留原职责并沿其标识追后续链路，不重建、不再归因为“平台未创建”，也不凭空声称只是延迟。用运行配置、派发与对账时间线证明异步等待；机制允许的延迟仍须单独报告其用户体验影响，不能用“符合默认周期”代替可用性验收。调度槽须先核对规范合同究竟是自动创建还是预填后另行确认，再核对相应表达式、任务标识与运行时配置；仅预填成功不得报定时任务已生效。
- 对对话型业务查询，必须同时验证 UI 选中身份、实际模型会话归属、原始工具调用及业务终态；profile 存在或首段“将读取技能”的回复不证明可履职。持续“处理中”时停止反复读页面，沿同一会话做有界取证并明确诊断责任人；不盲目重发、清空或停止未知状态请求，未解决的查询故障保持未通过。
- 执行者报告 done ≠ 验收通过：至少亲自复跑一次测试/校验命令（`unittest`、`shasum -a 256 -c`、`tar -tzf`），并核对被审目录的 sha256 在审查前后是否一致。
- 研究的引文要**自己取回来源**核对（`curl`/`web_extract`），并注意引文对应的版本文档是否与本机解析到的页面一致。
- 验收升级/恢复工具时，先把合同中的“任一阶段失败”展开为逐阶段矩阵，再接受总体通过：覆盖 stop 后备份失败、旧目录改名失败、新目录就位失败、新版启动失败、旧版恢复启动失败。分别断言数据完整、正确旧版进程存活及错误真实性；不能以“既有缺陷”豁免本次目标所必需的恢复门，也不能把恢复目录成功当作恢复服务成功。详细方法见 `references/provisioning-workflow-verification.md` 的升级保留态核证。
- 让 reviewer 检查"测试本身是否有效"（变异测试/故意注入缺陷），而不是只看测试是否通过。对凭证、端口等负例，先确认夹具保留显式缺失值、不将 `None` 偷换成默认值；在模块解析参数之前注入 argv，避免导入后 patch 导致测试越过预期分支或访问真实网络。若凭证失效规则同时校验权限，构造过期/origin 负例时先固定其余条件，以证明命中的确是目标分支而不是更早的权限拒绝。
- 验收浏览器专员时，用目标 Profile 自己的真实 worker 完成输入、点击及结果变化断言，并加入故意失败的断言验证其如实报告；保留可追溯工具记录、断言结果、截图与临时服务关闭证据。静态页面截图只证明页面内容，手写摘要不是原始执行轨迹；reviewer 用另一套工具复跑只能佐证那条工具链，不能替代目标 Profile 自身交互能力证据。夹具能力验证不等于业务系统验收。
- 对 doctor 与配置报告分别核对快照时间、具体检查项及影响范围；同样的 blocking 数量不代表同样的原因。将插件注册、技能裸名加载、自动记忆实际效果与共享组件既有告警分层报告，不以“旧问题”豁免目标 Profile 新增缺陷，也不为消告警擅改共享组件。
- 文本/配置类需求的验收要**程序化比对**：把结果读回后逐字对照（如把 profile.yaml 的折叠标量与用户原文去空白后比较长度与逐字符差异），哈希、计数、集合差都用代码算并打印；目测拼写或凭记忆断言都不算验收。
