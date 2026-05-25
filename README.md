# AIGC 带货视频生成系统

> TikTok Shop 电商场景下的 AIGC 带货视频端到端生成系统：素材上传 → 剧本生成 → 基础分镜 → 一键成片 → 任务进度 → 预览导出。

## 一句话价值

让商家在「填一张商品信息表 → 点一次按钮」之内，拿到一条 ≤15 秒、可直接发布到 TikTok Shop 的带货短视频。

## 已实现功能（P0 全部完成）

- **素材库**：拖拽上传图片/视频，本地存储，支持删除
- **商品建模**：标题 / 卖点 / 目标人群 / 场景 / 主图 / 画幅
- **剧本生成**：调用火山方舟 Doubao-Seed-2.0-pro，结构化 JSON 输出 2-5 个分镜
- **基础分镜**：剧本只读 review，每个分镜包含画面描述、镜头运动、时长、字幕、BGM 暗示
- **一键成片**：图生视频（Doubao-Seedance-1.5-pro）/ 文生视频 + ffmpeg 拼接
- **任务进度**：SSE 实时推送，分镜状态机 (`pending → img_ok → video_ok → failed`)
- **预览导出**：HTML5 在线播放 + MP4 下载（720x1280 / 1280x720）

## 技术栈

| 层       | 选型                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| 前端     | React 18 + Vite + TypeScript + Ant Design 5 + TanStack Query + Zustand + React Router |
| 后端     | Node.js 22 + Express + TypeScript + Prisma + SQLite                                   |
| AI 文本  | 火山方舟 Doubao-Seed-2.0-pro（OpenAI 兼容）                                           |
| AI 视频  | 火山方舟 Doubao-Seedance-1.5-pro（异步任务 + 轮询）                                   |
| 媒体处理 | ffmpeg（直接 child_process spawn，可控）                                              |
| 任务编排 | p-queue（concurrency=5）+ 数据库持久化                                                |
| 进度推送 | SSE (Server-Sent Events) + 轮询兜底                                                   |
| 工程规范 | ESLint + Prettier + Husky + lint-staged + StyleLint                                   |

## 目录结构

```text
tiktop_shop/
├─ apps/
│  ├─ web/                # React 前端 (vite, 端口 5173)
│  └─ api/                # Express 后端 (端口 8787)
│     ├─ src/
│     │  ├─ modules/      # material / product / script / creation / task
│     │  ├─ providers/    # volcArk (LLM) / volcSeedance (视频)
│     │  └─ lib/          # ffmpeg / queue / storage / prisma / logger
│     └─ prisma/          # schema + SQLite
├─ packages/
│  └─ shared/             # 前后端共享 Zod schema 与类型
├─ storage/               # 素材/分镜/最终视频落盘（gitignored）
└─ scripts/               # 工具脚本（check-ffmpeg 等）
```

## 快速开始

### 日常启动（每次开发都看这里）

打开 PowerShell，**一条命令**：

```powershell
cd d:\tiktop_shop
pnpm dev
```

即可同时启动前端和后端，看到这样的输出表示成功：

```text
apps/web dev:   VITE v6.x  ready in 700+ ms
apps/web dev:   ➜  Local:   http://localhost:5173/
apps/api dev:   api listening port=8787 modelMode=...
```

然后在浏览器打开 <http://localhost:5173/>。

要停止服务：在跑 `pnpm dev` 的终端窗口按 `Ctrl + C` 即可。

> 详细的启动流程、模型模式切换、调用链路与每个文件的作用，看 [`docs/项目讲解.md`](docs/项目讲解.md)。

### 首次安装（仅一次）

