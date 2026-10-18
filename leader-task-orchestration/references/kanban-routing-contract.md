# Kanban 模型与思考等级的入口合同

用于解释、排查或扩展创建任务时的卡级路由；这是源码检查和验收步骤，不是已实施的补丁或稳定版本功能表。

## 先定位缺口

1. 加载 hermes-agent，确认当前安装源码与项目约定；读实际工具 Schema 和 CLI help，不从数据库字段推断公开参数。
2. 追踪工具 Schema → handler → create_task → 保存与读回 → dispatcher → worker 参数 → provider 请求。分别报告各层支持状态。
3. 可从以下源码位置开始查找，但每次重新定位定义与用法，不依赖旧行号：
   - `tools/kanban_tools_schemas.py`：创建工具的公开字段。
   - `tools/kanban_tools.py` 的 `_handle_create`：参数传递与创建返回字段。
   - `hermes_cli/kanban_parser.py`、`hermes_cli/kanban.py` 的 `_cmd_create`：CLI 参数与传递。
   - `hermes_cli/kanban_db.py` 的 `create_task`、`normalize_reasoning_effort`：存储和规范化。
   - `hermes_cli/kanban_db_dispatch.py`：worker 命令构造。
   - `agent/reasoning_effort.py`：provider 等级映射。
4. 若底层已支持而入口缺参，只提出补齐 Schema、handler、CLI parser 和 CLI handler 的最小变更；检查返回投影是否遗漏新字段。未确认缺失前不新增数据库迁移或重写派发器。

## 参数语义

- 将 model 与 provider 作为匹配的一组传递，沿用既有 provider 依赖 model 的校验。
- 将 reasoning_effort 作为独立可选项；不填保留继承，不能偷偷填入默认高档。区分继承空值与显式关闭思考的语义。
- 复用底层规范化和错误处理，禁止非法值创建半成品卡。
- 用任务正文记录决策理由，但不以正文替代可执行字段。
- CLI 示例只有在当前 help 和解析测试确认后才能称为可执行；未实现的新参数必须标注为目标用法。

## 验收矩阵

使用隔离看板和无副作用夹具，不借测试恢复用户已暂停的任务。

- Schema 确实暴露字段，工具调用能保存并读回该字段。
- CLI 输入同样保存并读回；遗漏参数维持原继承行为。
- 仅设置思考等级而不指定模型可以工作。
- 合法等级、继承、显式关闭（模型允许时）与非法值均覆盖；非法值无残留任务。
- 派发命令包含指定模型、provider 和思考参数，不影响其他任务与 Profile 默认值。
- 至少一次受控 worker 调用验证目标端点接受参数；区分输入值、映射值、实际服务模型及回退。用实际用量和日志佐证模型身份，不声称能直接测量内部推理质量。
- 核对运行组件加载的版本与工具 Schema。源码测试通过不能证明当前长会话已刷新工具定义；在新会话确认字段可见并可调用，若需重启先评估共享会话影响。

## 与 OMH、Jev 的衔接

先核验 OMH 类别链及 provider 再取建议，过滤未验证模型和不符合订阅/配额政策的候选。类别链全落到一个模型时，不称为模型多档路由。对子代理生效的配置不能冒充已写入持久看板。

Jev 的工作流选择建议不是现成的模型复杂度基准。需要模型选择实验时先定义最小任务摘要、候选、unknown 选项与评价标准，并遵守当前工具的逐轮同意和外发说明要求；不得绕过工具去调用端点，也不得把概率或 confidence 当授权。
