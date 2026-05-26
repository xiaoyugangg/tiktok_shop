# Python Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move AI-heavy backend responsibilities from Node to Python while keeping Node as the stable web API gateway, Prisma data owner, upload/static server, and SSE progress surface.

**Architecture:** React continues to call only Node. Node keeps CRUD, Prisma, file upload, static URLs, task creation, and SSE. Python FastAPI becomes the AI workflow runtime: script generation, Seedance video calls, FFmpeg clip/stitch/postprocess, LangGraph pipeline orchestration, retry decisions, and Agent trace callbacks back into Node.

**Tech Stack:** Node.js, Express, Prisma, SQLite, TypeScript, Python 3.11, FastAPI, Pydantic, LangGraph, httpx, ffmpeg, pytest, ruff.

---

## Migration Boundary

Keep in Node:

- Frontend REST gateway: `apps/api/src/app.ts`
- Prisma schema/client and main tables: `Product`, `Material`, `Script`, `VideoTask`, `Shot`, `TaskTrace`
- Upload/static file serving: `apps/api/src/modules/material`, `apps/api/src/lib/storage.ts`
- Task creation/query/download and SSE: `apps/api/src/modules/task`
- Frontend API shape: React still calls `/api/...`

Move or add in Python:

- Script model call currently in `apps/api/src/providers/volcArk.ts`
- Video model call currently in `apps/api/src/providers/volcSeedance.ts`
- Mock clip generation and concat logic currently in `apps/api/src/lib/ffmpeg.ts`
- Generation pipeline currently in `apps/api/src/modules/creation/pipeline.ts`
- Retry/postprocess/trace orchestration currently split between Node and Python

Do not migrate in this plan:

- Prisma ownership
- user-facing CRUD routers
- material upload
- static file serving
- task SSE implementation

---

## File Structure

Create:

```text
apps/agent/src/agent_app/providers/__init__.py
apps/agent/src/agent_app/providers/ark_text.py
apps/agent/src/agent_app/providers/seedance_video.py
apps/agent/src/agent_app/media/ffmpeg_tools.py
apps/agent/src/agent_app/agents/pipeline_graph.py
apps/agent/src/agent_app/callbacks.py
apps/agent/tests/test_ark_text.py
apps/agent/tests/test_seedance_video.py
apps/agent/tests/test_ffmpeg_tools.py
apps/agent/tests/test_pipeline_graph.py
apps/api/src/modules/internal/internal.router.ts
apps/api/src/modules/creation/pythonPipeline.ts
```

Modify:

```text
apps/agent/src/agent_app/config.py
apps/agent/src/agent_app/schemas.py
apps/agent/src/agent_app/main.py
apps/agent/src/agent_app/media/postprocess.py
apps/api/src/env.ts
apps/api/src/app.ts
apps/api/src/lib/agentClient.ts
apps/api/src/modules/script/script.service.ts
apps/api/src/modules/creation/pipeline.ts
apps/api/src/modules/task/task.router.ts
apps/api/src/modules/task/task.service.ts
apps/api/src/modules/trace/trace.service.ts
.env.example
README.md
docs/项目讲解.md
```

---

## Task 1: Add Cross-Service Config and Schemas

**Files:**
- Modify: `apps/agent/src/agent_app/config.py`
- Modify: `apps/agent/src/agent_app/schemas.py`
- Modify: `apps/api/src/env.ts`
- Modify: `.env.example`
- Test: `apps/agent/tests/test_health.py`

- [x] **Step 1: Extend Python settings**

Modify `apps/agent/src/agent_app/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8790
    model_mode: str = "mock"
    storage_root: str = "../../storage"
    default_bgm_path: str | None = None

    ark_api_key: str | None = None
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_text_model: str | None = None
    ark_video_model: str | None = None
    ark_video_poll_interval_ms: int = 4000
    ark_video_poll_timeout_ms: int = 600_000

    node_base_url: str = "http://127.0.0.1:8787"
    internal_callback_token: str = "dev-callback-token"


settings = Settings()
```

- [x] **Step 2: Add Python script, clip, pipeline, and callback schemas**

Append to `apps/agent/src/agent_app/schemas.py`:

```python
class ScriptGenerateRequest(BaseModel):
    product: ProductInput
    ratio: str = "9:16"


class ScriptShotOutput(BaseModel):
    idx: int
    description: str
    camera_motion: str = ""
    subtitle: str = ""
    bgm_hint: str = ""
    duration_sec: int


class ScriptGenerateResponse(BaseModel):
    narrative: str
    visual_style: str
    ratio: str
    shots: list[ScriptShotOutput]
    constraints: list[str] = Field(default_factory=list)
    trace: list[TraceItem]


class ClipGenerateRequest(BaseModel):
    prompt: str
    ratio: str
    duration_sec: int
    image_path: str | None = None
    output_path: str


class ClipGenerateResponse(BaseModel):
    output_path: str
    trace: list[TraceItem]


class PipelineShotInput(BaseModel):
    id: str
    idx: int
    description: str
    camera_motion: str = ""
    duration_sec: float
    prompt: str | None = None
    subtitle: str | None = None
    bgm_hint: str | None = None
    source_material_id: str | None = None
    source_material_path: str | None = None
    retry_count: int = 0
    clip_path: str | None = None


class PipelineRunRequest(BaseModel):
    task_id: str
    ratio: str
    storage_root: str
    product_main_material_path: str | None = None
    shots: list[PipelineShotInput]
    enable_subtitle: bool = True
    enable_bgm: bool = False
    callback_base_url: str
    callback_token: str


class PipelineRunResponse(BaseModel):
    task_id: str
    status: str
    output_path: str | None = None
    error_message: str | None = None
    trace: list[TraceItem]


class CallbackTraceRequest(BaseModel):
    task_id: str
    shot_id: str | None = None
    stage: str
    level: str = "info"
    message: str
    payload: dict = Field(default_factory=dict)


class CallbackShotStatusRequest(BaseModel):
    shot_id: str
    status: str
    clip_path: str | None = None
    error_msg: str | None = None
    prompt: str | None = None
    duration_sec: float | None = None
    retry_count_increment: int = 0


class CallbackTaskStatusRequest(BaseModel):
    task_id: str
    status: str
    error_msg: str | None = None
    output_path: str | None = None
    stage: str | None = None
```

