# Reference-Driven Script Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let generated scripts reuse a selected reference video analysis report.

**Architecture:** React lets the user select a reference-video打法. Node resolves the selected `ReferenceVideoAnalysis` from Prisma and passes a compact report to Python. Python script generation uses the report as creative guidance and records trace evidence.

**Tech Stack:** React/Ant Design, shared Zod DTOs, Express/Prisma, Python FastAPI provider.

---

### Task 1: Request Schema

**Files:**
- Modify: `packages/shared/src/api.schema.ts`
- Modify: `apps/agent/src/agent_app/schemas.py`

- [x] Add optional `referenceAnalysisId` to `GenerateScriptReq`.
- [x] Add `ReferenceAnalysisInput` to Python `ScriptGenerateRequest`.

### Task 2: Node Bridge

**Files:**
- Modify: `apps/api/src/modules/script/script.service.ts`

- [x] Load selected `ReferenceVideoAnalysis`.
- [x] Pass compact report fields to Python `/scripts/generate`.
- [x] Keep existing behavior when no reference is selected.

### Task 3: Python Script Provider

**Files:**
- Modify: `apps/agent/src/agent_app/providers/ark_text.py`

- [x] Add selected reference report into mock and live prompts.
- [x] Add trace showing reference report was used.

### Task 4: Web UI

**Files:**
- Modify: `apps/web/src/pages/NewVideo.tsx`

- [x] Load reference videos.
- [x] Add a “参考视频打法” selector.
- [x] Send selected `referenceAnalysisId` to `generateScript`.

### Task 5: Verify

- [x] Run Python tests.
- [x] Run `pnpm typecheck`, `pnpm lint`, and web build.
