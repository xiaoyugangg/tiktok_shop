from agent_app.providers import embedding
from agent_app.providers.embedding import cosine_similarity, embed_text, normalize_vector


def test_normalize_vector_returns_unit_vector():
    vec = normalize_vector([3.0, 4.0])
    assert vec == [0.6, 0.8]


def test_cosine_similarity_prefers_similar_vector():
    query = normalize_vector([1.0, 0.0])
    good = normalize_vector([0.9, 0.1])
    bad = normalize_vector([0.0, 1.0])

    assert cosine_similarity(query, good) > cosine_similarity(query, bad)


def test_live_embedding_prefers_qwen_config(monkeypatch):
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"embedding": [3.0, 4.0]}]}

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(embedding.settings, "model_mode", "live")
    monkeypatch.setattr(embedding.settings, "qwen_embedding_api_key", "qwen-key")
    monkeypatch.setattr(embedding.settings, "qwen_embedding_base_url", "https://dashscope.example/v1/")
    monkeypatch.setattr(embedding.settings, "qwen_embedding_model", "text-embedding-v4")
    monkeypatch.setattr(embedding.settings, "ark_api_key", "ark-key")
    monkeypatch.setattr(embedding.settings, "ark_embedding_model", "ark-embedding")
    monkeypatch.setattr(embedding.httpx, "post", fake_post)

    values, model = embed_text("无线耳机")

    assert values == [0.6, 0.8]
    assert model == "text-embedding-v4"
    assert captured["url"] == "https://dashscope.example/v1/embeddings"
    assert captured["headers"]["Authorization"] == "Bearer qwen-key"
    assert captured["json"] == {"model": "text-embedding-v4", "input": "无线耳机"}