- [x] **Step 3: Extend Node env**

Modify `apps/api/src/env.ts`:

```ts
PYTHON_PIPELINE_ENABLED: z.coerce.boolean().default(false),
INTERNAL_CALLBACK_TOKEN: z.string().default('dev-callback-token'),
```

- [x] **Step 4: Update `.env.example`**

Add:

```env
PYTHON_PIPELINE_ENABLED=false
INTERNAL_CALLBACK_TOKEN=dev-callback-token

# Python Agent also reads these if started from repo env
NODE_BASE_URL=http://127.0.0.1:8787
```

- [x] **Step 5: Verify**

Run:

```powershell
pnpm typecheck
pnpm test:agent
```

Expected:

```text
typecheck passes
agent tests pass
```

- [x] **Step 6: Commit**

```powershell
git add .env.example apps/api/src/env.ts apps/agent/src/agent_app/config.py apps/agent/src/agent_app/schemas.py
git commit -m "feat(agent): add python migration schemas"
```

## Task 2: Move Script Generation Provider to Python

**Files:**
- Create: `apps/agent/src/agent_app/providers/__init__.py`
- Create: `apps/agent/src/agent_app/providers/ark_text.py`
- Modify: `apps/agent/src/agent_app/main.py`
- Modify: `apps/api/src/lib/agentClient.ts`
- Modify: `apps/api/src/modules/script/script.service.ts`
- Test: `apps/agent/tests/test_ark_text.py`

- [x] **Step 1: Write Python text provider test**

Create `apps/agent/tests/test_ark_text.py`:

```python
from agent_app.providers.ark_text import generate_script
from agent_app.schemas import ProductInput, ScriptGenerateRequest


def test_generate_script_mock_returns_three_shots():
    result = generate_script(
        ScriptGenerateRequest(
            product=ProductInput(
                title="无线降噪耳机",
                selling_points=["主动降噪", "续航 30 小时", "佩戴舒适"],
            ),
            ratio="9:16",
        )
    )
    assert result.ratio == "9:16"
    assert len(result.shots) == 3
    assert result.trace[0].stage == "model.script.mock"
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
cd apps\agent
conda run --no-capture-output -n tiktop_agent_p1 python -m pytest tests/test_ark_text.py -v
```

Expected:

```text
ModuleNotFoundError: No module named 'agent_app.providers'
```

- [x] **Step 3: Implement Python text provider**

Create `apps/agent/src/agent_app/providers/__init__.py` as an empty file.

Create `apps/agent/src/agent_app/providers/ark_text.py`:

```python
import json

import httpx
from pydantic import ValidationError

from agent_app.config import settings
from agent_app.schemas import (
    ScriptGenerateRequest,
    ScriptGenerateResponse,
    ScriptShotOutput,
    TraceItem,
)


def _mock_script(req: ScriptGenerateRequest) -> ScriptGenerateResponse:
    points = req.product.selling_points[:3] or [req.product.title]
    shots = [
        ScriptShotOutput(
            idx=0,
            description=f"商品特写展示「{req.product.title}」外观与质感，开场快速吸引注意。",
            camera_motion="推近 + 轻微环绕",
            subtitle=req.product.title,
            bgm_hint="轻快流行",
            duration_sec=4,
        ),
        ScriptShotOutput(
            idx=1,
            description=f"在真实使用场景中展示「{req.product.title}」，突出 {points[0]}。",
            camera_motion="中景跟随",
            subtitle=points[0],
            bgm_hint="节奏渐强",
            duration_sec=5,
        ),
        ScriptShotOutput(
            idx=2,
            description=f"多角度产品镜头叠加卖点字幕，强化 {' / '.join(points[1:]) or points[0]}。",
            camera_motion="快速切换 + 旋转",
            subtitle="立即下单",
            bgm_hint="高潮收尾",
            duration_sec=4,
        ),
    ]
    return ScriptGenerateResponse(
        narrative=f"围绕「{req.product.title}」展开三段式带货叙事：吸引注意 -> 场景共鸣 -> 行动召唤。",
        visual_style="明亮通透、产品居中、字幕清晰、节奏紧凑",
        ratio=req.ratio,
        shots=shots,
        constraints=["总时长不超过 15 秒", "避免真实人脸", "字幕简短有力", f"画幅:{req.ratio}"],
        trace=[TraceItem(stage="model.script.mock", message="Generated mock script in Python provider")],
    )


def generate_script(req: ScriptGenerateRequest) -> ScriptGenerateResponse:
    if settings.model_mode == "mock" or not settings.ark_api_key or not settings.ark_text_model:
        return _mock_script(req)

    system_prompt = (
        "你是电商短视频编导。请严格输出 JSON，字段包括 narrative, visual_style, ratio, "
        "shots, constraints。shots 每项包含 idx, description, camera_motion, subtitle, "
        "bgm_hint, duration_sec。总时长不超过 15 秒。"
    )
    user_prompt = json.dumps(
        {
            "title": req.product.title,
            "selling_points": req.product.selling_points,
            "target_audience": req.product.target_audience,
            "scene": req.product.scene,
            "ratio": req.ratio,
        },
        ensure_ascii=False,
    )
    headers = {"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.ark_text_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.7,
    }
    last_error: Exception | None = None
    for _ in range(2):
        try:
            resp = httpx.post(
                f"{settings.ark_base_url}/chat/completions",
                headers=headers,
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            data = json.loads(raw)
            data["trace"] = [
                TraceItem(stage="model.script.live", message="Generated script with Ark text model").model_dump()
            ]
            return ScriptGenerateResponse.model_validate(data)
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValidationError) as err:
            last_error = err
    raise RuntimeError(f"script generation failed: {last_error}")
```

- [x] **Step 4: Expose Python script endpoint**

