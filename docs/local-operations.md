# 本地工作台运行与交付手册

适用：已有 `aicreater-workbench` 私有服务的单用户本机。**不是公网部署指南。** 已在用户批准的维护窗口对真实API/网页执行冷启动验收：原组现场核验后TERM，实际前台owned启动/CTRL+C释放端口、预编译生产网页启动均通过，最后恢复原开发网页模式。基础容器、worker/beat未停，原数据/配置/媒体不变，无新生成任务。新服务身份以现场核验为准，不沿用历史PID。证据：[只读检查](../output/workbench/deployment-review/readiness.json)、[恢复验收](../output/workbench/recovery-drill/latest.json)。

## 1. 当前已核验与边界

> 2026-11-03 起对象存储改为火山 TOS，本机 RustFS（19000）及其数据卷已删除；下面带 RustFS 的条目是当时的核验记录。

- API8000 ready、网页3000 HTTP200；workflow/render control ping均pong；RustFS19000 `/health` HTTP200。
- PostgreSQL15432、Redis16379、RustFS19000、API8000、web3000实际监听全为127.0.0.1；不只看compose声明。
- API未知Host与非白名单Origin均403；无多用户鉴权，禁止公网反代/端口转发/0.0.0.0绑定，CORS不是鉴权替代。
- `.env`和`.env.local-services`均0600，`.gitignore`忽略私有配置/生成音频/输出。初次核查没有Git元数据；目前新Git仓库已初始化但尚无提交、文件未跟踪，不能据此声称历史提交无密钥，也未擅自作首次提交。
- 任务attempts=58、queued/running=0；只读检查未新增任务。此数字是检查时快照，不可作为以后重启的依据。
- 容器PG16.13、Redis7.4.8运行healthy；Compose和两套隔离测试现已固定已验收RepoDigest，映射到原运行imageID；RustFS1.0.1原digest不变，compose未定义其healthcheck，已另查HTTP健康。摘要值见compose.postgres.yaml。
- 镜像固定验收：134离线+87真实临时PG测试通过，临时IPv6API8000（原IPv4API未停）真实PG/Redis/Celery/RustFS本地渲染通过；冻结/去重/取消0attempt/匿名403/缺缓存回填验证。原容器ID/StartedAt与6表/原件/凭据不变；独立测试资源已清理，无供应商调用。证据 `output/workbench/image-pin-qa/receipt.json`。这是当前linux/arm64的实证，不外推其他CPU或新增机器。
- beat和应用尚无系统开机自启；日志在 `output/workbench/`，旧 `services.json` 的PID可能已经过期，严禁直接照旧PID停止。

## 2. 先检查，再启动（基础服务/手动队列命令本轮未执行）

### 受控前台启动器（macOS）

`npm run workbench:status`（同`python3 -m services.workbench status`）只读检查本机依赖/PG活动计数、8000/3000监听的cwd/命令/启动时间与HTTP健康；输出不含配置、第三方command或文稿。`npm run workbench`（同`python3 -m services.workbench run`）前台仅启动缺失API/网页，复用同项目健康服务但不接管；二者已有时报告并直接退出。未知/非回环/身份变化/不健康listener拒绝，不释放端口、不自动修复。

成功`status`保留`code/services/tasks`并新增`disk`：`available_bytes`为ROOT所在文件系统当次可用bytes，`threshold_bytes=21474836480`（20GiB）；严格低于才`state=low`，等于或高于为`ok`。OS读取失败为`state=unavailable,available_bytes=null`，不输出异常或路径。低余量/读取失败不改变成功status的退出码0，不启动/停止/阻断任务；基础健康或身份核验原有错误仍非零，此时不保证提供独立磁盘信息。`run`完全不调用磁盘检查。

这是手动运行时快照，不是后台监控/容量预留；APFS共享空间和其他应用随时变化，Docker VM/卷额度另算，不能当作渲染成功保证或删除授权。没有新参数/配置/依赖/API，旧receipt不重写；全对象严格对比的外部消费者需允许新增`disk`。验证见[磁盘预警记录](../output/workbench/disk-warning-qa/receipt.json)。

需本人0600普通`.env`/`.env.local-services`、lsof/ps、当前Python/npm/依赖，以及已经就绪的PG和可访问的TOS私有桶。配置通过dotenv读取，不需source；不运行compose或覆盖配置，不安装/构建。网页命令为`npm run web`开发模式，不自动改成生产模式；已有生产网页可识别复用，冷启生产网页继续人工管理。数据库查询强制只读且短超时，但真实API冷启动本身仍会初始化schema/桶，工具不能把它说成只读。

