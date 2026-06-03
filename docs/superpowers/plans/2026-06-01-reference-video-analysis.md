# Reference Video Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal reference video library and structured ecommerce拆解 report pipeline.

**Architecture:** Node owns Prisma/SQLite, uploads, and API routes. Python Agent owns reference-video analysis: sample a few frames with FFmpeg, caption frames with the existing Doubao model configuration, then use the same Doubao text/chat endpoint to produce one structured report. React adds a simple “参考视频” page for upload, analyze, and report viewing.

**Tech Stack:** Prisma/SQLite, Express/TypeScript, React/Ant Design, Python FastAPI, FFmpeg, existing Ark/Doubao chat provider.

---

### Task 1: Data And Shared DTOs

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `packages/shared/src/api.schema.ts`

- [x] Add `ReferenceVideo` and `ReferenceVideoAnalysis` tables.
- [x] Add shared request/response DTOs for reference videos and analyses.

### Task 2: Python ReferenceAnalysisAgent

**Files:**
- Modify: `apps/agent/src/agent_app/schemas.py`
- Create: `apps/agent/src/agent_app/agents/reference_video_agent.py`
- Modify: `apps/agent/src/agent_app/main.py`

- [x] Add request/response schemas.
- [x] Sample keyframes from uploaded video with FFmpeg when available.
- [x] Caption sampled frames using the existing Doubao vision/chat model path.
- [x] Generate structured ecommerce analysis using the same Doubao text/chat endpoint.
- [x] Return fallback analysis in mock/error cases.

### Task 3: Node API

**Files:**
- Create: `apps/api/src/modules/reference/reference.service.ts`
- Create: `apps/api/src/modules/reference/reference.router.ts`
- Modify: `apps/api/src/app.ts`

- [x] Add list/create/upload endpoints.
- [x] Add analyze endpoint that calls Python Agent.
- [x] Persist analysis report and return DTOs.

### Task 4: Web UI

**Files:**
- Create: `apps/web/src/api/reference.ts`
- Create: `apps/web/src/pages/ReferenceVideos.tsx`
- Modify: `apps/web/src/App.tsx`

- [x] Add 参考视频 page to upload/record references.
- [x] Show analysis report cards.
- [x] Add analyze button and loading/error states.

### Task 5: Verify

- [x] Run Prisma generate/db push.
- [x] Run agent tests where relevant.
- [x] Run `pnpm typecheck`, `pnpm lint`, and web build.