Modify `apps/agent/src/agent_app/main.py` imports:

```python
from agent_app.providers.ark_text import generate_script
from agent_app.schemas import ScriptGenerateRequest, ScriptGenerateResponse
```

Add endpoint:

```python
@app.post("/scripts/generate", response_model=ScriptGenerateResponse)
def script_generate(req: ScriptGenerateRequest) -> ScriptGenerateResponse:
    return generate_script(req)
```

- [x] **Step 5: Add Node response type**

Modify `apps/api/src/lib/agentClient.ts`:

```ts
export interface ScriptGenerateResponse {
  narrative: string;
  visual_style: string;
  ratio: '9:16' | '16:9';
  shots: Array<{
    idx: number;
    description: string;
    camera_motion: string;
    subtitle: string;
    bgm_hint: string;
    duration_sec: number;
  }>;
  constraints: string[];
  trace: AgentTraceItem[];
}
```

- [x] **Step 6: Route script service through Python with fallback**

Modify `apps/api/src/modules/script/script.service.ts`:

```ts
import { callAgent, type ScriptGenerateResponse } from '../../lib/agentClient';
```

Inside `createScriptForProduct`, replace direct `generateScript(...)` call with:

```ts
let script: Script;
try {
  const result = await callAgent<ScriptGenerateResponse>('/scripts/generate', {
    product: {
      id: product.id,
      title: product.title,
      selling_points: sellingPoints.length ? sellingPoints : [product.title],
      target_audience: product.targetAudience,
      scene: product.scene,
    },
    ratio,
  });
  script = ScriptSchema.parse({
    narrative: result.narrative,
    visualStyle: result.visual_style,
    ratio: result.ratio,
    shots: result.shots.map((shot) => ({
      idx: shot.idx,
      description: shot.description,
      cameraMotion: shot.camera_motion,
      subtitle: shot.subtitle,
      bgmHint: shot.bgm_hint,
      durationSec: shot.duration_sec,
    })),
    constraints: result.constraints,
  });
} catch {
  script = await generateScript({
    product: {
      title: product.title,
      sellingPoints: sellingPoints.length ? sellingPoints : [product.title],
      targetAudience: product.targetAudience ?? undefined,
      scene: product.scene ?? undefined,
      mainMaterialId: product.mainMaterialId ?? undefined,
      ratio,
    },
  });
}
```

Keep the Node provider import as fallback for this task.

- [x] **Step 7: Verify**

Run:

```powershell
pnpm test:agent
pnpm typecheck
pnpm lint
```

Expected:

```text
agent tests pass
typecheck passes
lint passes
```

- [x] **Step 8: Commit**

```powershell
git add apps/agent/src/agent_app/providers apps/agent/src/agent_app/main.py apps/agent/tests/test_ark_text.py apps/api/src/lib/agentClient.ts apps/api/src/modules/script/script.service.ts
git commit -m "feat(agent): move script generation to python"
```

## Task 3: Move Video Provider and FFmpeg Tools to Python

**Files:**
- Create: `apps/agent/src/agent_app/providers/seedance_video.py`
- Create: `apps/agent/src/agent_app/media/ffmpeg_tools.py`
- Modify: `apps/agent/src/agent_app/main.py`
- Test: `apps/agent/tests/test_seedance_video.py`
- Test: `apps/agent/tests/test_ffmpeg_tools.py`

- [x] **Step 1: Write video provider tests**

Create `apps/agent/tests/test_seedance_video.py`:

```python
from pathlib import Path

from agent_app.providers.seedance_video import clamp_duration, generate_clip
from agent_app.schemas import ClipGenerateRequest


def test_clamp_duration():
    assert clamp_duration(1) == 2
    assert clamp_duration(20) == 12
    assert clamp_duration(5) == 5


def test_generate_clip_mock_creates_file(tmp_path: Path):
    output = tmp_path / "clip.mp4"
    result = generate_clip(
        ClipGenerateRequest(
            prompt="商品特写",
            ratio="9:16",
            duration_sec=2,
            output_path=str(output),
        )
    )
    assert output.exists()
    assert result.output_path == str(output)
```

Create `apps/agent/tests/test_ffmpeg_tools.py`:

```python
from pathlib import Path

from agent_app.media.ffmpeg_tools import concat_clips, generate_mock_clip


def test_concat_clips_creates_output(tmp_path: Path):
    c1 = tmp_path / "c1.mp4"
    c2 = tmp_path / "c2.mp4"
    out = tmp_path / "out.mp4"
    generate_mock_clip(str(c1), "9:16", 1, "片段1")
    generate_mock_clip(str(c2), "9:16", 1, "片段2")
    concat_clips([str(c1), str(c2)], str(out), "9:16")
    assert out.exists()
```

- [x] **Step 2: Run tests to verify failure**

Run:

```powershell
cd apps\agent
conda run --no-capture-output -n tiktop_agent_p1 python -m pytest tests/test_seedance_video.py tests/test_ffmpeg_tools.py -v
```

Expected:

```text
ModuleNotFoundError for seedance_video and ffmpeg_tools
```

- [x] **Step 3: Implement FFmpeg tools**

Create `apps/agent/src/agent_app/media/ffmpeg_tools.py`:

