from agent_app.providers.vision_caption import caption_material


def test_caption_material_falls_back_without_model(tmp_path, monkeypatch):
    image = tmp_path / "product.jpg"
    image.write_bytes(b"fake")
    monkeypatch.setattr("agent_app.providers.vision_caption.settings.model_mode", "mock")

    caption = caption_material(str(image), "image/jpeg", "Wireless Earbuds")

    assert "Wireless Earbuds" in caption
    assert "product.jpg" in caption
