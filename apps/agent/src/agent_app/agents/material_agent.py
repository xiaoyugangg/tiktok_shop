import hashlib
import math
import re

from agent_app.schemas import (
    MaterialAnalyzeRequest,
    MaterialAnalyzeResponse,
    MaterialSearchRequest,
    MaterialSearchResponse,
    MaterialSearchResult,
    TraceItem,
)


def _tokens(text: str) -> list[str]:
    return [x for x in re.split(r"[^a-zA-Z0-9\u4e00-\u9fff]+", text.lower()) if x]


def _vector(text: str, dims: int = 16) -> list[float]:
    values = [0.0] * dims
    for token in _tokens(text):
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        idx = digest[0] % dims
        values[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in values)) or 1.0
    return [round(v / norm, 6) for v in values]


def _cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def analyze_material(req: MaterialAnalyzeRequest) -> MaterialAnalyzeResponse:
    base = " ".join(
        [req.filename, req.mime, req.kind, req.product_title or "", *req.selling_points]
    )
    tags = sorted(set([req.kind, *_tokens(base)[:8]]))
    summary = f"{req.kind} material {req.filename} for {req.product_title or 'unknown product'}"
    embedding_text = " ".join([summary, *tags])
    return MaterialAnalyzeResponse(
        material_id=req.material_id,
        summary=summary,
        tags=tags,
        embedding_text=embedding_text,
        embedding_vector=_vector(embedding_text),
        trace=[
            TraceItem(
                stage="material.analyze",
                message="Generated tags and deterministic mock embedding",
                payload={"tags": tags},
            )
        ],
    )


def search_materials(req: MaterialSearchRequest) -> MaterialSearchResponse:
    query_vec = _vector(req.query)
    ranked = sorted(
        (
            MaterialSearchResult(
                material_id=m.material_id,
                score=round(_cosine(query_vec, m.embedding_vector), 6),
                reason=f"Matched query against tags: {', '.join(m.tags[:5])}",
            )
            for m in req.materials
        ),
        key=lambda x: x.score,
        reverse=True,
    )[: req.limit]
    return MaterialSearchResponse(
        results=ranked,
        trace=[
            TraceItem(
                stage="material.search",
                message="Ranked materials by deterministic embedding similarity",
                payload={"query": req.query, "count": len(req.materials)},
            )
        ],
    )