```python
import random
import subprocess
from pathlib import Path


RATIO_RESOLUTION = {
    "9:16": (720, 1280),
    "16:9": (1280, 720),
}


def _run_ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


def _drawtext_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace(",", "\\,")
        .replace("%", "\\%")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("\n", " ")
    )


def generate_mock_clip(out_path: str, ratio: str, duration_sec: float, label: str) -> None:
    width, height = RATIO_RESOLUTION.get(ratio, RATIO_RESOLUTION["9:16"])
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    color = random.choice(["0x2e6df5", "0xff2c55", "0xff7a45", "0x52c41a", "0x722ed1", "0x13c2c2"])
    safe_label = _drawtext_escape(label[:36])
    font_size = round(min(width, height) / 18)
    filter_text = (
        f"drawtext=text='{safe_label}':fontcolor=white:fontsize={font_size}:"
        "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10"
    )
    _run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-t",
            f"{duration_sec:.2f}",
            "-i",
            f"color=c={color}:s={width}x{height}:r=24",
            "-vf",
            filter_text,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )


def concat_clips(clip_paths: list[str], out_path: str, ratio: str) -> None:
    if not clip_paths:
        raise ValueError("clip_paths cannot be empty")
    width, height = RATIO_RESOLUTION.get(ratio, RATIO_RESOLUTION["9:16"])
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    inputs: list[str] = []
    for clip in clip_paths:
        inputs.extend(["-i", clip])
    filter_inputs = ";".join(
        f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
        f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24[v{i}]"
        for i, _ in enumerate(clip_paths)
    )
    concat_inputs = "".join(f"[v{i}]" for i, _ in enumerate(clip_paths))
    filter_graph = f"{filter_inputs};{concat_inputs}concat=n={len(clip_paths)}:v=1:a=0[outv]"
    _run_ffmpeg(
        [
            *inputs,
            "-filter_complex",
            filter_graph,
            "-map",
            "[outv]",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )
```

- [x] **Step 4: Implement Seedance provider**

Create `apps/agent/src/agent_app/providers/seedance_video.py`:

```python
import base64
import time
from pathlib import Path

import httpx

from agent_app.config import settings
from agent_app.media.ffmpeg_tools import generate_mock_clip
from agent_app.schemas import ClipGenerateRequest, ClipGenerateResponse, TraceItem


def clamp_duration(requested: int | float) -> int:
    try:
        value = round(float(requested))
    except (TypeError, ValueError):
        value = 5
    return max(2, min(12, value))


def _image_data_url(path: str) -> str:
    p = Path(path)
    suffix = p.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/webp" if suffix == ".webp" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode('ascii')}"


def generate_clip(req: ClipGenerateRequest) -> ClipGenerateResponse:
    if settings.model_mode == "mock" or not settings.ark_api_key or not settings.ark_video_model:
        generate_mock_clip(req.output_path, req.ratio, clamp_duration(req.duration_sec), req.prompt)
        return ClipGenerateResponse(
            output_path=req.output_path,
            trace=[TraceItem(stage="model.video.mock", message="Generated mock clip in Python")],
        )

    headers = {"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json"}
    content: list[dict] = [{"type": "text", "text": req.prompt}]
    if req.image_path:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": _image_data_url(req.image_path)},
                "role": "first_frame",
            }
        )
    create_payload = {
        "model": settings.ark_video_model,
        "content": content,
        "ratio": req.ratio,
        "duration": clamp_duration(req.duration_sec),
        "resolution": "720p",
    }
    with httpx.Client(timeout=60) as client:
        create = client.post(f"{settings.ark_base_url}/contents/generations/tasks", headers=headers, json=create_payload)
        create.raise_for_status()
        task_id = create.json().get("id")
        if not task_id:
            raise RuntimeError("seedance create task missing id")
        started = time.time()
        last_status = ""
        video_url = None
        while (time.time() - started) * 1000 < settings.ark_video_poll_timeout_ms:
            time.sleep(settings.ark_video_poll_interval_ms / 1000)
            poll = client.get(f"{settings.ark_base_url}/contents/generations/tasks/{task_id}", headers=headers)
            if poll.status_code >= 400:
                continue
            payload = poll.json()
            last_status = payload.get("status", "")
            if last_status == "succeeded":
                video_url = payload.get("content", {}).get("video_url")
                break
            if last_status in {"failed", "cancelled"}:
                raise RuntimeError(f"seedance task {task_id} {last_status}: {payload.get('error', {})}")
        if not video_url:
            raise RuntimeError(f"seedance task {task_id} timed out; last status={last_status}")
        video = client.get(video_url)
        video.raise_for_status()
        Path(req.output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(req.output_path).write_bytes(video.content)
    return ClipGenerateResponse(
        output_path=req.output_path,
        trace=[TraceItem(stage="model.video.live", message="Generated Seedance clip", payload={"task_id": task_id})],
    )
```

- [x] **Step 5: Expose clip endpoint**

Modify `apps/agent/src/agent_app/main.py`:

```python
from agent_app.providers.seedance_video import generate_clip
from agent_app.schemas import ClipGenerateRequest, ClipGenerateResponse


@app.post("/video/clip", response_model=ClipGenerateResponse)
def video_clip(req: ClipGenerateRequest) -> ClipGenerateResponse:
    return generate_clip(req)
```

- [x] **Step 6: Verify**

Run:

```powershell
pnpm test:agent
pnpm lint:agent
```

Expected:

```text
all tests pass
All checks passed!
```

- [x] **Step 7: Commit**

```powershell
git add apps/agent/src/agent_app/providers/seedance_video.py apps/agent/src/agent_app/media/ffmpeg_tools.py apps/agent/src/agent_app/main.py apps/agent/tests/test_seedance_video.py apps/agent/tests/test_ffmpeg_tools.py
git commit -m "feat(agent): move video provider and ffmpeg tools to python"
```

## Task 4: Add Node Internal Callback API for Python Pipeline

**Files:**
- Create: `apps/api/src/modules/internal/internal.router.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/modules/task/task.service.ts`
- Modify: `apps/api/src/modules/trace/trace.service.ts`

- [ ] **Step 1: Add task service helpers for callback updates**

Add to `apps/api/src/modules/task/task.service.ts`:

```ts
export async function updateShotFromPipeline(args: {
  shotId: string;
  status: ShotStatus;
  clipPath?: string | null;
  errorMsg?: string | null;
  prompt?: string | null;
  durationSec?: number | null;
  retryCountIncrement?: number;
}): Promise<void> {
  await prisma.shot.update({
    where: { id: args.shotId },
    data: {
      status: args.status,
      clipPath: args.clipPath ?? undefined,
      errorMsg: args.errorMsg ?? undefined,
      prompt: args.prompt ?? undefined,
      durationSec: args.durationSec ?? undefined,
      retryCount: args.retryCountIncrement ? { increment: args.retryCountIncrement } : undefined,
    },
  });
}
```

