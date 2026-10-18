---
name: builder-deploy-ops
description: "builder 的部署上线、发布、回滚与本机 Docker 环境维护流程；在本角色任务中加载。"
version: 1.0.0
---

# builder-deploy-ops

角色目标：把已构建完成的变更可靠送进运行环境，并把"确实生效、环境健康、退路可用"用可复核证据固化下来。

本技能只覆盖部署与运维执行。**不写业务功能代码**（交 engineer），**不替 reviewer 下审查结论**。

## 0. 开工前置

```bash
# 工具链
docker version --format '{{.Server.Version}}'; docker compose version; jq --version; curl --version | head -1
docker context ls                      # 确认操作的是哪个 endpoint（本机为 orbstack）
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}'
```

必须读到的输入（缺一即停，写清缺什么并 `kanban_block`）：

- 任务卡 + 上游 engineer 交付说明（任务 ID、提交号 / 镜像 digest / 发布包路径 + `MANIFEST.json` 版本）。
- 目标项目的部署约定：`/Users/jinmo/workspace/hit-ark/AGENTS.md`（本机所有 Docker 部署的总约定），以及目标项目自己的 `bin/` 脚本与 `doc/`（如 `/Users/jinmo/workspace/hit-ark/server-deploy/doc/ops-guide.md`、`/Users/jinmo/workspace/hit-ark/server-deploy/doc/de-deploy-guide.md`）。
- 目标服务清单、Compose 文件绝对路径、Compose 服务名、Compose project 名。

**无版本不部署**：产物没有可追溯版本时不要"先上再说"。

## 1. 变更前快照与退路（不可跳过）

```bash
SNAP=/Users/jinmo/workspace/<项目>/temp/deploy-$(date +%Y%m%d-%H%M%S); mkdir -p "$SNAP"
docker ps -a --format '{{.Names}}\t{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}' | sort > "$SNAP/containers-before.txt"
# 目标容器细节
docker inspect <target-container> --format 'ID={{.Id}} Image={{.Image}} StartedAt={{.State.StartedAt}} RestartCount={{.RestartCount}} Health={{if .State.Health}}{{.State.Health.Status}}{{end}}'
# 数据备份（走项目通道，别自己 dump）
cd /Users/jinmo/workspace/hit-ark/server-deploy && bash bin/sd infra backup    # → runtime/backups/sd-backup-<ts>.tar.gz
```

同时记录：本次回滚命令、回滚到的版本（上一版发布包 / 上一个镜像 tag / 上一个提交号）、备份绝对路径与校验值（`shasum -a 256`）。

**回滚路径不可用就不开工。**

## 2. hit-ark 的两条部署通道（本机主力项目）

### 2.1 开发/测试栈：`server-deploy/bin/sd`

入口即总文档：`cd /Users/jinmo/workspace/hit-ark/server-deploy`。

```bash
bash bin/sd list                                   # 服务清单
bash bin/sd status <svc>                           # 单服务状态
bash bin/sd update <svc> [--branch b]              # 仓库→打包→发布 Nacos 配置→密钥分发→重启（三级解析：仓库 / 发布包 / 克隆）
bash bin/sd package <svc>                          # 调仓库 script/linux/package.sh 打包
bash bin/sd release <svc>                           # 产出 releases/<svc>.tar.gz（无源码部署用）
bash bin/sd start|stop|restart|logs <svc>
bash bin/sd top --once                              # 资源视图
bash bin/sd nacos publish <svc>                     # 手工补发 Nacos 配置
bash bin/sd apisix sync                             # 聚合渲染路由并热加载
bash bin/sd keys distribute <svc>                   # 分发 RS256 密钥到服务运行时
bash bin/sd infra backup [路径]                     # 数据备份
bash bin/sd infra m2m-reconcile                     # M2M 凭证对账（漂移按 .env 对齐库）
bash bin/sd infra reissue-credentials               # 重签 M2M 凭证并回填 .env
bash bin/sd dist build [--services a,b] [--version v]   # 服务端 compose 编排包（整包 / 补丁包）
bash bin/sd all up [--mode source|release|auto]     # 一键全量——局部更新不要用它
```

**用局部命令，不用 `sd all up`**：`sd all up` 是全量通道，日常只更新某服务时必须走 `sd update <svc>` / `sd restart <svc>`。

