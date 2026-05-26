# 电商场景 AIGC 带货视频生成系统

> 当前版本：`p1-python-agent-v0.3`
>
> 面向 TikTok Shop / 电商带货场景的 AIGC 视频生成系统。系统已经从 P0 的“一键生成基础视频”升级到 P1：加入 Python FastAPI Agent、LangGraph 工作流、素材分析、智能剪辑计划、失败重试、分镜编辑、字幕/BGM 后处理、生成 trace 和数据看板。

## 当前完成度

### P0 已完成

- 素材上传、素材列表、素材删除与本地静态资源访问。
- 商品建模：标题、卖点、目标人群、使用场景、画幅等。
- 大模型生成结构化带货脚本。
- 根据脚本分镜调用 Seedance 生成视频片段。
- 使用 FFmpeg 拼接分镜视频，并保留音频。
- 任务进度、SSE 实时推送、任务详情、预览和下载。

### P1 已完成

- Python Agent 服务：`FastAPI + LangGraph`。
- 素材分析：为素材生成标签、摘要、embedding 向量，并支持相似度检索。
- 智能剪辑 Agent：根据商品、脚本和素材生成分镜级剪辑计划。
- 分镜级编辑：支持修改单个分镜、重新生成单个分镜并重新拼接。
- 失败重试 Agent：对生成失败原因做决策，例如 prompt 简化、时长修正、重试次数限制。
- 字幕/BGM 后处理：支持拼接后字幕渲染，保留视频原音，预留 BGM/TTS 扩展点。
- 生成过程 trace：记录脚本、剪辑、重试、拼接、后处理等关键事件。
- 数据看板：展示生成因子与转化效果的 mock 分析，并给出中文 Agent 优化建议。
- Python Pipeline 模式：脚本生成、视频生成、重试、拼接、后处理可以交给 Python 执行，Node 作为主 API 网关保留。

## 系统架构

当前采用“Node 主后端 + Python AI Agent 服务”的组合：

```text
React 前端 -> Node.js Express API -> Python FastAPI Agent/LangGraph
                         |
                         -> Prisma + SQLite
                         -> 静态文件 / SSE / 任务状态
```

```mermaid
flowchart LR
  Web[React Web] --> API[Node Express API]
  API --> DB[(SQLite / Prisma)]
  API --> Storage[本地素材和视频文件]
  API --> Agent[Python FastAPI Agent]
  Agent --> Graph[LangGraph 工作流]
  Graph --> Text[Doubao 文本模型]
  Graph --> Video[Seedance 视频模型]
  Graph --> FFmpeg[FFmpeg 拼接和后处理]
  Agent --> API
```

这样设计的原因是：

- Node 继续负责前端接口、数据库、上传文件、任务状态、SSE、静态资源，避免 P0 已有框架大改。
- Python 负责 AI Agent、LangGraph 编排、大模型调用、视频工作流、失败重试和媒体后处理，更符合 Agent 开发习惯。
- 前端只调用 Node API，不直接面对两个后端，整体结构不割裂。

## 技术栈

| 模块         | 技术                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| 前端         | React 18、Vite、TypeScript、Ant Design、TanStack Query、Zustand、React Router、ECharts |
| Node 主后端  | Node.js、Express、TypeScript、Prisma、SQLite、SSE、Multer                              |
| Python Agent | Python 3.11、FastAPI、Uvicorn、Pydantic、LangGraph、LangChain Core、httpx、numpy       |
| 大模型文本   | 火山方舟 Doubao 文本模型，OpenAI 兼容接口                                              |
| 视频生成     | 火山方舟 Doubao Seedance 视频模型                                                      |
| 媒体处理     | FFmpeg                                                                                 |
| 工程化       | pnpm workspace、ESLint、Prettier、Ruff、pytest                                         |

## 目录结构

```text
tiktop_shop/
├─ apps/
│  ├─ web/                 # React 前端，端口 5173
│  ├─ api/                 # Node Express 主后端，端口 8787
│  │  ├─ prisma/           # Prisma schema 和 SQLite
│  │  └─ src/
│  │     ├─ modules/       # material/product/script/task/trace/analytics/internal
│  │     ├─ providers/     # Node 侧模型 provider，保留 P0 兼容
│  │     └─ lib/           # prisma/storage/ffmpeg/agentClient/logger
│  └─ agent/               # Python FastAPI Agent，端口 8790
│     ├─ src/agent_app/
│     │  ├─ agents/        # material/editing/retry/analytics/pipeline graph
│     │  ├─ media/         # ffmpeg 和后处理
│     │  └─ providers/     # ark_text/seedance_video
│     └─ tests/            # pytest
├─ packages/shared/        # 前后端共享 Zod schema 和 TypeScript 类型
├─ scripts/                # 工具脚本，例如 smoke-p1.ps1、check-ffmpeg.mjs
├─ storage/                # 上传素材、分镜视频、最终视频，gitignored
├─ docs/                   # 项目讲解、计划、已知问题
└─ README.md
```

## 环境准备

### 1. Node 依赖

```powershell
cd D:\tiktop_shop
pnpm install
```

### 2. Python conda 环境