- [ ] **Step 2: Create internal router**

Create `apps/api/src/modules/internal/internal.router.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';

import { env } from '../../env';
import { addTrace } from '../trace/trace.service';
import { setTaskStatus, updateShotFromPipeline } from '../task/task.service';

export const internalRouter: Router = Router();

function assertInternalToken(req: { header(name: string): string | undefined }) {
  const token = req.header('x-internal-token');
  if (token !== env.INTERNAL_CALLBACK_TOKEN) {
    const err = new Error('invalid internal callback token');
    Object.assign(err, { statusCode: 401 });
    throw err;
  }
}

const TraceReqSchema = z.object({
  task_id: z.string(),
  shot_id: z.string().nullable().optional(),
  stage: z.string(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
  message: z.string(),
  payload: z.record(z.unknown()).optional(),
});

internalRouter.post('/trace', async (req, res, next) => {
  try {
    assertInternalToken(req);
    const body = TraceReqSchema.parse(req.body);
    await addTrace({
      taskId: body.task_id,
      shotId: body.shot_id ?? undefined,
      stage: body.stage,
      level: body.level,
      message: body.message,
      payload: body.payload,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const ShotStatusReqSchema = z.object({
  shot_id: z.string(),
  status: z.enum(['pending', 'img_ok', 'video_ok', 'failed']),
  clip_path: z.string().nullable().optional(),
  error_msg: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  duration_sec: z.number().nullable().optional(),
  retry_count_increment: z.number().int().nonnegative().default(0),
});

internalRouter.post('/shots/status', async (req, res, next) => {
  try {
    assertInternalToken(req);
    const body = ShotStatusReqSchema.parse(req.body);
    await updateShotFromPipeline({
      shotId: body.shot_id,
      status: body.status,
      clipPath: body.clip_path,
      errorMsg: body.error_msg,
      prompt: body.prompt,
      durationSec: body.duration_sec,
      retryCountIncrement: body.retry_count_increment,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const TaskStatusReqSchema = z.object({
  task_id: z.string(),
  status: z.enum(['queued', 'script_generating', 'script_ready', 'shots_running', 'stitching', 'succeeded', 'failed']),
  error_msg: z.string().nullable().optional(),
  output_path: z.string().nullable().optional(),
  stage: z.string().nullable().optional(),
});

internalRouter.post('/tasks/status', async (req, res, next) => {
  try {
    assertInternalToken(req);
    const body = TaskStatusReqSchema.parse(req.body);
    await setTaskStatus({
      taskId: body.task_id,
      status: body.status,
      errorMsg: body.error_msg ?? undefined,
      outputPath: body.output_path ?? undefined,
      stage: body.stage ?? undefined,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Mount internal router**

Modify `apps/api/src/app.ts`:

```ts
import { internalRouter } from './modules/internal/internal.router';

app.use('/api/internal', internalRouter);
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm typecheck
pnpm lint
```

Expected:

```text
typecheck passes
lint passes
```

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/modules/internal apps/api/src/app.ts apps/api/src/modules/task/task.service.ts
git commit -m "feat(api): add internal callbacks for python pipeline"
```

## Task 5: Build Python Callback Client

**Files:**
- Create: `apps/agent/src/agent_app/callbacks.py`
- Test: `apps/agent/tests/test_pipeline_graph.py`

- [ ] **Step 1: Write callback client unit test with monkeypatch**

Create `apps/agent/tests/test_pipeline_graph.py`:

```python
from agent_app.callbacks import CallbackClient


def test_callback_client_posts_trace(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

    def fake_post(url, headers, json, timeout):
        calls.append((url, headers, json, timeout))
        return FakeResponse()

    monkeypatch.setattr("httpx.post", fake_post)
    client = CallbackClient(base_url="http://node.local", token="token-1")
    client.trace(task_id="t1", stage="stage.one", message="hello")

    assert calls[0][0] == "http://node.local/api/internal/trace"
    assert calls[0][1]["x-internal-token"] == "token-1"
    assert calls[0][2]["task_id"] == "t1"
```

- [ ] **Step 2: Implement callback client**

Create `apps/agent/src/agent_app/callbacks.py`:

```python
import httpx


class CallbackClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url.rstrip("/")
        self.token = token

    def _post(self, path: str, body: dict) -> None:
        resp = httpx.post(
            f"{self.base_url}{path}",
            headers={"x-internal-token": self.token},
            json=body,
            timeout=10,
        )
        resp.raise_for_status()

    def trace(
        self,
        task_id: str,
        stage: str,
        message: str,
        *,
        shot_id: str | None = None,
        level: str = "info",
        payload: dict | None = None,
    ) -> None:
        self._post(
            "/api/internal/trace",
            {
                "task_id": task_id,
                "shot_id": shot_id,
                "stage": stage,
                "level": level,
                "message": message,
                "payload": payload or {},
            },
        )

    def shot_status(
        self,
        *,
        shot_id: str,
        status: str,
        clip_path: str | None = None,
        error_msg: str | None = None,
        prompt: str | None = None,
        duration_sec: float | None = None,
        retry_count_increment: int = 0,
    ) -> None:
        self._post(
            "/api/internal/shots/status",
            {
                "shot_id": shot_id,
                "status": status,
                "clip_path": clip_path,
                "error_msg": error_msg,
                "prompt": prompt,
                "duration_sec": duration_sec,
                "retry_count_increment": retry_count_increment,
            },
        )

    def task_status(
        self,
        *,
        task_id: str,
        status: str,
        error_msg: str | None = None,
        output_path: str | None = None,
        stage: str | None = None,
    ) -> None:
        self._post(
            "/api/internal/tasks/status",
            {
                "task_id": task_id,
                "status": status,
                "error_msg": error_msg,
                "output_path": output_path,
                "stage": stage,
            },
        )
```

- [ ] **Step 3: Verify**

Run:

```powershell
pnpm test:agent
pnpm lint:agent
```

Expected:

```text
all tests pass
All checks passed!
```

- [ ] **Step 4: Commit**

