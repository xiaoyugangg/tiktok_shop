from typing import TypedDict

from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from agent_app.config import settings
from agent_app.providers.ark_text import chat_json
from agent_app.providers.embedding import cosine_similarity, embed_text
from agent_app.schemas import (
    EditingPlanRequest,
    EditingPlanResponse,
    MaterialSummary,
    PlannedShot,
    RagCandidate,
    ShotInput,
    ShotRagContext,
    TraceItem,
)


class EditingGraphState(TypedDict):
    req: EditingPlanRequest
    rag_context: list[ShotRagContext]
    llm_payload: dict
    planned_shots: list[PlannedShot]
    strategy: str
    trace: list[TraceItem]


def _token_score(material: MaterialSummary, query: str) -> float:
    material_text = " ".join(
        [material.caption or "", material.summary, material.embedding_text, *material.tags]
    ).lower()
    query_tokens = set(query.lower().split())
    if not query_tokens:
        return 0.0
    return len(query_tokens.intersection(set(material_text.split()))) / len(query_tokens)


def _score_material(material: MaterialSummary, query: str, query_vector: list[float]) -> float:
    if material.embedding_vector and query_vector:
        score = cosine_similarity(query_vector, material.embedding_vector)
    else:
        score = _token_score(material, query)
    if material.kind == "image":
        score += 0.05
    return score


def _shot_query(req: EditingPlanRequest, shot: ShotInput) -> str:
    points = " ".join(req.product.selling_points[:3])
    return " ".join(
        [
            req.product.title,
            points,
            req.product.scene or "",
            shot.description,
            shot.subtitle,
            shot.camera_motion,
        ]
    ).strip()


def _fallback_plan(req: EditingPlanRequest, rag_context: list[ShotRagContext]) -> list[PlannedShot]:
    candidates_by_idx = {item.idx: item.candidates for item in rag_context}
    planned: list[PlannedShot] = []
    for shot in req.script.shots:
        candidates = candidates_by_idx.get(shot.idx, [])
        selected = candidates[0].material_id if candidates else None
        subtitle = shot.subtitle or (
            req.product.selling_points[shot.idx % len(req.product.selling_points)]
            if req.product.selling_points
            else req.product.title
        )
        planned.append(
            PlannedShot(
                idx=shot.idx,
                prompt=(
                    f"Create a {req.script.ratio} ecommerce short video shot for "
                    f"{req.product.title}. Scene: {shot.description}. Visual style: "
                    f"{req.script.visual_style}. Selling point: {subtitle}. Use selected "
                    "first-frame material when available. Avoid real human faces and "
                    "exaggerated product claims."
                ),
                subtitle=subtitle[:120],
                bgm_hint=shot.bgm_hint or "upbeat commercial",
                duration_sec=max(2, min(12, int(shot.duration_sec))),
                source_material_id=selected,
                reason="Fallback plan selected the top RAG candidate and rewrote the prompt.",
            )
        )
    return planned


def start_node(state: EditingGraphState) -> EditingGraphState:
    state["trace"].append(
        TraceItem(
            stage="agent.graph.start",
            message="LangGraph received product, script, and material semantic context",
        )
    )
    return state


def retrieve_materials_node(state: EditingGraphState) -> EditingGraphState:
    req = state["req"]
    contexts: list[ShotRagContext] = []
    for shot in req.script.shots:
        query = _shot_query(req, shot)
        try:
            query_vector, model = embed_text(query)
        except Exception:
            query_vector, model = [], "token-fallback"
        ranked = sorted(
            (
                RagCandidate(
                    material_id=material.material_id,
                    kind=material.kind,
                    caption=material.caption,
                    summary=material.summary,
                    tags=material.tags,
                    score=round(_score_material(material, query, query_vector), 6),
                )
                for material in req.materials
            ),
            key=lambda item: item.score,
            reverse=True,
        )[: settings.material_rag_top_k]
        contexts.append(ShotRagContext(idx=shot.idx, query=query, candidates=ranked))
        state["trace"].append(
            TraceItem(
                stage="editing.rag.retrieve",
                message=f"Retrieved material candidates for shot {shot.idx}",
                payload={
                    "idx": shot.idx,
                    "query": query,
                    "embedding_model": model,
                    "candidates": [candidate.model_dump() for candidate in ranked],
                },
            )
        )
    state["rag_context"] = contexts
    return state


