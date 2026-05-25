from agent_app.agents.editing_agent import build_editing_plan
from agent_app.schemas import (
    EditingPlanRequest,
    MaterialSummary,
    ProductInput,
    ScriptInput,
    ShotInput,
)


def test_editing_plan_returns_one_planned_shot_per_input_shot():
    req = EditingPlanRequest(
        product=ProductInput(title="Wireless Earbuds", selling_points=["noise cancelling"]),
        script=ScriptInput(
            narrative="Hook then product benefit",
            visual_style="bright clean",
            ratio="9:16",
            shots=[
                ShotInput(idx=0, description="show product", duration_sec=4),
                ShotInput(idx=1, description="use in commute", duration_sec=5),
            ],
        ),
        materials=[
            MaterialSummary(
                material_id="m1",
                kind="image",
                summary="white earbuds product image",
                tags=["earbuds", "image"],
                embedding_text="white earbuds product image",
                embedding_vector=[1.0] + [0.0] * 15,
            )
        ],
    )
    plan = build_editing_plan(req)
    assert len(plan.shots) == 2
    assert plan.shots[0].source_material_id == "m1"
    assert "Wireless Earbuds" in plan.shots[0].prompt
    assert any(t.stage == "agent.graph.start" for t in plan.trace)
    assert "LangGraph" in plan.strategy