### 2.2 正式发布包通道：`deploy/ark-server/bin/*`

`cd /Users/jinmo/workspace/hit-ark/deploy/ark-server`。此目录由 `sd dist build` 渲染，`compose.yaml` 为生成物（`name: ark`，`include` 收编 `compose.d/de-llm-gateway.yaml`、`compose.d/de-knowledgebase-server.yaml`）。

```bash
bin/install.sh                 # 首启 bootstrap，幂等，每步存在即跳过
bin/update.sh <发布包.tar.gz>   # 更新：entire(整包) / patch(补丁包) / static(静态包) 三种形态由包内 MANIFEST.json 的 type 决定
bin/status.sh                  # 版本 + compose ps
bin/logs.sh                    # 日志
bin/start.sh | bin/stop.sh
cat VERSION MANIFEST.json      # 当前部署版本与包内容
```

- **整包** = load → 产物同步进本目录（保留 `.env`）→ 地址自适配 → Nacos 重放 → **无参 `compose_up_retry`（`update.sh:211`）= 全项目 `compose up -d`**（`lib/common.sh` 注释原文：「默认无参 = 全量 up -d」）。**范围不是局部的**：严格限定服务范围的更新不要用整包路径。
- **补丁包** = load → 把非补丁服务的镜像 tag 恢复为现网值 → **`compose up -d $svcs`（`update.sh:169`）= 范围受限，只重建包内服务**（秒级）。范围受限的更新走这里或 `sd update <svc>`。
- **静态包** = 原地 rsync 替换前端产物（`ark-app` / `console`），无镜像。
- **回滚 = 拿上一版发布包重跑 `bin/update.sh`**。
- **收编服务（`kb` / `de-llm-gateway`）的更新一律走全量包通道**：补丁包渲染的是全量 compose 骨架，会把 `compose.d` 收编服务的镜像 tag bump 成 patch tag，而补丁包只构建 `$svcs` 的镜像 → tag 漂移、`force-recreate` 拉取 403。这是已实证事故，不要重犯。

### 2.2.1 两条包路径的**无条件副作用清单**（部署前必须预期，报告里必须记录）

以下动作在 `bin/update.sh` 里**不带条件**执行（唯一守卫是 `docker ps` 里存在 `sd-apisix`），整包与补丁包路径都有：

- `docker restart sd-apisix`（`update.sh:219-222` 整包 / `:175-177` 补丁）——先经 `apisix_pubkey_backfill` 回填 consumer 公钥，再重启生效并清 upstream DNS 缓存（不重启会导致 8443 静默 502 或 jwt-auth 全线 401）。
- `mesh_pg_bootstrap`——`sd-postgres` 内幂等自举 `network_deployment` 库/角色，失败仅告警。
- 整包路径额外调 `gw-bootstrap.sh`（LLM 网关自举）与 `kb-bootstrap.sh`（WeKnora 管理账号自举），均为幂等 fail-soft。

后果：**`sd-apisix` 一定会出现在非目标容器 diff 里**（容器 ID 不变，`StartedAt` 与 STATUS 时长变了）。

处理方式（不要二选一偷懒）：

1. 部署前先记录 `sd-apisix` 的旧 `ID` 与 `StartedAt`；
2. 部署后看到它变了，**核对容器 ID 是否仍相同**（ID 不变 = 只是被脚本重启，不是被重建）；
3. 在部署报告里**显式写明**：`sd-apisix` 被 `update.sh` 无条件重启，容器 ID 未变、`StartedAt` 已变，原因是 pubkey 回填 + DNS 缓存清理；**并抄录脚本自身的输出行**——整包路径输出短句 `sd-apisix 已重启`（`update.sh:221`），补丁路径输出长句 `sd-apisix 已重启（公钥回填生效 + DNS 缓存清理）`（`:176`）；对照实际走的那条路径抄对应那句。拿不出该日志行 = 不支持这个例外，按普通非目标容器变动处理。
4. 对**目标 compose project 之外**的容器仍执行严格 diff 判据（ID + `StartedAt` 逐条不变）；project 内被带动的容器按 §3 的判据处理（列明 + tag 未降级）。

不许把这个已知副作用当作「验证通过」一笔带过，也不许因为它而误判部署失败去回滚。

