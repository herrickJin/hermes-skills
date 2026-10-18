# Jev 验证通道（OMH 的受控外发工具）

SKILL.md 里的「Jev 完成判定」一节是常用规则；这里是需要时才查的深度：同意边界、外发内容、状态枚举、形状上限、成本口径。

## 是什么

Jev（TypeSafe）是**非生成式概率预言机**：对带 `state` 的定型问题回概率与 confidence，不写文字。因此它无法被“说服”，只能被提问——这是它作为复核者的价值。

OMH 自带 6 个 `omh-jev-*` 技能，安装即 enabled：`omh-jev-ask`、`omh-jev-route`（guide）；`omh-jev-action-check`、`omh-jev-done-check`、`omh-jev-failure-triage`、`omh-jev-review-gate`（reviewer）。四个 reviewer 类的共同边界：

| 技能 | 能做什么 | 硬边界 |
|---|---|---|
| `jev-action-check` | 筛查危险命令（凭证、外发、爆炸半径） | **只能加 hold，不能放行** |
| `jev-done-check` | 判断已有证据是否支持“已完成”声明 | **只能提出反对** |
| `jev-failure-triage` | 失败运行下一步：重试 / 修依赖 / 要权限 / 换方案 | 不代你执行 |
| `jev-review-gate` | 给 diff 打风险旗 | **永不批准合并** |

## 路由与凭据

- 工具名 `omh_jev_ask`；两条固定路由 `typesafe`（`https://api.typesafe.ai/v1/systemone`，读 `<PROFILE>/.env` 的 TypeSafe 凭据）与 `openrouter`（仅当 `<omh_home>/jev/settings.json` 写了 `{"openrouter_route": true}` 才启用）。**URL 不从参数或环境变量取**，也没有 base-url 覆盖项。
- `route: auto` 优先 typesafe；**强制指定的路由在自己的凭据缺失时不会回退**。
- 该凭据必须在这种工具的**宿主 Profile 自己的 `.env`** 里（600）。它属于插件工具，只在**会话启动时**按凭据门控注册。
- 健康检查：`omh doctor` 的 `plugin_jev_sidekick` 行应显示 `route typesafe by variable name`；若写 `no route` 就是凭据没解析到。

## 同意边界（工具自身强制，不是策略）

- **只有用户本人在当下那一轮点名 Jev 才算同意。** 自己加载的技能、上一轮的提及、一句平平的“yes”都不算；工具会回 `consent_not_observed` 且不发送任何东西。
- **以下轮次永远不构成同意**：webhook / API / cron / 子代理 / 批量 / 单次查询（`hermes chat -q`）/ kanban worker。所以 Jev **不能当自动化编排的完成门禁**，也不要自建“人”的轮次去凑同意。
- 只有真人直接打字的界面（CLI / TUI / desktop / ACP / 聊天应用）能携带同意；转发/引用的消息读起来像本人说的，不确定就先确认。
- 想发起一次提问：先用一行说清 `state` 里会带什么，请用户回 `ask jev`。

## 什么会离开本机

- 发送：`state` 原样内容、每条问题的 id、instruction 与选项文本、模型 id、凭据（Bearer）、带 oh-my-hermes 的 User-Agent。**不发送** Hermes 会话 id 与 `purpose`。
- OMH **只把 `state` 与问题**发出去，不额外添东西——所以 `state` 里放什么就发什么：命令、工作目录与文件路径、源码 diff、测试/错误输出、文件内容。**凭据形态的文本会被拒收（不是屏蔽）**。
- 账本：`<omh_home>/jev/asks.jsonl`，每次 ask 一行 metadata-only（`ask_id` / `status` / `api_status` / `route` / `question_count` / `question_sha256` / `usage` / `session_ref`），**不存凭据、`state`、问题文本与回答**。被拒的调用也会留一行（`consent_not_observed`、`api_status: 0`）——这是证明“真的调过且零字节外发”的最好证据。
- 出口路径自查：若有本地代理接管 DNS，只看目标主机名不代表内容暴露——**查对端证书签发者**确认 TLS 终结在厂商而不是本地中间人，再谈“只看得见主机名”。

## 状态：只有一个是回答

`answered`（`ok: true`，带 `answers`）是唯一答案。其余全部 `ok: false` 且 `answers: null`：`consent_not_observed`、`key_missing`、`key_unresolvable`、`invalid_request`、`rejected_by_api`、`auth_failed`、`permission_denied`、`payment_required`、`rate_limited`、`overloaded`、`server_error`、`timeout`、`network_error`、`rejected_redirect`、`malformed_response`。

**非答案要报成 `not_observed`（附 `rule: not_answered:<status>`），绝不能当成 Jev 的结论。** 回报时带 `status` / `ask_id` / `served_model` / cost 来源。

重试语义：工具**只自动重试 429 与 503/529**（明确“请求未被处理”的回执）。**其它 5xx、timeout、网络错误都不重试**——因为请求可能已经被收到并计费，工具选择报出来交给人决定。

## 形状上限与语言

- `state` + 最长问题 ≤ 32k tokens；整个请求 ≤ 64k；请求体 > 256 KiB 在开 socket 前就被拒。
- `choice` 最多 255 个选项（**应带一个 `unknown` 或 `none`**）；`score` 2–10 个有序等级；`noul` 的 criteria 只能有 `true`/`false`。
- **问题 id 模型看不到**——每条 instruction 必须自足。
- **英文效果最好，CJK 差**：给 Jev 的 claim/问题写英文。
- `done_check/v1` 最多 6 个 claim。其它 preset：`failure_triage/v1`、`review_flags/v1`、`action_check/v1`；preset 总是发固定版本，free-form 用 pin 版号（如 `jev-1.13.0`）才好比对阈值。

## 成本

TypeSafe 按输入计费（约 $0.042 / 百万输入 tokens，输出 $0），免费额度外会真实计费到用户账户；OpenRouter 路由按网关回报的成本。**成本必须如实标注来源**（`estimated_from_list_price` / `reported_by_gateway` / `unknown`），不要默默当 0。

## 健康使用的规矩

- **不问 Jev 代码能算的东西**：计数、日期、算术、字符串检查。
- **confidence 是答案集中度，不是行动许可**；`noul` 的阈值不能套到 `choice` 上（choice 是相对的，noul 是绝对的）。
- 一个 claim 一次问，不合并；问之前先把 `state` 收窄到“这些问题真正需要的证据”。
- `done_check` 返回的反对意见要逐条处理（修正或撕回该 claim）之后才能报完成。
- 连通性/可用性验证按**分层**下结论，把已验证层与未验层分开写：路由解析 → 新会话里工具注册 → 同意闸门真拦（用一次非人轮次拿 `consent_not_observed` + 账本零字节）→ 端点可达与证书真实 → **凭据有效（必须一次用户在场的提问，无法代劳）**。前四层过了只能说“链路与闸门通了”，不能说“连通可用”。