```powershell
# 1. 环境（保证以下命令都能运行）
node -v          # ≥ 20
pnpm -v          # ≥ 9 (没装则 corepack enable; corepack prepare pnpm@latest --activate)
ffmpeg -version  # ≥ 6

# 2. 安装依赖
cd d:\tiktop_shop
pnpm install

# 3. 配置 .env
copy .env.example .env
copy .env apps\api\.env
# 如需真模型,在 apps/api/.env 中填:
#   MODEL_MODE=live
#   ARK_API_KEY=...
#   ARK_TEXT_MODEL=...
#   ARK_VIDEO_MODEL=...

# 4. 初始化数据库
pnpm --filter @tiktop/api prisma:push
```

### 模型模式切换

`.env`（**记得修改 `apps/api/.env`，不是根目录那份**）中 `MODEL_MODE`：

- `MODEL_MODE=mock`：用桩剧本 + ffmpeg 纯色占位，无需 API Key，跑通整条链路 ~2 秒
- `MODEL_MODE=live`：调用火山方舟真实模型，单次完整生成约 90-120 秒

## REST API

| Method | Path                    | 说明                                 |
| ------ | ----------------------- | ------------------------------------ |
| GET    | `/api/health`           | 健康检查                             |
| GET    | `/api/materials`        | 素材列表（可按 productId 过滤）      |
| POST   | `/api/materials`        | 上传素材（multipart, 字段 `file`）   |
| DELETE | `/api/materials/:id`    | 删除素材                             |
| GET    | `/api/products`         | 商品列表                             |
| POST   | `/api/products`         | 创建商品                             |
| GET    | `/api/products/:id`     | 商品详情                             |
| POST   | `/api/scripts`          | 根据 productId 生成剧本              |
| GET    | `/api/scripts/:id`      | 剧本详情                             |
| POST   | `/api/tasks`            | 用 scriptId + ratio 启动一键成片     |
| GET    | `/api/tasks/:id`        | 任务状态 + 分镜进度                  |
| GET    | `/api/tasks/:id/events` | SSE 实时进度流                       |
| GET    | `/api/tasks/:id/output` | 下载最终 MP4                         |
| GET    | `/static/*`             | 静态资源（素材、分镜片段、最终视频） |

## 任务状态机

```text
queued
   → script_generating → script_ready
   → shots_running     ⇄ failed
   → stitching
   → succeeded
```

分镜状态：`pending → video_ok | failed`。任一分镜失败则整任务 failed（P0 选择整体失败，便于评审复现）。

## 工程规范

- ESLint 9 flat config + `@typescript-eslint` + React Hooks 规则
- Prettier 100 列、单引号、尾随逗号
- StyleLint stylelint-config-standard
- Husky `pre-commit` 通过 lint-staged 跑 `eslint --fix` + `prettier --write` + `stylelint --fix`
- `pnpm typecheck` 全包类型检查；CI 接入时跑 `pnpm typecheck && pnpm lint`

## 里程碑

- [x] M1：Monorepo 骨架 + lint/format/husky + Prisma + 素材上传/列表
- [x] M2：Doubao 文本 Provider + 剧本生成 + 分镜只读展示
- [x] M3：Seedance Provider + ffmpeg mock 占位 + 本地落盘
- [x] M4：任务编排 + p-queue + SSE 进度 + ffmpeg 拼接
- [x] M5：预览/导出 + README + 端到端联调

## 待办（不在 P0 范围）

- P1：素材 Embedding / 智能剪辑 Agent / 分镜级编辑器 / TTS&字幕 / Mock 数据看板
- P2：多因子归因 / A/B / CI/CD / 可观测性 / 合规审核流

## 团队信息

> 待填写：队名、成员（姓名 / 学校 / 专业 / 角色）、分工

## 演示步骤建议

1. 打开 <http://localhost:5173/materials>，拖入一张商品图
2. 切到「新建视频」，填入标题、卖点（标签输入，回车确认）、目标人群、场景、画幅
3. 点「生成剧本」→ 看到 3 个分镜的只读卡片
4. 点「一键成片」→ 跳转到任务详情，实时看 SSE 进度
5. 完成后点「前往预览」→ 在线播放 + 下载 MP4

## License

MIT
