# 协作看板（task-board）桌面插件

Hermes 桌面 App 的自研插件：**复刻看板插件全部功能，并为每张任务卡内嵌「执行回放」**——
直接在抽屉里看 worker 会话的完整执行过程（用户消息 / 思考过程 / 工具调用及参数 / 工具输出），
多 Agent 编排流程（lane、依赖门控、完成通知）与原看板完全一致。

## 功能

- **看板全功能**：多板切换、lane 分列（含按 Profile 分列）、卡片 CRUD、评论、依赖
  （parents 门控）、附件、批量操作、诊断、runs/inspect/terminate、reclaim、specify、
  reassign、估算、dispatch、WebSocket 实时刷新、完成通知、编排设置。
- **执行回放（新增）**：卡片抽屉新增「执行回放」tab。自动取该卡最近一次 run 的
  `worker_session_id` + profile，拉取会话时间线并按 App 主题渲染（深色一致，全部使用
  `--ui-*` 主题变量）；多次运行可切换；无会话时优雅回退到工作单元日志。
- **卡级模型路由**：模型 + 思考程度（none/minimal/low/medium/high/ultra）在卡片上直接
  选择（新建对话框与抽屉侧栏同款选择器，复用聊天输入框的 ModelCatalogMenu），
  dispatcher 派生 worker 时带 `-m <模型> --provider <p> --reasoning <档>`，真实生效。
- 快捷键 ⌘⌥B 打开看板（与原看板 ⌘⌥N 错开）；两个插件可并存。

## 架构（为什么需要一个合并后端）

桌面插件 REST **按插件 id 严格隔离**：`ctx.rest` 只能访问 `/api/plugins/<自己的id>/*`。
协作看板要同时用两套后端（看板全功能 + 会话回放），唯一做法是做一个合并后端用户插件：

```
~/.hermes/plugins/task-board/dashboard/plugin_api.py
  ├─ importlib 按路径加载打包版 kanban 的 plugin_api.py（<安装根>/plugins/kanban/dashboard/）
  │   → 看板全功能路由，随 Hermes 安装版本化，不漂移
  ├─ 加载 kanban-sessions 的 plugin_api.py（会话回放：/boards /tasks /task /log /session）
  └─ 两个子 router include 进一个父 router 暴露为 `router`；另有 /_health 自检
```

前端桌面插件 `id='task-board'`，REST 自动 scoped 到 `/api/plugins/task-board/*`。
原 kanban-sessions（纯后端）保留：它同时服务旧「看板会话」入口。

## 安装

### 1. 后端（gateway 侧）

```bash
cp -R backend/dashboard ~/.hermes/plugins/task-board/dashboard
hermes config set plugins.enabled --force "['omh', 'task-board']"   # 保留已有启用项，按需增删
# 多 Profile 使用则每个 Profile 重复：
cp -R backend/dashboard ~/.hermes/profiles/<name>/plugins/task-board/dashboard
hermes -p <name> config set plugins.enabled --force "[..., 'task-board']"
hermes gateway restart
```

### 2. 前端（桌面 App 源码）

```bash
cp -R frontend ~/.hermes/hermes-agent/apps/desktop/src/plugins/task-board
cd ~/.hermes/hermes-agent/apps/desktop
npm run build                       # vite 构建不跑类型检查，另跑：
npx tsc --noEmit -p tsconfig.json   # 过滤 task-board 报错，清零为准
# 部署渲染层到运行中的 App（旧版先备份）：
REL=release/mac-arm64/Hermes.app/Contents/Resources/app.asar.unpacked
mv $REL/dist <备份路径> && cp -R dist $REL/dist
```

重启桌面 App 后，侧边栏出现「协作看板」（defaultEnabled: true）。

### 3. QA

`e2e/task-board-qa.spec.ts`：沙箱启动 App → 断言插件注册 → 注入带 `worker_session_id`
的完成卡 → 打开抽屉执行回放 tab → 桌面（1440×900）与手机（390×844）双视口截图。
运行：`npx playwright test e2e/task-board-qa.spec.ts`（注意沙箱首启的 setup/connecting
浮层会盖住界面，spec 内的 `liftOverlays` 以 `display:none` 方式绕过——**不要 remove**，
React 拥有的节点被移除会让渲染层崩溃）。

## 已验证

- 合并后端 `/_health` 200：`kanban_router: ok, sessions_router: ok`（default + leader 双 Profile）。
- 端到端：`/task?board=&task=` → runs[].worker_session_id → `/session` 返回 14 步时间线。
- 模型路由三档实测：glm-5.3+high（11 条 reasoning 消息，~60s）、glm-5.3-flash+none
  （0 条 reasoning 消息，16s）、默认档对照——`-m/--provider/--reasoning` 全部真实传导。
