import base64
from pathlib import Path

import httpx

from agent_app.config import settings


def _fallback_caption(path: str, product_title: str | None = None) -> str:
    filename = Path(path).name
    title = product_title or "unknown product"
    return f"{filename} is an ecommerce material related to {title}."


def _image_data_url(path: str, mime: str) -> str:
    data = Path(path).read_bytes()
    safe_mime = mime if mime.startswith("image/") else "image/jpeg"
    return f"data:{safe_mime};base64,{base64.b64encode(data).decode('ascii')}"


def caption_material(path: str, mime: str, product_title: str | None = None) -> str:
    model = settings.ark_vision_model or settings.ark_text_model
    if (
        settings.model_mode == "mock"
        or not settings.ark_api_key
        or not model
        or not Path(path).exists()
    ):
        return _fallback_caption(path, product_title)

    data_url = _image_data_url(path, mime)
    prompt = (
        "Please describe this ecommerce material in one concise Chinese sentence. "
        "Focus on product subject, scene, color, composition, and value for a selling video. "
        "Do not invent brand, price, sales volume, or certifications. Keep it under 80 Chinese characters."
    )
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        "temperature": 0.2,
    }
    headers = {"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json"}
    resp = httpx.post(
        f"{settings.ark_base_url}/chat/completions",
        headers=headers,
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    return str(resp.json()["choices"][0]["message"]["content"]).strip()