Ctrl+C/TERM仅请求停止：有queued/running或DB无法查询，保留本次活进程，提示人工处理后再次Ctrl+C。idle只向本次持有的活Popen group发送TERM；等待父进程和非zombie进程组退出，超时/权限或核验失败留阻塞，不KILL。已退出leader的group仅只读核验，不沿用旧PGID去杀子进程；可能孤儿需要现场核验。没有跨终端stop、PID文件、守护进程或自启。SIGKILL/掉电无法保证回收，也没有原子停写锁；其他操作者可能在查询之后提交任务。

没有worker/beat启动入口；以下人工命令必须另行确认收费队列。外部worker若已运行仍可能消费用户后来提交的任务，默认工具无队列启动不等于整个平台禁止收费。启动失败回收也按同样任务闸门；不能安全回收时保留owned进程、明确阻塞，不碰复用服务、卷或日志。

验证：[启动器记录](../output/workbench/controlled-startup-qa/receipt.json)与[实际冷启动记录](../output/workbench/cold-start-qa/receipt.json)。隔离fixture/本机复用早已通过，2026-10-14批准窗口现真实停原API/web并用前台工具owned冷起，CTRL+C exit0、两端口释放；相同API命令恢复后，预编译`npm run web:start`生产页与7静态script、项目/冻结版/音频/MP4/SRT hash、陌生Host/Origin403通过。生产网页仅本次owned组TERM，现已恢复原`npm run web`开发模式；不自动改变默认模式。原containerID/StartedAt/6表/配置/原媒体与73对象inventory不变、58attempts/0active，真实worker/render/beat的启动时间均早于窗口，未重启。详见`queue-processes.json`。维护日志现在`output/workbench/cold-start-qa/{api,web,production-web,controller}.log`，旧`api.log/services.json`不是当前启停依据。

这是应用服务冷启与HTTP/静态资源/下载验收，不含整机/基础容器重启、独立浏览器逐功能回归或原子全平台停写。消费者仍运行而用户暂停提交，不能阻止第三方并发写入；API启动仍执行既有schema/桶检查。未改业务代码/依赖，未重复全套测试/构建，不把既有单测数字冒充此次重跑。未调用模型/配音/render或自动恢复付费队列。

后续[独立浏览器只读回归](../output/workbench/post-cold-browser-qa/receipt.json)实测Python11章与RAG9章选取、编辑控件/高级JSON读取、静音Player前进与暂停、重新载入；实际链接经browser fetch/CORS传MP4首1024bytes及完整字幕校验一致。不点击保存/收费/任务提交或浏览器本地下载事件，不冒称这些写/收费流程已验收。2次hydration提示diff对应Tabbit tray注入html属性，原SSR没有，未添加suppressHydrationWarning掩盖其他SSR错误。原服务/表/配置/媒体不变、58attempts/0active；自己的临时页关闭且finish正常，原用户页未接管。

需要Node22+、Python3.10+、Docker/Compose、ffmpeg/ffprobe、当前固定npm/Python依赖。新机先 `npm ci`、虚拟环境内 `pip install -r requirements.txt`、`npm run typecheck` 与 `npm run web:build`。首次Chrome下载需要网络。当前机器已有私有配置，**不得覆盖它们或重新运行示例生成命令去覆盖音频**。

从仓库根目录操作，勿开shell `set -x`，勿把配置内容发聊天：

```bash
# 只列已发布服务，不输出环境变量。
docker compose --project-name aicreater-workbench --env-file .env.local-services \
  -f compose.postgres.yaml ps
lsof -nP -iTCP:3000 -iTCP:8000 -iTCP:15432 -iTCP:16379 -sTCP:LISTEN
# 仅在确实停止时恢复基础服务，不用其他project-name新建另一套卷。
# 镜像引用配置已变，首次up可能重建容器；先确认停写/队列闸门与备份，勿对运行服务盲目执行。
docker compose --project-name aicreater-workbench --env-file .env.local-services \
  -f compose.postgres.yaml up -d --wait
# 只读查排队/运行任务；有generate/regenerate/voice任务则先确认是否允许继续收费。
docker compose --project-name aicreater-workbench --env-file .env.local-services \
  -f compose.postgres.yaml exec -T postgres \
  psql -U aicreater -d aicreater -c "SELECT kind,state,count(*) FROM jobs WHERE state IN ('queued','running') GROUP BY kind,state;"
```

固定digest防版本漂移，但也停止自动获得后续安全更新；版本更新必须单独批准/隔离验收。即使image字节相同，Compose引用变化也可能在下次up重建容器，本轮未执行原stack up/recreate。启动应用之前确认无不应执行的旧付费任务；API启动会初始化仓库，worker/beat启动后会消费既有队列。没有活动任务也不能保证别人随后不提交。

### 一条命令启动（2026-11-04 起，取代 Celery / Redis / Beat）

`npm run workbench` 拉起 API、网页和任务执行器（`python -m services.runner`），Ctrl+C 一起停止。各进程自己读取 `.env.local-services` 与 `.env`，不需要 `source`。

