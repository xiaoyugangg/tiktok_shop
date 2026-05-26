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
    secondary_points = " / ".join(points[1:]) or points[0]
    shots = [
        ScriptShotOutput(
            idx=0,
            description=f"商品特写展示「{req.product.title}」外观与质感，开场快速吸引注意。",
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
