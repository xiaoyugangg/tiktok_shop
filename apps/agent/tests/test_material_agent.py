from agent_app.agents.material_agent import analyze_material, search_materials
from agent_app.schemas import MaterialAnalyzeRequest, MaterialSearchRequest


def test_analyze_material_generates_tags_and_vector(monkeypatch):
    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.providers.vision_caption.settings.model_mode", "mock")

    result = analyze_material(
        MaterialAnalyzeRequest(
            material_id="m1",
            filename="white-wireless-earbuds.png",
            mime="image/png",
            kind="image",
            product_title="Wireless Earbuds",
            selling_points=["noise cancelling", "long battery"],
        )
    )
    assert result.material_id == "m1"
    assert result.caption
    assert "image" in result.tags
    assert len(result.embedding_vector) == 64
    assert result.embedding_model == "mock-hash-64"
    assert result.trace[0].stage == "material.analyze"


def test_search_materials_ranks_related_material_first(monkeypatch):
    monkeypatch.setattr("agent_app.providers.embedding.settings.model_mode", "mock")
    monkeypatch.setattr("agent_app.providers.vision_caption.settings.model_mode", "mock")

    m1 = analyze_material(
        MaterialAnalyzeRequest(
            material_id="m1",
            filename="white-earbuds.png",
            mime="image/png",
            kind="image",
            product_title="Earbuds",
        )
    )
    m2 = analyze_material(
        MaterialAnalyzeRequest(
            material_id="m2",
            filename="kitchen-pan.mp4",
            mime="video/mp4",
            kind="video",
            product_title="Pan",
        )
    )
    result = search_materials(
        MaterialSearchRequest(query="earbuds product image", materials=[m2, m1])
    )
    assert result.results[0].material_id == "m1"