- 执行器每条队列一个进程（workflow：配音、对齐、Agent；render：整课导出、主题重渲染），空闲时每 2 秒向 PostgreSQL 领一个排队任务。排队、租约、续租、取消都在 `jobs` 表与 `services/projects/leases.py`，多个执行器（甚至在别的机器上）通过数据库锁协调，不会重复执行。
- 启动时数据库里已有排队/运行中的任务，执行器不自动启动（输出 `runner_not_started_jobs_waiting`）：先在网页核对这些任务，再手动运行 `.venv/bin/python -m services.runner`。
- 执行器收到一次 Ctrl+C / SIGTERM：做完当前任务再退出；第二次：中止当前任务，任务标为失败，不自动重试。启动器在有任务进行中时不停止任何进程。
- `next dev` 偶尔会自己退出以显示升级提示，再次运行即可继续；启动器会自动重启网页一次（输出 `web_restarted_once`）。
- PostgreSQL 容器设为 `restart: unless-stopped`，重启电脑或 Docker 后自动恢复。旧的 Redis 容器已停用（数据卷保留，可删除）。

单独排查时也可以分开运行：`.venv/bin/python -m uvicorn services.api.app:app --host 127.0.0.1 --port 8000 --no-proxy-headers`、`.venv/bin/python -m services.runner --lane workflow`、`npm run web`。

健康检查：`npm run workbench:status`（API、网页、执行器、排队任务、磁盘余量），或 `curl --fail http://127.0.0.1:8000/health`。

## 个人中心 GPT Image 2 配置（需维护窗口启用）

新增配置入口位于 `/account`，现有密码修改保留。账号可设置自己的公网 HTTPS Base URL/API Key、替换或删除；不开放管理员读取他人密钥。保存不调用供应商，不测试模型兼容性，也不产生生图任务。第三方地址需本人确认可信，不在 URL 填写密钥。不支持本机、内网、HTTP、带用户信息/查询参数/片段的地址。

1. 在已信任的本机终端离线生成一次 Fernet 密钥，例如 `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`。仅在本机私有 `.env` 设置 `ACCOUNT_CREDENTIALS_KEY=<生成值>`，不要发送到聊天/日志或配置为 `NEXT_PUBLIC_`；保持文件0600，独立备份该值。不要覆盖已有有效值。
2. 确认已安装 `requirements.txt`（新增明确依赖 cryptography 46.0.5），按本手册任务检查与受控停启流程重启API。启动时既有schema初始化会创建 `user_image_settings`；网页开发模式刷新即可，生产模式需重新构建发布。不要盲目重启worker或恢复收费队列。
3. 登录个人中心，保存地址和API Key。页面只显示已保存状态，不回显密钥，不能将“已保存”理解为“服务可用”。缺少/错误加密配置会明确拒绝保存；读取状态和删除不依赖加密密钥。

DB中的密文没有独立加密密钥就无法解密；丢失或直接更换加密密钥后，需要每个账号重新填写自己的 API Key。地址改变必须重新填 Key，防止把旧供应商密钥自动带给新地址。删除配置不影响已有课程/图片。初始开发与临时库测试未改动真实配置或服务；后续用户授权重启时已补充本地服务加密密钥并重启API/网页。尚未执行浏览器端完整验收。用户要求保存时不做网络验证，现仅保留URL格式/显式本机内网地址检查，不执行DNS、连通性或模型测试，避免代理Fake-IP误拦截。未来生图发送时仍必须实现目标安全与代理兼容策略，不能将保存成功当作连接可用或免除请求时的安全保护。

## 3. 安全停机

1. 停止提交任务，记录需要保留的任务/版本；先停beat（其启动终端Ctrl+C）。
2. 查PG当前queued/running与真实进程。等待运行完成；若必须取消，用现有明确取消入口，不删jobs行。queued不一定消失，恢复worker可能继续收费。
3. 在各自终端Ctrl+C正常停worker/web/API；后台进程需现场核对PID、命令和工作目录后仅发TERM。禁止宽泛pkill、killall或沿用旧JSON的PID。
4. 应用已停止后，如需停基础服务，用相同compose project/env/file参数执行`stop`（保留容器与卷）。`down`也必须同组参数且**不加`-v`**。切勿运行volume prune或删除私有配置。

## 4. 备份与恢复边界（本机演练通过，生产/异地仍待）

已完成真实演练：备份位于 `/Users/lizexi/.local/share/aicreater/backups/20261013-214017-d1f0bc83/`（0700，362090292bytes）；`database.dump`、`files.tar.gz`、73个私有对象与manifest为0600，私有配置为AES256/PBKDF2加密，独立密钥 `/Users/lizexi/.config/aicreater/backup-keys/20261013-214017-d1f0bc83.key`（0600），不在HTTP静态目录。**不要公开/丢失密钥或将备份直接上传公开桶；它仍是同机同盘，不是异地冗余。**

