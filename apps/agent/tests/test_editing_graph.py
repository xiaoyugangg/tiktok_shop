from agent_app.agents.editing_graph import build_editing_graph, run_editing_graph
from agent_app.schemas import (
    EditingPlanRequest,
    MaterialSummary,
    ProductInput,
    ScriptInput,
    ShotInput,
)


def test_editing_graph_prefers_image_material_over_video_material(monkeypatch):
    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.providers.ark_text.settings.model_mode", "mock")

    req = EditingPlanRequest(
        product=ProductInput(title="Wireless Earbuds", selling_points=["noise cancelling"]),
        script=ScriptInput(
            narrative="Hook then product benefit",
            visual_style="bright clean",
            ratio="9:16",
            shots=[ShotInput(idx=0, description="show product close-up", duration_sec=4)],
        ),
        materials=[
            MaterialSummary(
                material_id="video1",
                kind="video",
                summary="earbuds lifestyle video",
                tags=["earbuds", "video"],
                embedding_text="earbuds lifestyle video",
            ),
            MaterialSummary(
                material_id="image1",
                kind="image",
                summary="white earbuds product image",
                tags=["earbuds", "image"],
                embedding_text="white earbuds product image",
            ),
        ],
    )
    plan = run_editing_graph(req)
    assert plan.shots[0].source_material_id == "image1"
    assert any(t.stage == "editing.rag.retrieve" for t in plan.trace)
    assert any(t.stage == "editing.llm.plan" for t in plan.trace)
    assert "LangGraph" in plan.strategy


def test_build_editing_graph_compiles():
    graph = build_editing_graph()
    assert graph is not None
