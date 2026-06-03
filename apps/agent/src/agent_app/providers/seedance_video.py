import base64
import json
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
    return max(4, min(12, value))


def _image_data_url(path: str) -> str:
    p = Path(path)
    suffix = p.suffix.lower()
    mime = "image/png" if suffix == ".png" else "image/webp" if suffix == ".webp" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode('ascii')}"


def _raise_seedance_error(err: httpx.HTTPStatusError, payload: dict) -> None:
    response_text = err.response.text
    try:
        response_text = json.dumps(err.response.json(), ensure_ascii=False)
    except ValueError:
        pass
    request_summary = {
        "model": payload.get("model"),
        "ratio": payload.get("ratio"),
        "duration": payload.get("duration"),
        "resolution": payload.get("resolution"),
        "has_image": any(item.get("type") == "image_url" for item in payload.get("content", [])),
    }
    raise RuntimeError(
        "seedance create task failed: "
        f"{err.response.status_code} {response_text}; request={json.dumps(request_summary, ensure_ascii=False)}"
    ) from err


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
        create = client.post(
            f"{settings.ark_base_url}/contents/generations/tasks",
            headers=headers,
            json=create_payload,
        )
        try:
            create.raise_for_status()
        except httpx.HTTPStatusError as err:
            _raise_seedance_error(err, create_payload)
        task_id = create.json().get("id")
        if not task_id:
            raise RuntimeError("seedance create task missing id")

        started = time.time()
        last_status = ""
        video_url = None
        while (time.time() - started) * 1000 < settings.ark_video_poll_timeout_ms:
            time.sleep(settings.ark_video_poll_interval_ms / 1000)
            poll = client.get(
                f"{settings.ark_base_url}/contents/generations/tasks/{task_id}",
                headers=headers,
            )
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
        trace=[
            TraceItem(
                stage="model.video.live",
                message="Generated Seedance clip",
                payload={"task_id": task_id},
            )
        ],
    )