### 2.3 通用（其他本机 compose 项目）

```bash
cd <项目>
docker compose -f docker-compose.yml --env-file .env up -d --no-deps <service>   # 只更新目标服务
docker compose -f docker-compose.yml ps
docker compose -f docker-compose.yml logs --tail=100 <service>
```

先确认 project 名与 service 名（`docker compose config --services`），避免误伤同名服务。

## 3. 部署后读回验证（命令退出码不算证据）

```bash
# 目标容器：版本 / 启动时间 / 健康 / 重启次数
docker inspect <target-container> --format 'Image={{.Config.Image}} Started={{.State.StartedAt}} Health={{if .State.Health}}{{.State.Health.Status}}{{end}} Restarts={{.RestartCount}}'
# 全量对比：目标 project 之外的容器 ID 与启动时间必须逐条不变（见下方判据）
docker ps -a --format '{{.Names}}\t{{.ID}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}' | sort > "$SNAP/containers-after.txt"
diff "$SNAP/containers-before.txt" "$SNAP/containers-after.txt"    # 逐行按 project 归属判定，不要一律当失败
# 先判定每个容器的 compose project 归属（**不要按容器名前缀猜**）
docker ps -a --format '{{.Names}}' | while read n; do
  printf '%-32s %s\n' "$n" "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$n")"
done | sort -k2
# 就绪日志
docker logs --tail=50 <target-container>
# 端口/接口探活（用项目真实入口，不臆造 URL）
curl -sf -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/<真实路径>
```

判据（**按 compose project 归属分层**，先判定归属再下结论；本节是唯一权威表述，§2.2.1/§7/§8 均指向这里）：

- **目标 project 之外** —— 即 `com.docker.compose.project` 标签为**其它 project 名**，或**无该标签**的独立容器（本机实例：`de-node` 无 project 标签）：**ID 与 StartedAt 必须逐条不变**。这才是「未波及」判据。
  - ⚠ **不要按容器名前缀猜归属**：hit-ark 的 `deploy/ark-server` 项目里，infra 服务用 `container_name: sd-*` 命名（`sd-mysql`/`sd-apisix`/`sd-nacos`…），业务服务用 `ark-*` / `kb-*` 命名——**它们同属 project `ark`**，不是「项目外」。本机 26 个容器中 25 个属 `ark`，1 个（`de-node`）无 project 标签。
- **目标 project 之内**：`up -d` 会按 `depends_on` 带动本项目的依赖容器；整包路径的 `sed` 无参 `compose_up_retry` 更是全项目 `compose up -d`；`sd update <svc>` 的失败自愈还会 `down --remove-orphans`（不带 `-v`，数据卷保留）。要求：被带动的容器仍健康、镜像 tag/digest **未被降级或改写**，并在报告中**逐条列明**（名称 + 旧/新 ID + 旧/新 StartedAt + 镜像 tag）。
- **唯一允许的脚本无条件重启**：`sd-apisix`（见 §2.2.1）。该容器 **ID 必须不变**，`StartedAt` 变化须写明原因，**并抄录脚本输出行**（整包路径出「`sd-apisix 已重启`」，补丁路径出「`sd-apisix 已重启（公钥回填生效 + DNS 缓存清理）`」）。拿不出对应日志行 = 不接受该例外，按普通非目标容器变动处理，也不允许用「手工重启」套用此例外。

`sd` 通道用 `bash bin/sd status <svc>`，发布包通道用 `bin/status.sh`，两者都要落到报告里。

## 4. 失败即回滚

1. 按第 1 步记录的回滚路径恢复（上一版发布包重跑 `bin/update.sh`；镜像回退到记录的旧 tag；数据用 `sd infra reset --restore <备份.tar.gz>`）。
2. 恢复后**重新**跑第 3 步验证，确认已回到已知良好状态。
3. 报告失败原因、影响面、当前实际状态、需要谁决定什么。不留下半部署状态，不带病收工。

## 5. 日常维护（巡检 / 排障 / 配置变更）

**只读巡检**（不改状态，可随时做）：