项目使用独立环境 `tiktop_agent_p1`：

```powershell
conda create -n tiktop_agent_p1 python=3.11 -y
conda run -n tiktop_agent_p1 pip install -e apps/agent[dev]
```

### 3. 配置环境变量

复制示例配置：

```powershell
copy .env.example .env
copy .env.example apps\api\.env
```

真实模型模式需要在 `apps/api/.env` 中配置：

```env
MODEL_MODE=live
PYTHON_PIPELINE_ENABLED=true
AGENT_BASE_URL=http://127.0.0.1:8790
ARK_API_KEY=你的火山方舟APIKey
ARK_TEXT_MODEL=你的文本模型endpoint
ARK_VIDEO_MODEL=你的视频模型endpoint
```

真实密钥不要提交到 GitHub。仓库只保留 `.env.example`。

### 4. 初始化数据库

```powershell
pnpm --filter @tiktop/api prisma:push
```

## 启动方式

推荐分别开三个 PowerShell 窗口：

```powershell
pnpm dev:agent
pnpm dev:api
pnpm dev:web
```

访问：

```text
前端：http://localhost:5173
Node API：http://127.0.0.1:8787/api/health
Python Agent：http://127.0.0.1:8790/health
```

## 冒烟测试

轻量测试，不生成真实视频：

```powershell
.\scripts\smoke-p1.ps1
```

完整测试，会真实消耗视频生成额度：

```powershell
.\scripts\smoke-p1.ps1 -RunVideoTask
```

该脚本会检查：

- Node API 是否在线。
- Python Agent 是否在线。
- 是否能创建商品。
- 是否能生成脚本。
- 是否能生成剪辑计划。
- 如果加 `-RunVideoTask`，还会启动真实视频任务、轮询状态并输出最终视频地址。

## 页面功能

| 页面           | 作用                                                                |
| -------------- | ------------------------------------------------------------------- |
| `/materials`   | 素材库，支持上传、删除、素材分析、标签/摘要/检索结果查看            |
| `/new`         | 新建视频，填写商品信息、生成脚本、请求 Agent 剪辑计划、启动视频任务 |
| `/tasks/:id`   | 任务详情，查看分镜、进度、trace、分镜编辑和单分镜重生成             |
| `/preview/:id` | 视频预览和下载                                                      |
| `/analytics`   | 数据看板，展示生成因子、转化效果和 Agent 优化建议                   |

## 核心 API

| Method   | Path                                          | 说明                       |
| -------- | --------------------------------------------- | -------------------------- |
| GET      | `/api/health`                                 | Node API 健康检查          |
| GET      | `/api/agent/health`                           | Python Agent 转发健康检查  |
| GET/POST | `/api/materials`                              | 素材列表、素材上传         |
| POST     | `/api/materials/:id/analyze`                  | 调用 Python Agent 分析素材 |
| GET      | `/api/materials/search`                       | 素材相似度检索             |
| GET/POST | `/api/products`                               | 商品列表、创建商品         |
| POST     | `/api/scripts`                                | 生成脚本                   |
| POST     | `/api/scripts/:id/editing-plan`               | 生成智能剪辑计划           |
| POST     | `/api/tasks`                                  | 启动视频生成任务           |
| GET      | `/api/tasks/:id`                              | 查询任务详情               |
| GET      | `/api/tasks/:id/events`                       | SSE 实时进度               |
| PATCH    | `/api/tasks/:taskId/shots/:shotId`            | 修改单个分镜               |
| POST     | `/api/tasks/:taskId/shots/:shotId/regenerate` | 重生成单个分镜             |
| GET      | `/api/traces`                                 | 查询生成 trace             |
| GET      | `/api/analytics/summary`                      | 数据看板摘要               |

## 验证命令

```powershell
pnpm typecheck
pnpm lint
pnpm check:ffmpeg
pnpm --filter @tiktop/web build
pnpm test:agent
pnpm lint:agent
```

## 已知问题

- Seedance 1.5 Pro 图生视频有时会对 `duration` 参数返回 400，当前 retry Agent 会在重试时修正时长，相关记录见 [`docs/known-issues.md`](docs/known-issues.md)。
- 数据看板目前是 P1 mock analytics，用于展示生成因子和优化建议，不代表真实投放数据。
- TTS/BGM 目前是 provider-ready 扩展点，P1 demo 重点是字幕渲染、音频保留和后处理链路。

## 演示建议

1. 打开 `http://localhost:5173/materials` 上传素材，并执行素材分析。
2. 打开 `http://localhost:5173/new` 创建商品，生成中文带货脚本。
3. 请求 Agent 剪辑计划，观察每个分镜的素材选择、字幕、BGM 和时长建议。
4. 启动视频任务，进入任务详情页观察 SSE 进度和 trace。
5. 视频完成后预览成片，修改一个分镜并重生成。
6. 打开数据看板，展示生成因子和中文 Agent 优化建议。

## 版本说明

当前 GitHub 新版分支建议使用：

```text
p1-python-agent-v0.3
```

如果要把这个版本固定归档，可以额外打 tag：

```powershell
git tag v0.3-p1-python-agent
git push origin v0.3-p1-python-agent
```

## License

MIT