```powershell
git add apps/agent/src/agent_app/callbacks.py apps/agent/tests/test_pipeline_graph.py
git commit -m "feat(agent): add node callback client"
```

## Task 6: Move Full Video Pipeline to Python LangGraph

**Files:**
- Create: `apps/agent/src/agent_app/agents/pipeline_graph.py`
- Modify: `apps/agent/src/agent_app/main.py`
- Test: `apps/agent/tests/test_pipeline_graph.py`

- [ ] **Step 1: Add pipeline graph tests**

Append to `apps/agent/tests/test_pipeline_graph.py`:

```python
from pathlib import Path

from agent_app.agents.pipeline_graph import run_pipeline_graph
from agent_app.schemas import PipelineRunRequest, PipelineShotInput


def test_pipeline_graph_mock_generates_output(tmp_path: Path):
    callback_calls = []

    class FakeCallback:
        def trace(self, **kwargs):
            callback_calls.append(("trace", kwargs))

        def shot_status(self, **kwargs):
            callback_calls.append(("shot", kwargs))

        def task_status(self, **kwargs):
            callback_calls.append(("task", kwargs))

    req = PipelineRunRequest(
        task_id="t1",
        ratio="9:16",
        storage_root=str(tmp_path),
        shots=[
            PipelineShotInput(id="s1", idx=0, description="商品特写", duration_sec=2),
            PipelineShotInput(id="s2", idx=1, description="场景演示", duration_sec=2),
        ],
        enable_subtitle=False,
        enable_bgm=False,
        callback_base_url="http://node.local",
        callback_token="token",
    )
    result = run_pipeline_graph(req, callback=FakeCallback())
    assert result.status == "succeeded"
    assert result.output_path
    assert (tmp_path / result.output_path).exists()
    assert any(call[0] == "shot" and call[1]["status"] == "video_ok" for call in callback_calls)
```

- [ ] **Step 2: Implement Python LangGraph pipeline**

Create `apps/agent/src/agent_app/agents/pipeline_graph.py`:

```python
from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from agent_app.agents.retry_agent import decide_retry
from agent_app.callbacks import CallbackClient
from agent_app.media.ffmpeg_tools import concat_clips
from agent_app.media.postprocess import run_postprocess
from agent_app.providers.seedance_video import generate_clip
from agent_app.schemas import (
    ClipGenerateRequest,
    PipelineRunRequest,
    PipelineRunResponse,
    PipelineShotInput,
    PostprocessRequest,
    RetryDecisionRequest,
    SubtitleCue,
    TraceItem,
)


class PipelineState(TypedDict):
    req: PipelineRunRequest
    callback: object
    clips: list[str]
    output_rel: str | None
    error: str | None
    trace: list[TraceItem]


def _rel(storage_root: str, abs_path: str) -> str:
    return str(Path(abs_path).resolve().relative_to(Path(storage_root).resolve())).replace("\\", "/")


def _shot_image_path(req: PipelineRunRequest, shot: PipelineShotInput) -> str | None:
    return shot.source_material_path or (req.product_main_material_path if shot.idx == 0 else None)


def start_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    cb = state["callback"]
    cb.task_status(task_id=req.task_id, status="shots_running", stage="Python pipeline generating shots")
    cb.trace(task_id=req.task_id, stage="pipeline.start", message="Python LangGraph pipeline started")
    state["trace"].append(TraceItem(stage="pipeline.start", message="Started Python pipeline"))
    return state


def generate_shots_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    cb = state["callback"]
    clips: list[str] = []
    shots_dir = Path(req.storage_root) / "tasks" / req.task_id / "shots"
    shots_dir.mkdir(parents=True, exist_ok=True)

    for shot in req.shots:
        clip_abs = shots_dir / f"shot_{shot.idx}.mp4"
        prompt = shot.prompt or shot.description
        cb.trace(
            task_id=req.task_id,
            shot_id=shot.id,
            stage="shot.generate.start",
            message=f"Generating shot {shot.idx + 1} in Python pipeline",
            payload={"prompt": prompt},
        )
        try:
            generate_clip(
                ClipGenerateRequest(
                    prompt=prompt,
                    ratio=req.ratio,
                    duration_sec=int(shot.duration_sec),
                    image_path=_shot_image_path(req, shot),
                    output_path=str(clip_abs),
                )
            )
            clip_rel = _rel(req.storage_root, str(clip_abs))
            cb.shot_status(shot_id=shot.id, status="video_ok", clip_path=clip_rel)
            cb.trace(
                task_id=req.task_id,
                shot_id=shot.id,
                stage="shot.generate.success",
                message=f"Shot {shot.idx + 1} generated",
                payload={"clip_path": clip_rel},
            )
            clips.append(str(clip_abs))
        except Exception as err:
            msg = str(err)
            cb.trace(task_id=req.task_id, shot_id=shot.id, stage="shot.generate.failed", level="error", message=msg)
            decision = decide_retry(
                RetryDecisionRequest(
                    task_id=req.task_id,
                    shot_id=shot.id,
                    shot_idx=shot.idx,
                    error_message=msg,
                    retry_count=shot.retry_count,
                    prompt=prompt,
                    duration_sec=int(shot.duration_sec),
                )
            )
            cb.trace(
                task_id=req.task_id,
                shot_id=shot.id,
                stage="agent.retry.decision",
                message=decision.reason,
                payload=decision.model_dump(),
            )
            if not decision.should_retry:
                cb.shot_status(shot_id=shot.id, status="failed", error_msg=msg)
                raise
            patched_prompt = decision.patch.prompt or prompt
            patched_duration = decision.patch.duration_sec or shot.duration_sec
            generate_clip(
                ClipGenerateRequest(
                    prompt=patched_prompt,
                    ratio=req.ratio,
                    duration_sec=int(patched_duration),
                    image_path=_shot_image_path(req, shot),
                    output_path=str(clip_abs),
                )
            )
            clip_rel = _rel(req.storage_root, str(clip_abs))
            cb.shot_status(
                shot_id=shot.id,
                status="video_ok",
                clip_path=clip_rel,
                prompt=patched_prompt,
                duration_sec=patched_duration,
                retry_count_increment=1,
            )
            clips.append(str(clip_abs))

    state["clips"] = clips
    return state


def stitch_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    cb = state["callback"]
    cb.task_status(task_id=req.task_id, status="stitching", stage="Python pipeline stitching video")
    out_abs = Path(req.storage_root) / "tasks" / req.task_id / "output.mp4"
    concat_clips(state["clips"], str(out_abs), req.ratio)
    state["output_rel"] = _rel(req.storage_root, str(out_abs))
    cb.trace(task_id=req.task_id, stage="pipeline.stitch.done", message="Stitched clips in Python")
    return state


def postprocess_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    if not req.enable_subtitle and not req.enable_bgm:
        return state
    out_abs = Path(req.storage_root) / "tasks" / req.task_id / "output.mp4"
    post_abs = Path(req.storage_root) / "tasks" / req.task_id / "output_p1.mp4"
    cursor = 0.0
    cues: list[SubtitleCue] = []
    for shot in req.shots:
        start = cursor
        cursor += float(shot.duration_sec)
        cues.append(SubtitleCue(start_sec=start, end_sec=cursor, text=shot.subtitle or shot.description[:24]))
    run_postprocess(
        PostprocessRequest(
            input_path=str(out_abs),
            output_path=str(post_abs),
            ratio=req.ratio,
            subtitles=cues,
            enable_subtitle=req.enable_subtitle,
            enable_bgm=req.enable_bgm,
        )
    )
    state["output_rel"] = _rel(req.storage_root, str(post_abs))
    state["callback"].trace(task_id=req.task_id, stage="media.postprocess.done", message="Python postprocess complete")
    return state


def finish_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    state["callback"].task_status(
        task_id=req.task_id,
        status="succeeded",
        output_path=state["output_rel"],
        stage="Completed",
    )
    state["trace"].append(TraceItem(stage="pipeline.done", message="Python pipeline completed"))
    return state


def build_pipeline_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("start", start_node)
    graph.add_node("generate_shots", generate_shots_node)
    graph.add_node("stitch", stitch_node)
    graph.add_node("postprocess", postprocess_node)
    graph.add_node("finish", finish_node)
    graph.set_entry_point("start")
    graph.add_edge("start", "generate_shots")
    graph.add_edge("generate_shots", "stitch")
    graph.add_edge("stitch", "postprocess")
    graph.add_edge("postprocess", "finish")
    graph.add_edge("finish", END)
    return graph.compile()


def run_pipeline_graph(req: PipelineRunRequest, callback: object | None = None) -> PipelineRunResponse:
    cb = callback or CallbackClient(req.callback_base_url, req.callback_token)
    try:
        final = build_pipeline_graph().invoke(
            {"req": req, "callback": cb, "clips": [], "output_rel": None, "error": None, "trace": []}
        )
        return PipelineRunResponse(
            task_id=req.task_id,
            status="succeeded",
            output_path=final["output_rel"],
            trace=final["trace"],
        )
    except Exception as err:
        msg = str(err)
        cb.task_status(task_id=req.task_id, status="failed", error_msg=msg, stage="Failed")
        cb.trace(task_id=req.task_id, stage="pipeline.failed", level="error", message=msg)
        return PipelineRunResponse(task_id=req.task_id, status="failed", error_message=msg, trace=[])
```