```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}'
docker ps --filter health=unhealthy --format '{{.Names}}\t{{.Status}}'     # 不健康清单
docker inspect <c> --format '{{.Name}} restarts={{.RestartCount}} started={{.State.StartedAt}}'
docker stats --no-stream
docker volume ls; docker system df
cd /Users/jinmo/workspace/hit-ark/server-deploy && bash bin/sd top --once
bash bin/sd status <svc>; bash bin/sd logs <svc>
```

**配置与密钥变更**（受控，先备份）：走项目通道 —— `sd nacos publish <svc>`、`sd keys distribute <svc>`、`sd infra m2m-reconcile`、`sd infra reissue-credentials`。**不直接编辑运行中容器的文件**，改 `.env` 前先备份（`chmod 600`）。

**APISIX 路由/配置变更的判定规则（`sd apisix sync` 是热加载，默认不做）**：

- `sd apisix sync` 的官方说明就是"聚合渲染路由并**热加载**"，`server-deploy/infra/apisix/` 下的路由文件还是宿主 bind mount —— 执行它等于**热更新**，与"服务永远不使用热更新"直接冲突。
- 默认禁止。**仅当任务明确授权**时才执行，且必须在部署报告里标注：这是热加载通道、属已知部署债（APISIX 配置尚未收敛为版本固定产物）、本次变更未满足不可热更新要求。
- 任务没有明确授权但变更确实需要改 APISIX 路由时：`kanban_block`，说明需要授权或需要先把 APISIX 配置收敛成镜像产物。
- 收敛该部署债需要改部署结构（属 engineer 的实现范围），不要在运维任务里顺手用 bind mount 生效。

**备份**：`sd infra backup` 产出 `runtime/backups/sd-backup-<时间戳>.tar.gz`；`server-deploy/testdata/` 有 restore 流程与基线。恢复演练属破坏性操作，必须有任务内明确授权。

**破坏性操作清单**（无授权一律 `kanban_block`）：`sd infra reset`、`down -v`、删卷、`docker volume rm`、批量重建、`sd all up/down`、切主版本、清 DE 实例。

## 6. 常见坑（来自本机实证事故记录）

