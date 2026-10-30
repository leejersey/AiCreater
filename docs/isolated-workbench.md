# 当前改造版的独立本地环境

工作目录：`/Users/lizexi/Documents/AI/Agent/ai-video/AiCreater`。

此环境与旧目录`/Users/lizexi/Documents/AI/AiCode/AiCreater`分开运行，不共享数据库、Redis、对象卷或Celery调度文件。私有配置为根目录`.env.local-services`，已被Git忽略且权限为0600；不得覆盖或公开。根目录`.env`保留已有供应商配置，权限已收紧为0600。

| 服务 | 本机入口 |
| --- | --- |
| 工作台 | http://127.0.0.1:3000 |
| API健康 | http://127.0.0.1:8000/health |
| PostgreSQL | 127.0.0.1:25432 |
| Redis | 127.0.0.1:26379 |
| 私有对象存储 | 127.0.0.1:29000 |
| 独立视觉样片预览 | http://localhost:3101/ReviewedAssembly |

Docker项目名称固定为`aicreater-visual-lab`，卷名前缀相同。不要使用旧的`aicreater-workbench`项目名启停本环境，也不要删除任一环境的卷。

## 启动

先检查现有监听和进程，缺失时才启动，不叠加Worker或Beat。以下是当前机器的Node/Python路径：

```sh
export PATH="$PWD/.venv/bin:$HOME/.nvm/versions/node/v24.11.1/bin:$PATH"
docker compose --project-name aicreater-visual-lab --env-file .env.local-services \
  -f compose.postgres.yaml -f compose.storage.yaml -f compose.isolated.yaml up -d --wait --pull never
npm run workbench:status
npm run workbench
```

`workbench`只启动API和网页。三个执行进程分别在独立终端启动，各终端先设置上述PATH并加载本环境服务配置：

```sh
set -a
source .env.local-services
set +a
```

```sh
# 终端一：分镜、配音等工作流消费者
python3 -m celery -A services.workflow.queue:app worker -Q workflow \
  --hostname=visual-lab-workflow@%h --concurrency=1 --loglevel=WARNING \
  --pidfile=output/workbench/visual-lab/workflow.pid
```

```sh
# 终端二：视频渲染消费者
python3 -m celery -A services.workflow.queue:app worker -Q render \
  --hostname=visual-lab-render@%h --concurrency=1 --loglevel=WARNING \
  --pidfile=output/workbench/visual-lab/render.pid
```

```sh
# 终端三：只运行一个本环境Beat
python3 -m celery -A services.workflow.queue:app beat --loglevel=WARNING \
  --schedule=output/workbench/visual-lab/beat-schedule \
  --pidfile=output/workbench/visual-lab/beat.pid
```

本次启动日志位于`output/workbench/visual-lab/`。初次启动为空库，未导入原账号或课程，请在网页注册新账号。启动时任务数为0，没有提交模型、配音或渲染任务；之后在页面提交生成/配音会调用已有供应商配置，可能产生费用。已有队列非空时，重新启动消费者前须确认是否继续执行。

## 状态和边界

本次实际检查API ready、网页HTTP200、两个独立消费者ping pong并分别监听workflow/render队列，Beat使用独立PID和schedule。浏览器登录页正常。原目录的消费者和Beat保持运行，未停止或重配。

Next.js启动器报告当前版本存在安全升级提示。首次启动因此退出，按原命令重启后已运行；本次没有升级依赖。仅用于回环地址的本机开发，不开放公网。

主课程入口现接入定制视觉工作流，详见[visual-workbench.md](visual-workbench.md)。3101保留先前独立样片作视觉参考；旧模板工作台仅通过课程的`/legacy`入口访问，不是新流程失败时的回退路径。更新代码后须在无活动任务时重启本环境API及两个消费者，确保旧进程加载新队列实现。

停机先停止提交任务、核对活动任务，正常停止本环境Beat和消费者，再停止本环境工作台。不要使用宽泛pkill或旧记录中的PID；数据库和对象卷必须保留。当前未配置系统开机自启。

## 动作意图模式激活

2026-10-25已在当前改造版接入host-intent API、队列和网页选项，缺省source不变。核对工作目录、命令、PID及无排队/运行任务后，仅温和重启本环境两个消费者及API/网页，旧目录与Beat未动。关闭时首次监听检查遇到瞬态状态而中止，确认端口空闲后才补启动。Next.js首次启动因现有安全升级提醒主动退出，按同命令重启一次后连续20秒保持API/web ready；没有添加绕过参数、升级依赖或改动卷。

运行API OpenAPI枚举实测source/host-motion/host-intent，默认source；两个visual-lab消费者pong，任务仍为空。新源码执行仍需具体SHA批准；尚无新模式的真实供应商请求、浏览器交互/截图或视觉验收，不能把接线和模拟测试当作成片达标。生产构建仍有先前记录的SecurityFatalError，未重报为通过。
