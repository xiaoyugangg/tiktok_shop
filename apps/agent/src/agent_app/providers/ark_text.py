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


def _clamp_duration(value: int | float | str | None) -> int:
    try:
        parsed = round(float(value if value is not None else 4))
    except (TypeError, ValueError):
        parsed = 4
    return max(4, min(12, parsed))


def _normalize_script_payload(data: dict, ratio: str) -> dict:
    normalized_shots = []
    for idx, raw in enumerate((data.get("shots") or [])[:3]):
        if not isinstance(raw, dict):
            continue
        normalized_shots.append(
            {
                "idx": idx,
                "description": str(raw.get("description") or f"展示商品卖点 {idx + 1}"),
                "camera_motion": str(raw.get("camera_motion") or raw.get("cameraMotion") or ""),
                "subtitle": str(raw.get("subtitle") or ""),
                "bgm_hint": str(raw.get("bgm_hint") or raw.get("bgmHint") or ""),
                "duration_sec": _clamp_duration(raw.get("duration_sec") or raw.get("durationSec")),
            }
        )
    if not normalized_shots:
        normalized_shots.append(
            {
                "idx": 0,
                "description": "展示商品外观、核心卖点和使用场景",
                "camera_motion": "推进",
                "subtitle": "",
                "bgm_hint": "轻快商业音乐",
                "duration_sec": 4,
            }
        )
    data["ratio"] = ratio
    data["shots"] = normalized_shots
    data["constraints"] = list(data.get("constraints") or [])
    return data


def chat_json(system_prompt: str, user_payload: dict, stage: str) -> dict:
    if settings.model_mode == "mock" or not settings.ark_api_key or not settings.ark_text_model:
        product = user_payload["product"]
        rag_context = {item["idx"]: item for item in user_payload.get("rag_context", [])}
        shots = []
        for shot in user_payload["script"]["shots"]:
            candidates = rag_context.get(shot["idx"], {}).get("candidates", [])
            selected = candidates[0]["material_id"] if candidates else None
            subtitle = shot.get("subtitle") or (product.get("selling_points") or [product["title"]])[0]
            shots.append(
                {
                    "idx": shot["idx"],
                    "prompt": (
                        f"Create a {user_payload['script']['ratio']} ecommerce shot for "
                        f"{product['title']}. Scene: {shot['description']}. "
                        f"Selling point: {subtitle}. Use the selected first-frame material "
                        "when available. Avoid real human faces and exaggerated claims."
                    ),
                    "subtitle": subtitle,
                    "bgm_hint": shot.get("bgm_hint") or "upbeat commercial",
                    "duration_sec": max(4, min(12, int(shot.get("duration_sec", 4)))),
                    "source_material_id": selected,
                    "reason": "Mock LLM selected the top RAG candidate and rewrote the shot prompt.",
                }
            )
        return {"strategy": f"LangGraph LLM mock plan for {stage}", "shots": shots}

    headers = {"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json"}
    payload = {
        "model": settings.ark_text_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.4,
    }
    resp = httpx.post(
        f"{settings.ark_base_url}/chat/completions",
        headers=headers,
        json=payload,
        timeout=settings.ark_text_timeout_sec,
    )
    resp.raise_for_status()
    return json.loads(resp.json()["choices"][0]["message"]["content"])


def _mock_script(req: ScriptGenerateRequest) -> ScriptGenerateResponse:
    points = req.product.selling_points[:3] or [req.product.title]
    secondary_points = " / ".join(points[1:]) or points[0]
    reference = req.reference_analysis
    hook = reference.hook_type if reference else "商品特写"
    template = reference.reusable_template if reference else "吸引注意 -> 场景共鸣 -> 行动召唤"
    shots = [
        ScriptShotOutput(
            idx=0,
            description=f"参考「{hook}」打法，展示「{req.product.title}」外观与核心使用场景，开场快速吸引注意。",
            camera_motion="推进 + 轻微环绕",
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
            description=f"多角度产品镜头叠加卖点字幕，强化 {secondary_points}。",
            camera_motion="快速切换 + 旋转",
            subtitle="立即下单",
            bgm_hint="高潮收尾",
            duration_sec=4,
        ),
    ]
    return ScriptGenerateResponse(
        narrative=f"围绕「{req.product.title}」展开三段式带货叙事，参考模板：{template}。",
        visual_style=reference.visual_style if reference else "明亮通透、产品居中、字幕清晰、节奏紧凑",
        ratio=req.ratio,
        shots=shots,
        constraints=["单镜头时长 4-12 秒", "避免真实人脸", "字幕简短有力", f"画幅:{req.ratio}"],
        trace=[
            TraceItem(
                stage="model.script.mock",
                message="Generated mock script in Python provider",
                payload={"reference_analysis_id": reference.id if reference else None},
            )
        ],
    )


def generate_script(req: ScriptGenerateRequest) -> ScriptGenerateResponse:
    if settings.model_mode == "mock" or not settings.ark_api_key or not settings.ark_text_model:
        return _mock_script(req)

    system_prompt = (
        "你是电商短视频编导。请严格输出 JSON，字段包括 narrative, visual_style, ratio, "
        "shots, constraints。shots 固定输出 3 个，每项包含 idx, description, camera_motion, subtitle, "
        "bgm_hint, duration_sec。每个分镜 duration_sec 必须为 4-12 秒，不限制总时长。"
        "如果提供 reference_analysis，请复用其 Hook 手法、分镜结构、字幕风格、CTA 和可复用模板，"
        "但必须改写为当前商品，不能照抄。"
    )
    user_prompt = json.dumps(
        {
            "title": req.product.title,
            "selling_points": req.product.selling_points,
            "target_audience": req.product.target_audience,
            "scene": req.product.scene,
            "ratio": req.ratio,
            "reference_analysis": req.reference_analysis.model_dump() if req.reference_analysis else None,
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
                timeout=settings.ark_text_timeout_sec,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            data = json.loads(raw)
            data = _normalize_script_payload(data, req.ratio)
            data["trace"] = [
                TraceItem(
                    stage="model.script.live",
                    message="Generated script with Ark text model",
                    payload={
                        "reference_analysis_id": req.reference_analysis.id
                        if req.reference_analysis
                        else None
                    },
                ).model_dump()
            ]
            return ScriptGenerateResponse.model_validate(data)
        except (httpx.HTTPError, KeyError, json.JSONDecodeError, ValidationError) as err:
            last_error = err
    raise RuntimeError(f"script generation failed: {last_error}")
