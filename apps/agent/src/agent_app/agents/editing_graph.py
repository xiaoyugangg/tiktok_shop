import logging
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

logger = logging.getLogger(__name__)


class EditingGraphState(TypedDict):
    req: EditingPlanRequest
    rag_context: list[ShotRagContext]
    llm_payload: dict
    planned_shots: list[PlannedShot]
    strategy: str
    material_deduped: bool
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


def _global_query(req: EditingPlanRequest) -> str:
    shot_text = " ".join(
        " ".join([shot.description, shot.subtitle, shot.camera_motion]) for shot in req.script.shots
    )
    return " ".join(
        [
            req.product.title,
            " ".join(req.product.selling_points[:5]),
            req.product.scene or "",
            req.product.target_audience or "",
            req.script.narrative,
            req.script.visual_style,
            shot_text,
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
                    f"生成一个 {req.script.ratio} 电商带货短视频分镜，商品是「{req.product.title}」。"
                    f"画面内容：{shot.description}。视觉风格：{req.script.visual_style}。"
                    f"核心卖点：{subtitle}。如果存在选中的素材图，请作为首帧或商品视觉参考使用。"
                    "避免真实清晰人脸和夸张宣传，画面重点突出商品与使用场景。"
                ),
                subtitle=subtitle[:120],
                bgm_hint=shot.bgm_hint or "轻快商业音乐",
                duration_sec=max(4, min(12, int(shot.duration_sec))),
                source_material_id=selected,
                reason="兜底方案选择当前分镜的最高分 RAG 候选素材，并根据原始脚本重写生成提示词。",
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
    global_query = _global_query(req)
    try:
        query_vector, model = embed_text(global_query)
    except Exception as err:
        query_vector, model = [], "token-fallback"
        state["trace"].append(
            TraceItem(
                stage="editing.rag.embedding_fallback",
                message="Fell back to token retrieval after query embedding failed",
                payload={"error": str(err)[:240]},
            )
        )
    for shot in req.script.shots:
        query = _shot_query(req, shot)
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
            "这是视频生成计划，不是对已有视频文件做时间线剪辑。",
            "每个分镜最多选择一个 source_material_id。",
            "只能使用候选素材 ID；如果没有合适素材，source_material_id 返回 null。",
            "duration_sec 必须在 4 到 12 秒之间。",
            "避免真实清晰人脸和夸张宣传。",
            "严格返回 JSON，只包含 strategy 和 shots。",
            "strategy、prompt、subtitle、bgm_hint、reason 必须使用中文。",
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
        "你是电商带货短视频的智能分镜规划 Agent。请为 Seedance 视频生成模型创建分镜级生成方案，"
        "注意你不是在剪辑已有视频文件，而是在规划每个分镜如何生成。"
        "每个输入分镜都必须返回 idx、prompt、subtitle、bgm_hint、duration_sec、"
        "source_material_id 和 reason。source_material_id 只能使用候选素材 ID，"
        "没有合适素材时返回 null。必须严格输出 JSON。"
        "strategy、prompt、subtitle、bgm_hint、reason 必须使用中文，表达要适合前端直接展示。"
    )
    try:
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
    except Exception as err:
        logger.warning("editing LLM planning failed, using fallback", exc_info=err)
        state["planned_shots"] = _fallback_plan(state["req"], state["rag_context"])
        state["strategy"] = "LLM 规划超时或模型服务异常，LangGraph 已使用基于脚本和 RAG 素材的兜底分镜方案。"
        state["trace"].append(
            TraceItem(
                stage="editing.llm.timeout_fallback",
                message="Used deterministic fallback because LLM planning failed",
                payload={"error": str(err)[:240]},
            )
        )
    return state


def _validate_plan(
    req: EditingPlanRequest,
    shots: list[PlannedShot],
    rag_context: list[ShotRagContext],
) -> tuple[list[PlannedShot], bool]:
    expected = {shot.idx: shot for shot in req.script.shots}
    candidate_ids = {material.material_id for material in req.materials}
    candidates_by_idx = {context.idx: context.candidates for context in rag_context}
    by_idx = {shot.idx: shot for shot in shots}
    if set(by_idx) != set(expected):
        raise ValueError("planned shot indexes do not match script shot indexes")

    validated: list[PlannedShot] = []
    used_source_ids: set[str] = set()
    material_deduped = False
    for idx, original in expected.items():
        shot = by_idx[idx]
        source_id = None
        if shot.source_material_id is not None:
            source_id = shot.source_material_id if shot.source_material_id in candidate_ids else None
            if source_id is None or source_id in used_source_ids:
                if source_id in used_source_ids:
                    material_deduped = True
                source_id = next(
                    (
                        candidate.material_id
                        for candidate in candidates_by_idx.get(idx, [])
                        if candidate.material_id not in used_source_ids
                    ),
                    None,
                )
            if source_id is None:
                material_deduped = True
        if source_id:
            used_source_ids.add(source_id)
        validated.append(
            PlannedShot(
                idx=idx,
                prompt=shot.prompt.strip() or original.description,
                subtitle=(shot.subtitle or original.subtitle or req.product.title)[:120],
                bgm_hint=shot.bgm_hint or original.bgm_hint or "upbeat commercial",
                duration_sec=max(4, min(12, int(shot.duration_sec))),
                source_material_id=source_id,
                reason=shot.reason or "Validated LLM generation plan.",
            )
        )
    return validated, material_deduped


def dedupe_materials_node(state: EditingGraphState) -> EditingGraphState:
    if state["material_deduped"]:
        state["trace"].append(
            TraceItem(
                stage="editing.material.dedupe",
                message="Adjusted repeated material selections across planned shots",
            )
        )
    return state


def validate_plan_node(state: EditingGraphState) -> EditingGraphState:
    try:
        state["planned_shots"], state["material_deduped"] = _validate_plan(
            state["req"], state["planned_shots"], state["rag_context"]
        )
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
        state["material_deduped"] = False
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
    graph.add_node("dedupe_materials", dedupe_materials_node)
    graph.add_node("explain", explain_node)
    graph.set_entry_point("start")
    graph.add_edge("start", "retrieve_materials")
    graph.add_edge("retrieve_materials", "build_context")
    graph.add_edge("build_context", "llm_editing_plan")
    graph.add_edge("llm_editing_plan", "validate_plan")
    graph.add_edge("validate_plan", "dedupe_materials")
    graph.add_edge("dedupe_materials", "explain")
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
            "material_deduped": False,
            "trace": [],
        }
    )
    return EditingPlanResponse(
        shots=final_state["planned_shots"],
        strategy=final_state["strategy"] or "LangGraph LLM editing plan",
        trace=final_state["trace"],
    )
