# Agent/RAG Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Agent/RAG planning result visible and traceable from video tasks.

**Architecture:** Keep Node as the API/Prisma owner and React as the presentation layer. Persist the `editingPlanId` used by each `VideoTask`, return the bound `EditingPlan` in task DTOs, and show the plan, shot reasons, source material ids, and trace in the task detail UI.

**Tech Stack:** Prisma/SQLite, Express/TypeScript, shared Zod DTOs, React, Ant Design, React Query.

---

### Task 1: Persist EditingPlan On VideoTask

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/modules/task/task.service.ts`
- Modify: `packages/shared/src/api.schema.ts`

- [x] Add optional `editingPlanId` and `editingPlan` relation to `VideoTask`.
- [x] Add reverse `videoTasks` relation to `EditingPlan`.
- [x] Save `editingPlanId` when creating a task.
- [x] Return `editingPlanId` and `editingPlan` in `TaskDto`.

### Task 2: Expose EditingPlan API Helpers

**Files:**
- Modify: `apps/web/src/api/script.ts`

- [x] Add `listEditingPlans(scriptId)`.
- [x] Add `getLatestEditingPlan(scriptId)`.

### Task 3: Show Plan In Task Detail

**Files:**
- Modify: `apps/web/src/pages/TaskDetail.tsx`

- [x] Add a visible “智能分镜方案” card when the task has an editing plan.
- [x] Show strategy, plan id, plan creation time, trace count, and each planned shot.
- [x] Show each shot's `reason`, `sourceMaterialId`, prompt, subtitle, BGM, and duration.
- [x] Keep existing task progress, shot cards, editing modal, and trace panel behavior.

### Task 4: Update Roadmap And Verify

**Files:**
- Modify: `docs/下一步优化方向.md`

- [x] Mark this high-priority direction as in progress/partially implemented.
- [x] Run Prisma generate/db push if schema changed.
- [x] Run TypeScript typecheck and lint.
- [x] Run web production build.

### Task 5: Make Agent/RAG Visibility Obvious In The UI

**Files:**
- Modify: `apps/agent/src/agent_app/agents/editing_graph.py`
- Modify: `apps/web/src/pages/NewVideo.tsx`
- Modify: `apps/web/src/pages/TaskDetail.tsx`

- [x] Require Chinese `strategy`, `prompt`, `subtitle`, `bgm_hint`, and `reason` from the Editing Agent.
- [x] Persist `/new` page draft state in `localStorage` so switching pages does not reset the workflow.
- [x] Show historical `EditingPlan` records for the current script and allow selecting one.
- [x] Make the task detail traceability section explicitly say it is the bound `EditingPlan` used by this task.
- [x] Run agent tests, frontend/API typecheck, lint, and web build.
