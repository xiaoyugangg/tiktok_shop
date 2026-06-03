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


def test_editing_graph_clamps_short_shot_to_seedance_minimum(monkeypatch):
    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.providers.ark_text.settings.model_mode", "mock")

    req = EditingPlanRequest(
        product=ProductInput(title="Wireless Earbuds", selling_points=["noise cancelling"]),
        script=ScriptInput(
            narrative="Hook then product benefit",
            visual_style="bright clean",
            ratio="9:16",
            shots=[ShotInput(idx=0, description="show product close-up", duration_sec=3)],
        ),
    )

    plan = run_editing_graph(req)

    assert plan.shots[0].duration_sec == 4


def test_editing_graph_uses_one_embedding_query_for_all_shots(monkeypatch):
    calls = []

    def fake_embed_text(text):
        calls.append(text)
        return [1.0, 0.0], "fake-embedding"

    monkeypatch.setattr("agent_app.agents.editing_graph.embed_text", fake_embed_text)
    monkeypatch.setattr("agent_app.providers.ark_text.settings.model_mode", "mock")

    req = EditingPlanRequest(
        product=ProductInput(title="Wireless Earbuds", selling_points=["noise cancelling"]),
        script=ScriptInput(
            narrative="Hook then product benefit",
            visual_style="bright clean",
            ratio="9:16",
            shots=[
                ShotInput(idx=0, description="show product close-up", duration_sec=4),
                ShotInput(idx=1, description="use in commute", duration_sec=4),
                ShotInput(idx=2, description="call to action", duration_sec=4),
            ],
        ),
        materials=[
            MaterialSummary(
                material_id="image1",
                kind="image",
                summary="white earbuds product image",
                tags=["earbuds", "image"],
                embedding_text="white earbuds product image",
                embedding_vector=[1.0, 0.0],
            )
        ],
    )

    plan = run_editing_graph(req)

    assert len(calls) == 1
    assert len(plan.shots) == 3


def test_editing_graph_falls_back_when_llm_plan_times_out(monkeypatch):
    def fake_chat_json(*_args, **_kwargs):
        raise TimeoutError("text model timed out")

    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.agents.editing_graph.chat_json", fake_chat_json)

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
                material_id="image1",
                kind="image",
                summary="white earbuds product image",
                tags=["earbuds", "image"],
                embedding_text="white earbuds product image",
            )
        ],
    )

    plan = run_editing_graph(req)

    assert len(plan.shots) == 1
    assert plan.shots[0].source_material_id == "image1"
    assert "兜底" in plan.strategy
    assert any(item.stage == "editing.llm.timeout_fallback" for item in plan.trace)


def test_editing_graph_prefers_distinct_materials(monkeypatch):
    def fake_chat_json(*_args, **_kwargs):
        return {
            "strategy": "test duplicate material plan",
            "shots": [
                {
                    "idx": 0,
                    "prompt": "shot 0",
                    "subtitle": "s0",
                    "bgm_hint": "upbeat",
                    "duration_sec": 4,
                    "source_material_id": "image1",
                    "reason": "duplicate",
                },
                {
                    "idx": 1,
                    "prompt": "shot 1",
                    "subtitle": "s1",
                    "bgm_hint": "upbeat",
                    "duration_sec": 4,
                    "source_material_id": "image1",
                    "reason": "duplicate",
                },
                {
                    "idx": 2,
                    "prompt": "shot 2",
                    "subtitle": "s2",
                    "bgm_hint": "upbeat",
                    "duration_sec": 4,
                    "source_material_id": "image1",
                    "reason": "duplicate",
                },
            ],
        }

    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.agents.editing_graph.chat_json", fake_chat_json)

    req = EditingPlanRequest(
        product=ProductInput(title="Wireless Earbuds", selling_points=["noise cancelling"]),
        script=ScriptInput(
            narrative="Hook then product benefit",
            visual_style="bright clean",
            ratio="9:16",
            shots=[
                ShotInput(idx=0, description="show product close-up", duration_sec=4),
                ShotInput(idx=1, description="show package", duration_sec=4),
                ShotInput(idx=2, description="subway commute", duration_sec=4),
            ],
        ),
        materials=[
            MaterialSummary(
                material_id="image1",
                kind="image",
                summary="white earbuds product image",
                tags=["earbuds"],
                embedding_text="white earbuds product image",
            ),
            MaterialSummary(
                material_id="image2",
                kind="image",
                summary="earbuds package image",
                tags=["package"],
                embedding_text="earbuds package image",
            ),
        ],
    )

    plan = run_editing_graph(req)

    assert [shot.source_material_id for shot in plan.shots] == ["image1", "image2", None]
    assert any(item.stage == "editing.material.dedupe" for item in plan.trace)


def test_editing_graph_respects_llm_null_material_selection(monkeypatch):
    def fake_chat_json(*_args, **_kwargs):
        return {
            "strategy": "test no material needed",
            "shots": [
                {
                    "idx": 0,
                    "prompt": "纯文本生成一个通勤场景分镜，不使用商品素材图。",
                    "subtitle": "安静通勤",
                    "bgm_hint": "轻快",
                    "duration_sec": 4,
                    "source_material_id": None,
                    "reason": "候选素材是静态产品白底图，不适合这个通勤场景分镜。",
                }
            ],
        }

    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.agents.editing_graph.chat_json", fake_chat_json)

    req = EditingPlanRequest(
        product=ProductInput(title="Wireless Earbuds", selling_points=["noise cancelling"]),
        script=ScriptInput(
            narrative="Hook then product benefit",
            visual_style="bright clean",
            ratio="9:16",
            shots=[ShotInput(idx=0, description="subway commute scene", duration_sec=4)],
        ),
        materials=[
            MaterialSummary(
                material_id="image1",
                kind="image",
                summary="white earbuds product image on plain background",
                tags=["earbuds", "product"],
                embedding_text="white earbuds product image on plain background",
            )
        ],
    )

    plan = run_editing_graph(req)

    assert plan.shots[0].source_material_id is None