恢复6张表（23项目/19版本/136场景/17候选/58jobs/58attempts），2865文件含词缓存、固定字体和源码，73对象保持bytes/内容类型/sha256 metadata；解密配置仅内存比对，不注入消费者。显式回环in-process API验证原项目/版本与完整C冻结版、音频、MP4/SRT下载；只删除恢复副本MP4缓存并从新S3回填，重用不可变上传验证metadata兼容。全部hash匹配，原DB/资产/对象不变、活动0/attempt58。仅本轮2临时容器、网络、恢复目录已清理，保留备份/密钥。

运行环境说明：本机Docker的`--internal`网络不发布HostPort（实测null）；改用单独`enable_ip_masquerade=false` bridge与随机127.0.0.1端口。无真实供应商环境/无Redis、beat或worker，但**不声称完全airgap**。无后缀的活跃`output/workbench/beat`日志不参与一致集合，普通`.log`同样排除；保留字体包但其余node_modules与.next不备份。默认TestClient非回环被403正确拒绝，最终使用与现有测试相同的回环peer，不放宽API。原服务未停，凭首尾完整行/文件/对象hash与恢复结果相等确认空闲时演练，不等同生产并发原子备份。

named volume只提供持久化，不是可恢复备份。备份必须在停写窗口形成一致集合：PG dump、TOS私有桶对象、renderer/public实际音频/words侧车/渲染缓存、DSL/交付物、固定版本依赖/字体hash，以及独立加密保存的私有配置。words侧车不可假设已上传S3，丢失后本地timing无法恢复。Redis仅固定唤醒，不当作权威任务备份。

正式恢复仍使用新的隔离目标：新project-name/随机回环端口/新库新桶新目录，没有真实供应商凭据、beat、workflow consumer，禁止`pg_restore --clean`指向现有库。恢复后验证项目与旧快照、音频/词侧车/SRT/MP4 hash、只读下载，再决定是否允许重启调度。禁止把恢复出的queued付费任务自动执行；本次数据无queued/running，不能外推所有未来备份都安全。

未写入或试恢复原用户库/对象卷；执行的是有assert闸门的一次性运维演练，不提供通用一键恢复承诺。生产停写与异地存储/密钥冗余、磁盘额度、失败目录/对象GC、HA/外部IAM/开机自启仍在[TODO](TODO.md)。

## 5. 资源盘点与清理边界

[资源盘点](resource-audit.md)记录当前主机约52.6GiB可用、项目目录/备份和3个已归属卷的占用。36音频/54发布文件hash匹配，73个S3内容key全部被DB引用；6个旧示例无words侧车不能本地重对齐，已交付Python/RAG完整课侧车都在。本轮没有补配音、清理或quota。118个未直接匹配文件（含54个已知attempt文件）不是可删清单；全主机Docker可回收缓存/卷可能归其他项目，严禁据此prune或删除，备份/密钥/词缓存/旧版本/诊断先保留。阈值、保留期限、删除范围与开机收费消费须先由用户确认，盘点不代替生产策略。

## 6. 许可交付

[版本许可初筛](dependency-license-review.md)指出Remotion不是MIT、当前Redis7.4.8不是BSD；商用主体/员工与协作规模、用途/分发方式未确认。仅导出成片与打包软件的许可义务不同，不把本机运行正常当作商业发布许可。字体OFL与已安装GPL FFmpeg再分发须保留相应声明/源码义务；不擅自购买许可、换服务器或重新拉镜像。

## 火山 TOS 对象存储

配音音频、Agent 视频（源码、MP4、字幕、审查帧）与整课导出都存入 TOS 私有桶，配置在 `.env`：`TOS_REGION`（如 `cn-beijing`）、`TOS_BUCKET`、`TOS_ACCESS_KEY`、`TOS_SECRET_KEY`；`TOS_ENDPOINT` 留空即 `https://tos-s3-<region>.volces.com`（S3 兼容端点，虚拟主机风格）。桶须在控制台预先建好、不加桶策略，AK/SK 用只授权该桶的 IAM 子用户。不设 `TOS_BUCKET` 时媒体只留本机缓存。

本机目录（`apps/renderer/public/generated/`、`output/visual-workbench/`）是渲染用的缓存：缺失时下载与导出会从 TOS 取回并校验哈希。Agent 视频上传失败时任务仍会发布（付费结果不丢），日志提示补跑 `python -m services.projects.sync_storage`——它把数据库引用的全部音频与已发布视频文件上传到 TOS，按内容哈希寻址，可重复执行，输出 `missing`/`failed` 应为 0。配音上传失败则配音任务失败。words 侧车文件不上传，见上文备份说明。
