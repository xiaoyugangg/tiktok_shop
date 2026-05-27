import hashlib
import math
import re

import httpx

from agent_app.config import settings


def _tokens(text: str) -> list[str]:
    return [x for x in re.split(r"[^a-zA-Z0-9\u4e00-\u9fff]+", text.lower()) if x]


def normalize_vector(values: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in values)) or 1.0
    return [round(x / norm, 8) for x in values]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    return float(sum(x * y for x, y in zip(a, b)))


def fallback_embedding(text: str, dims: int = 64) -> list[float]:
    values = [0.0] * dims
    for token in _tokens(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        values[digest[0] % dims] += 1.0
    return normalize_vector(values)


def embed_text(text: str) -> tuple[list[float], str]:
    if settings.model_mode == "mock":
        return fallback_embedding(text), "mock-hash-64"

    if not settings.ark_api_key or not settings.ark_embedding_model:
        raise RuntimeError("ARK_EMBEDDING_MODEL is required for live material embedding")

    headers = {"Authorization": f"Bearer {settings.ark_api_key}", "Content-Type": "application/json"}
    payload = {"model": settings.ark_embedding_model, "input": text}
    resp = httpx.post(
        f"{settings.ark_base_url}/embeddings",
        headers=headers,
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    values = data["data"][0]["embedding"]
    return normalize_vector([float(x) for x in values]), settings.ark_embedding_model
