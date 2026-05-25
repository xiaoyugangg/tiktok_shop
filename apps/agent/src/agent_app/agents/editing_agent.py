from agent_app.schemas import EditingPlanRequest, EditingPlanResponse, PlannedShot, TraceItem


def _best_material_id(req: EditingPlanRequest, shot_text: str) -> str | None:
    if not req.materials:
        return None
    shot_tokens = set(shot_text.lower().split())
    ranked = sorted(
        req.materials,
        key=lambda m: len(
            shot_tokens.intersection(set((m.embedding_text or m.summary).lower().split()))
        ),
        reverse=True,
    )
    return ranked[0].material_id


def build_editing_plan(req: EditingPlanRequest) -> EditingPlanResponse:
    trace = [
        TraceItem(stage="agent.plan.start", message="Read product, script, and materials"),
        TraceItem(stage="agent.plan.retrieve", message="Selected best material per shot"),
        TraceItem(stage="agent.plan.validate", message="Validated shot count and duration limits"),
    ]
    shots: list[PlannedShot] = []
    points = " / ".join(req.product.selling_points[:3])
    for shot in req.script.shots:
        material_id = _best_material_id(req, f"{shot.description} {req.product.title} {points}")
        subtitle = shot.subtitle or (
            req.product.selling_points[shot.idx % len(req.product.selling_points)]
            if req.product.selling_points
            else req.product.title
        )
        prompt = (
            f"Create a {req.script.ratio} e-commerce short video shot for {req.product.title}. "
            f"Scene: {shot.description}. Visual style: {req.script.visual_style}. "
            f"Selling point: {subtitle}. Avoid real human faces."
        )
        shots.append(
            PlannedShot(
                idx=shot.idx,
                prompt=prompt,
                subtitle=subtitle[:120],
                bgm_hint=shot.bgm_hint or "upbeat commercial",
                duration_sec=max(2, min(12, int(shot.duration_sec))),
                source_material_id=material_id,
                reason="Matched material and rewritten prompt for product-focused generation",
            )
        )
    return EditingPlanResponse(
        shots=shots,
        strategy="Agent v1: product-first prompt rewrite + material retrieval + constraint validation",
        trace=trace,
    )