1. **bind-mount 的 inode 断链**：`rm -rf` + 重建 `config/ark-app`、`config/console` 会让运行中的 nginx 容器断链返回 403。这两个目录归静态包通道独占管理，只能原地 `rsync`。
2. **补丁包不要动 `compose.d` 收编服务**：见 2.2，tag 漂移会让 `force-recreate` 拉取 403。
3. **存量卷 + 缺 `.env` = 禁止重新生成**：`install.sh` 检测到 `sd-mysql-data` 而 `.env` 不存在时会直接 fail（重新生成随机密钥会与卷内密码漂移，nacos Access denied / kb 28P01 / llm AES 校验失败连环爆，且旧值不可找回）。正确做法：找回原 `.env`，或走 `update.sh` 升级路径。
4. **AES key 必须 base64 解码后恰好 32 字节**：`LLM_GATEWAY_PROVIDER_KEY_AES_KEY`、`KB_WEKNORA_AES_KEY` 用 `openssl rand -base64 32`；曾用 `-base64 48` 导致部署机首启即崩。
5. **Nacos 登录失败时配置重放会跳过**，这是降级不是失败；补救是 DB 直写 `nacos_config.config_info` 后 `docker restart sd-nacos`。
6. **`sd infra reset` 不清 hindsight 两卷**（`sd-hindsight-data` 记忆资产 + `sd-hindsight-hf` 模型缓存）；要彻底清必须手工 `docker volume rm`。
7. **APISIX / 静态资源仍是宿主 bind mount**（部署债）：改这些文件会即时影响运行容器，等于热更新——按约定应改成版本固定的镜像产物，不能在运维任务里顺手用 bind mount 生效。
8. **`bin/update.sh` 的整包路径不是局部的**：`update.sh:211` 以无参调用 `compose_up_retry`，`lib/common.sh` 注释明确"默认无参 = 全量 `compose up -d`"。要严格限定服务范围，走 `sd update <svc>`，或使用补丁包（`update.sh:169` 的 `compose up -d $svcs`）。文件中不存在"已经修好的局部版 update.sh"——不要假设它已收敛。
9. **`update.sh` 一定会重启 `sd-apisix`**（见 §2.2.1）。这不是失败信号，但必须记录；漏记就等于产出不实证据。
10. **macOS 上跑本项目部署脚本必须用 Homebrew bash 5**（`/opt/homebrew/bin/bash`）：系统 bash 3.2 在 `set -u` 下把 `$var（` 里的多字节 `（` 当变量名字符，直接 unbound 中止（update.sh 的 `"应用 $type 包: ${ver}（服务: ...）"` 等行必踩）。`#!/usr/bin/env bash` 按 PATH 解析，终端环境里 `bash` 是 3.2。
11. **server-deploy/deploy 两树的多个 GNU-only 依赖在 macOS 会静默炸**（`set -e` 下无报错退出）：`dist.sh:189` 的 `hostname -I`（BSD 无此参数）、`infra.sh:508/511` 的 `find -printf`、`infra.sh:513` 的 `date -Is`、`deploy/ark-server/bin/lib/common.sh` `ark_addr_rewrite` 的 `sed -i`（BSD 必须带后缀）。旁路方案：PATH 垫片目录放 `hostname`/`sed`/bash `find` 函数包装，不改项目代码；修复源码属 engineer。
12. **补丁包通道不做地址改写**（`ark_addr_rewrite` 仅在 update.sh 整包路径，:205）：包内 config 烤的是 server-deploy 源里的打包机地址（本仓烤的是 175.27.240.152），而本机部署是 127.0.0.1（`.ark-addr-rewrite` 标记 + `.env` 的 `ARK_ADVERTISE_IP`）。本机应用补丁前必须先对解包产物跑一遍 `ark_addr_rewrite`（manifest.packer_ip 须改成包内实际烤入的地址再调用，否则「包内未发现该 IP——跳过」假成功），再重打包应用，否则 Nacos 会被重放成不可达地址。
13. **凭据漂移事实**：`server-deploy/infra/.env` 与运行栈 `deploy/ark-server/.env` 的 `MYSQL_ROOT_PASSWORD` 不同（后者才是 sd-mysql 实际凭据），`sd infra backup` 直跑必 1045。备份用 shim 叠加权威 .env 调 `infra_backup`，不修改任何 .env。漂移收敛（m2m-reconcile 类）须单独授权。
14. **重建 de-node 容器前先查活动任务**：`docker logs de-node` 里出现 `executing command ... action=deploy` 而无后续完成日志时，节点有进行中任务（对应错误码 7002 的语义），此时重建/重启容器会打断部署任务——先挂起并报告，不要硬来。
15. **de-node 容器重建配方**（本机实证）：① 镜像 `script/linux/docker-build.sh --version 0.1.0-<commit>` 需要预置 agent：宿主无 `~/.de-node/shared/` 时从 `de-node-data` 卷取（`docker run --rm -v de-node-data:/data:ro -v <out>:/out alpine cp -a /data/shared/agent-* /out/`）；② 该 agent 的 `venv/pyvenv.cfg` home 指向容器内 Linux 路径，脚本要求构建机存在——从旧镜像取 CPython（`docker run --rm --entrypoint /bin/sh de-node:<旧> -c 'tar -C / -cf - root/.local/share/uv/python/...'`）并只改**暂存副本**的 pyvenv.cfg home 指过去（原件不动，entrypoint 首启会重接）；③ 运行参数：`--network host -v de-node-data:/data --restart unless-stopped --cap-add NET_ADMIN --device /dev/net/tun --env-file <原容器 DE_NODE_* env>`——缺 NET_ADMIN/tun 则 nebula 报 `operation not permitted`，组网面起不来；重建前务必 `docker inspect` 存下 CapAdd/Devices/Binds/Env 全量，别只记网络和卷。
10. **de-node 容器重启循环 = 单实例残锁**：`de-node run` 的单例锁写在容器内 temp_dir（`entrypoint.sh` 用 `env -i` 启动，无 USER/TMPDIR → 固定为 `/tmp/de-node-unknown.lock`），位于容器可读写层、`docker restart` 不清除。首次 pid-1 进程非正常退出（未走 Drop 删锁）后，每次重启新的 pid-1 恰好也是 `de-node run`，cmdline 含 "de-node" 被 `process_alive` 误判为旧实例存活 → 永久自锁重启循环（日志特征：反复输出「本机已有 de-node 在运行…pid: 1…启动时间: <旧值>」）。修复（不重建容器、不碰数据卷）：`docker stop de-node` → 空文件 `docker cp` 覆盖 `de-node:/tmp/de-node-unknown.lock`（`singleton.rs` 把不可解析锁当残锁自动接管）→ `docker start de-node`；验证 `docker logs de-node` 出现 `connected to ws://…/ws/node` 与 `agent 就绪`，且 `ark-de-node-server` 日志出现 `node N connected`。

