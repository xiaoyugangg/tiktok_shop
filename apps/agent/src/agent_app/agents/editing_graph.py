from typing import TypedDict

from langgraph.graph import END, StateGraph

from agent_app.schemas import (
    EditingPlanRequest,
    EditingPlanResponse,
    MaterialSummary,
    PlannedShot,
    TraceItem,
)


class EditingGraphState(TypedDict):
    req: EditingPlanRequest
    selected_materials: dict[int, str | None]
    planned_shots: list[PlannedShot]
    trace: list[TraceItem]


def _score_material(material: MaterialSummary, shot_text: str) -> int:
    material_text = f"{material.embedding_text} {material.summary} {' '.join(material.tags)}".lower()
    shot_tokens = set(shot_text.lower().split())
    return len(shot_tokens.intersection(set(material_text.split())))


def _choose_material(req: EditingPlanRequest, shot_text: str) -> str | None:
    if not req.materials:
        return None
    image_materials = [m for m in req.materials if m.kind == "image"]
    candidates = image_materials or req.materials
    ranked = sorted(candidates, key=lambda m: _score_material(m, shot_text), reverse=True)
    return ranked[0].material_id


def start_node(state: EditingGraphState) -> EditingGraphState:
    state["trace"].append(
        TraceItem(
            stage="agent.graph.start",
            message="LangGraph received product, script, and materials",
        )
    )
    return state


def retrieve_image_materials_node(state: EditingGraphState) -> EditingGraphState:
    req = state["req"]
    points = " / ".join(req.product.selling_points[:3])
    selected: dict[int, str | None] = {}
    for shot in req.script.shots:
        selected[shot.idx] = _choose_material(
            req, f"{shot.description} {req.product.title} {points}"
        )
    state["selected_materials"] = selected
    state["trace"].append(
        TraceItem(
            stage="agent.graph.retrieve_image_materials",
            message="Selected image-first material candidates for Seedance first-frame generation",
            payload={"selected": selected},
        )
    )
    return state


def rewrite_prompts_node(state: EditingGraphState) -> EditingGraphState:
    req = state["req"]
    planned: list[PlannedShot] = []
    for shot in req.script.shots:
        subtitle = shot.subtitle or (
            req.product.selling_points[shot.idx % len(req.product.selling_points)]
            if req.product.selling_points
            else req.product.title
        )
        prompt = (
            f"Create a {req.script.ratio} e-commerce short video shot for {req.product.title}. "
            f"Scene: {shot.description}. Visual style: {req.script.visual_style}. "
            f"Selling point: {subtitle}. Use the selected image as first-frame reference when "
            f"available. Avoid real human faces and avoid exaggerated product claims."
        )
        planned.append(
            PlannedShot(
                idx=shot.idx,
                prompt=prompt,
                subtitle=subtitle[:120],
                bgm_hint=shot.bgm_hint or "upbeat commercial",
                duration_sec=int(shot.duration_sec),
                source_material_id=state["selected_materials"].get(shot.idx),
                reason="LangGraph selected image-first material and rewrote prompt for Seedance generation",
            )
        )
    state["planned_shots"] = planned
    state["trace"].append(
        TraceItem(
            stage="agent.graph.rewrite_prompts",
            message="Rewrote shot prompts with product and policy constraints",
        )
    )
    return state


def validate_constraints_node(state: EditingGraphState) -> EditingGraphState:
    validated: list[PlannedShot] = []
    for shot in state["planned_shots"]:
        validated.append(
            PlannedShot(
                idx=shot.idx,
                prompt=shot.prompt,
                subtitle=shot.subtitle,
                bgm_hint=shot.bgm_hint,
                duration_sec=max(2, min(12, int(shot.duration_sec))),
                source_material_id=shot.source_material_id,
                reason=shot.reason,
            )
        )
    state["planned_shots"] = validated
    state["trace"].append(
        TraceItem(
            stage="agent.graph.validate_constraints",
            message="Clamped shot duration to Seedance-supported range",
        )
    )
    return state


def explain_node(state: EditingGraphState) -> EditingGraphState:
    state["trace"].append(
        TraceItem(
            stage="agent.graph.explain",
            message="Prepared explainable editing plan for frontend review",
            payload={"shot_count": len(state["planned_shots"])},
        )
    )
    return state


def build_editing_graph():
    graph = StateGraph(EditingGraphState)
    graph.add_node("start", start_node)
    graph.add_node("retrieve_image_materials", retrieve_image_materials_node)
    graph.add_node("rewrite_prompts", rewrite_prompts_node)
    graph.add_node("validate_constraints", validate_constraints_node)
    graph.add_node("explain", explain_node)
    graph.set_entry_point("start")
    graph.add_edge("start", "retrieve_image_materials")
    graph.add_edge("retrieve_image_materials", "rewrite_prompts")
    graph.add_edge("rewrite_prompts", "validate_constraints")
    graph.add_edge("validate_constraints", "explain")
    graph.add_edge("explain", END)
    return graph.compile()


def run_editing_graph(req: EditingPlanRequest) -> EditingPlanResponse:
    compiled = build_editing_graph()
    final_state = compiled.invoke(
        {
            "req": req,
            "selected_materials": {},
            "planned_shots": [],
            "trace": [],
        }
    )
    return EditingPlanResponse(
        shots=final_state["planned_shots"],
        strategy=(
            "LangGraph Agent v1: image-first retrieval -> prompt rewrite -> "
            "constraint validation -> explanation"
        ),
        trace=final_state["trace"],
    )