def build_context_node(state: EditingGraphState) -> EditingGraphState:
    req = state["req"]
    state["llm_payload"] = {
        "product": req.product.model_dump(),
        "script": req.script.model_dump(),
        "rag_context": [context.model_dump() for context in state["rag_context"]],
        "constraints": [
            "This is a generation plan, not timeline editing of existing video files.",
            "Each shot may select at most one source_material_id.",
            "Use only candidate material IDs. Use null if no candidate is relevant.",
            "duration_sec must be between 2 and 12.",
            "Keep total duration close to 15 seconds when possible.",
            "Avoid real human faces and exaggerated product claims.",
            "Return strict JSON with strategy and shots only.",
        ],
    }
    state["trace"].append(
        TraceItem(
            stage="editing.context.build",
            message="Built LLM context from product, script, and RAG candidates",
        )
    )
    return state


def llm_editing_plan_node(state: EditingGraphState) -> EditingGraphState:
    system_prompt = (
        "You are an ecommerce short-video generation planner. Create a shot-level "
        "generation plan for Seedance. You are not editing existing video files. "
        "For each input shot, return idx, prompt, subtitle, bgm_hint, duration_sec, "
        "source_material_id, and reason. Use only provided candidate material IDs or null."
    )
    result = chat_json(system_prompt, state["llm_payload"], "editing.llm.plan")
    state["strategy"] = str(result.get("strategy") or "LangGraph LLM editing plan")
    state["planned_shots"] = [PlannedShot.model_validate(item) for item in result.get("shots", [])]
    state["trace"].append(
        TraceItem(
            stage="editing.llm.plan",
            message="LLM generated a shot-level generation plan",
            payload={"shot_count": len(state["planned_shots"])},
        )
    )
    return state


def _validate_plan(req: EditingPlanRequest, shots: list[PlannedShot]) -> list[PlannedShot]:
    expected = {shot.idx: shot for shot in req.script.shots}
    candidate_ids = {
        material.material_id
        for material in req.materials
    }
    by_idx = {shot.idx: shot for shot in shots}
    if set(by_idx) != set(expected):
        raise ValueError("planned shot indexes do not match script shot indexes")

    validated: list[PlannedShot] = []
    for idx, original in expected.items():
        shot = by_idx[idx]
        source_id = shot.source_material_id if shot.source_material_id in candidate_ids else None
        validated.append(
            PlannedShot(
                idx=idx,
                prompt=shot.prompt.strip() or original.description,
                subtitle=(shot.subtitle or original.subtitle or req.product.title)[:120],
                bgm_hint=shot.bgm_hint or original.bgm_hint or "upbeat commercial",
                duration_sec=max(2, min(12, int(shot.duration_sec))),
                source_material_id=source_id,
                reason=shot.reason or "Validated LLM generation plan.",
            )
        )
    return validated


def validate_plan_node(state: EditingGraphState) -> EditingGraphState:
    try:
        state["planned_shots"] = _validate_plan(state["req"], state["planned_shots"])
        state["trace"].append(
            TraceItem(
                stage="editing.validate",
                message="Validated LLM editing plan against script and material candidates",
            )
        )
    except (ValueError, ValidationError) as err:
        state["trace"].append(
            TraceItem(
                stage="editing.validate.failed",
                message=str(err),
                payload={"fallback": True},
            )
        )
        state["planned_shots"] = _fallback_plan(state["req"], state["rag_context"])
        state["strategy"] = "LangGraph fallback plan after invalid LLM output"
        state["trace"].append(
            TraceItem(
                stage="editing.llm.fallback",
                message="Used deterministic fallback editing plan",
            )
        )
    return state


def explain_node(state: EditingGraphState) -> EditingGraphState:
    state["trace"].append(
        TraceItem(
            stage="agent.graph.explain",
            message="Prepared explainable generation plan for frontend review",
            payload={"shot_count": len(state["planned_shots"])},
        )
    )
    return state


def build_editing_graph():
    graph = StateGraph(EditingGraphState)
    graph.add_node("start", start_node)
    graph.add_node("retrieve_materials", retrieve_materials_node)
    graph.add_node("build_context", build_context_node)
    graph.add_node("llm_editing_plan", llm_editing_plan_node)
    graph.add_node("validate_plan", validate_plan_node)
    graph.add_node("explain", explain_node)
    graph.set_entry_point("start")
    graph.add_edge("start", "retrieve_materials")
    graph.add_edge("retrieve_materials", "build_context")
    graph.add_edge("build_context", "llm_editing_plan")
    graph.add_edge("llm_editing_plan", "validate_plan")
    graph.add_edge("validate_plan", "explain")
    graph.add_edge("explain", END)
    return graph.compile()


def run_editing_graph(req: EditingPlanRequest) -> EditingPlanResponse:
    compiled = build_editing_graph()
    final_state = compiled.invoke(
        {
            "req": req,
            "rag_context": [],
            "llm_payload": {},
            "planned_shots": [],
            "strategy": "",
            "trace": [],
        }
    )
    return EditingPlanResponse(
        shots=final_state["planned_shots"],
        strategy=final_state["strategy"] or "LangGraph LLM editing plan",
        trace=final_state["trace"],
    )