16. **sd-postgres 的密码验证必须在应用网段做，容器内测试全部无效**：pg_hba 对 `local` 与 127.0.0.1/::1 是 `trust`——在 sd-postgres 容器里用 `PGPASSWORD` 测任何密码都会成功（假阴性），密码校验只对 `host all all all scram-sha-256`（外部来源）生效。验证某密码是否真实有效，用 `docker run --rm --network ark_default -e PGPASSWORD=... postgres:17-alpine psql -h postgres -U <role> -d <db>`；同理 `psql -U postgres` 会报 role 不存在，超级用户角色是 `llm_gateway`（`POSTGRES_USER`）。排查 28P01 时先确认测试路径走的是 scram 网段，再下结论「密码对/不对」。
17. **ark-gateway（de-llm-gateway）admin 接口全 500 + unhealthy = 镜像烤入的 `configs/config.yaml` DSN 密码覆盖 env**：该镜像把 `database.url`（含旧密码）烤死在镜像内，且优先于正确的 `LLM_GATEWAY_DATABASE_PASSWORD` env 生效，网关即永远 28P01 连不上库（症状：控制台「供应商目录加载失败 500 管理操作失败」）。定位：`docker logs ark-gateway-1 | grep 初始化失败` 确认 28P01 → 对比 `/app/configs/config.yaml` 内嵌密码与 env 密码（按坑 16 的网段方式测）。修复属镜像构建问题（config 改 env 驱动），交 engineer；不要用 ALTER ROLE 把库密码改回旧值来绕（破坏 .env 对齐约定，且属凭证变更需单独授权）。修复上线前此坑持续存在，网关 admin 面不可用属预期状态。

## 7. 部署报告模板（写进任务卡 / 交付文件）

```
任务 ID：t_xxxx
目标：<环境> / Compose project=<name> / 服务=<svc1,svc2>
产物版本：<提交号 | 镜像 digest | 发布包 + MANIFEST version>
构建命令：<原文>
部署命令：<原文>
部署前快照：<SNAP 绝对路径>/containers-before.txt
部署后核对：
  - 目标容器 <name>：旧 ID/镜像 → 新 ID/镜像，启动时间 <old> → <new>，健康 <status>
  - 目标 project 之外的容器：ID 与启动时间逐条一致（附 project 归属判定输出）
  - 目标 project 之内被带动的容器：逐条列明（名称/旧新 ID/旧新 StartedAt/镜像 tag），并确认 tag 未降级
  - 已知例外（如走 update.sh 通道必填此栏）：sd-apisix 被脚本无条件重启（ID 不变、StartedAt 变、原因：pubkey 回填 + DNS 缓存清理），附脚本原输出行
健康与功能验证：<命令 + 关键输出>
备份：<绝对路径> sha256=<...>
回滚路径：<命令 + 目标版本>（演练：是/否）
未完成/限制：<...>
结论：已部署且验证通过 | 已执行但验证未通过（已回滚到 <版本>）| 未执行（原因）
```

## 8. 完成判据（收工前自检）

- [ ] 产物版本可追溯，且读回验证的版本与目标一致。
- [ ] 容器核对按 §3 的 project 归属判据完成：**目标 project 之外**逐条 ID+StartedAt 未变；project 内被带动者已逐条列明且镜像 tag 未降级；`sd-apisix` 若走 `update.sh` 通道则按 §2.2.1 记为例外并抄录脚本日志行（容器 ID 必须不变）。
- [ ] 健康与关键入口验证有真实输出。
- [ ] 备份存在且校验值已记录；回滚命令与目标版本已写明。
- [ ] 部署报告已落盘/落卡，凭证未出现在任何报告、日志片段或聊天里。
- [ ] 需要独立复核的证据（命令、时间、前后对比）齐备，已交 reviewer。