- [ ] **Step 3: Expose Python pipeline endpoint**

Modify `apps/agent/src/agent_app/main.py`:

```python
from agent_app.agents.pipeline_graph import run_pipeline_graph
from agent_app.schemas import PipelineRunRequest, PipelineRunResponse


@app.post("/pipeline/run", response_model=PipelineRunResponse)
def pipeline_run(req: PipelineRunRequest) -> PipelineRunResponse:
    return run_pipeline_graph(req)
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:agent
pnpm lint:agent
```

Expected:

```text
pipeline graph test passes
all agent tests pass
All checks passed!
```

- [ ] **Step 5: Commit**

```powershell
git add apps/agent/src/agent_app/agents/pipeline_graph.py apps/agent/src/agent_app/main.py apps/agent/tests/test_pipeline_graph.py
git commit -m "feat(agent): add python langgraph video pipeline"
```

## Task 7: Let Node Delegate Task Execution to Python Pipeline

**Files:**
- Create: `apps/api/src/modules/creation/pythonPipeline.ts`
- Modify: `apps/api/src/modules/creation/pipeline.ts`
- Modify: `apps/api/src/modules/task/task.router.ts`
- Modify: `apps/api/src/lib/agentClient.ts`

- [ ] **Step 1: Add Node Python pipeline response type**

Modify `apps/api/src/lib/agentClient.ts`:

```ts
export interface PipelineRunResponse {
  task_id: string;
  status: 'succeeded' | 'failed';
  output_path?: string | null;
  error_message?: string | null;
  trace: AgentTraceItem[];
}
```

- [ ] **Step 2: Create Python pipeline adapter**

Create `apps/api/src/modules/creation/pythonPipeline.ts`:

```ts
import path from 'node:path';

import { env } from '../../env';
import { callAgent, type PipelineRunResponse } from '../../lib/agentClient';
import { prisma } from '../../lib/prisma';
import { STORAGE_ROOT } from '../../lib/storage';

import type { Ratio } from '@tiktop/shared';

export async function runPythonPipeline(args: { taskId: string; ratio: Ratio }): Promise<void> {
  const task = await prisma.videoTask.findUnique({
    where: { id: args.taskId },
    include: {
      product: true,
      shots: { orderBy: { idx: 'asc' } },
    },
  });
  if (!task) throw new Error(`task ${args.taskId} not found`);

  const mainMaterial = task.product.mainMaterialId
    ? await prisma.material.findUnique({ where: { id: task.product.mainMaterialId } })
    : null;
  const sourceMaterialIds = task.shots
    .map((shot) => shot.sourceMaterialId)
    .filter((id): id is string => !!id);
  const sourceMaterials = sourceMaterialIds.length
    ? await prisma.material.findMany({ where: { id: { in: sourceMaterialIds } } })
    : [];
  const materialPath = new Map(sourceMaterials.map((m) => [m.id, path.join(STORAGE_ROOT, m.path)]));

  const response = await callAgent<PipelineRunResponse>('/pipeline/run', {
    task_id: task.id,
    ratio: args.ratio,
    storage_root: STORAGE_ROOT,
    product_main_material_path:
      mainMaterial?.kind === 'image' ? path.join(STORAGE_ROOT, mainMaterial.path) : null,
    shots: task.shots.map((shot) => ({
      id: shot.id,
      idx: shot.idx,
      description: shot.description,
      camera_motion: shot.cameraMotion,
      duration_sec: shot.durationSec,
      prompt: shot.prompt,
      subtitle: shot.subtitle,
      bgm_hint: shot.bgmHint,
      source_material_id: shot.sourceMaterialId,
      source_material_path: shot.sourceMaterialId ? materialPath.get(shot.sourceMaterialId) ?? null : null,
      retry_count: shot.retryCount,
      clip_path: shot.clipPath,
    })),
    enable_subtitle: env.P1_ENABLE_SUBTITLE,
    enable_bgm: env.P1_ENABLE_BGM,
    callback_base_url: env.PUBLIC_BASE_URL,
    callback_token: env.INTERNAL_CALLBACK_TOKEN,
  });

  if (response.status === 'failed') {
    throw new Error(response.error_message ?? 'python pipeline failed');
  }
}
```

- [ ] **Step 3: Switch task router to Python pipeline behind feature flag**

Modify `apps/api/src/modules/task/task.router.ts` imports:

```ts
import { runPythonPipeline } from '../creation/pythonPipeline';
```

Inside the `setImmediate` block for creating a task, replace:

```ts
await runPipeline({ taskId, script, ratio: parsed.data.ratio });
```

With:

```ts
if (env.PYTHON_PIPELINE_ENABLED) {
  await runPythonPipeline({ taskId, ratio: parsed.data.ratio });
} else {
  await runPipeline({ taskId, script, ratio: parsed.data.ratio });
}
```

Add `env` import:

```ts
import { env } from '../../env';
```

- [ ] **Step 4: Keep Node pipeline as fallback**

Do not delete `apps/api/src/modules/creation/pipeline.ts`. It remains the fallback when:

```env
PYTHON_PIPELINE_ENABLED=false
```

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm typecheck
pnpm lint
pnpm test:agent
```

Expected:

```text
all pass
```

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/lib/agentClient.ts apps/api/src/modules/creation/pythonPipeline.ts apps/api/src/modules/task/task.router.ts
git commit -m "feat(api): delegate video pipeline to python"
```

## Task 8: Strengthen Agent Workflow and Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/项目讲解.md`
- Modify: `docs/superpowers/plans/2026-05-22-p1-python-agent.md`

- [ ] **Step 1: Update README architecture**

Add:

```markdown
### Python Pipeline Mode

Set:

```env
PYTHON_PIPELINE_ENABLED=true
MODEL_MODE=live
```

Then start:

```powershell
pnpm dev:agent
pnpm dev:api
pnpm dev:web
```

In this mode Node keeps the frontend API, Prisma database, upload/static files, task creation, and SSE progress. Python owns the AI workflow: script generation, LangGraph video pipeline, Seedance video calls, retry decisions, FFmpeg stitching, subtitle postprocess, and Agent traces via internal callbacks.
```

- [ ] **Step 2: Update project explanation**

Add to `docs/项目讲解.md`:

```markdown
## P1/P2 Python 后端迁移说明

当前系统采用 Node 网关 + Python AI 服务的组合。迁移后不是让前端同时调用两个后端，而是保持：

```text
React -> Node API -> Python Agent/Pipeline
```

Node 继续负责 Prisma 数据库、素材上传、静态资源、任务查询、SSE。Python 负责模型调用、LangGraph 工作流、分镜生成、失败重试、拼接后处理和 Agent trace 回写。
```

- [ ] **Step 3: Mark migration plan relationship in old P1 plan**

Append to `docs/superpowers/plans/2026-05-22-p1-python-agent.md`:

```markdown
## Follow-up Migration Plan

The Python backend migration is tracked separately in:

`docs/superpowers/plans/2026-05-26-python-backend-migration.md`

That plan moves AI-heavy runtime work from Node to Python while keeping Node as the stable API gateway and Prisma owner.
```

- [ ] **Step 4: Final verification**

Run:

```powershell
pnpm typecheck
pnpm lint
pnpm test:agent
pnpm --filter @tiktop/web build
```

Expected:

```text
all checks pass
web build succeeds, allowing the existing ECharts chunk-size warning
```

- [ ] **Step 5: Commit**

```powershell
git add README.md docs/项目讲解.md docs/superpowers/plans/2026-05-22-p1-python-agent.md docs/superpowers/plans/2026-05-26-python-backend-migration.md
git commit -m "docs: describe python backend migration"
```

---

## Self-Review

Spec coverage:

- Move model calls to Python: Tasks 2 and 3.
- Move video pipeline to Python: Tasks 6 and 7.
- Move FFmpeg orchestration to Python: Task 3 and Task 6.
- Enhance LangGraph: Task 6 builds a full pipeline graph.
- Preserve Node as stable gateway: Tasks 4 and 7 keep Node as callback/data/SSE owner.
- Avoid frontend/backend split: Task 7 keeps React calling Node only.
- Keep fallback safety: Task 7 leaves existing Node pipeline behind `PYTHON_PIPELINE_ENABLED=false`.

Known intentional non-migrations:

- Prisma and main database tables stay in Node.
- Material upload/static URLs stay in Node.
- SSE stays in Node.
- Basic CRUD stays in Node.

Execution order matters:

1. Add schemas/config first.
2. Move isolated providers next.
3. Add Node callback surface before Python pipeline.
4. Add Python pipeline before switching Node to call it.
5. Keep feature flag off until full verification passes.
