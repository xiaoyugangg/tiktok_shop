from agent_app.providers.embedding import cosine_similarity, normalize_vector


def test_normalize_vector_returns_unit_vector():
    vec = normalize_vector([3.0, 4.0])
    assert vec == [0.6, 0.8]


def test_cosine_similarity_prefers_similar_vector():
    query = normalize_vector([1.0, 0.0])
    good = normalize_vector([0.9, 0.1])
    bad = normalize_vector([0.0, 1.0])

    assert cosine_similarity(query, good) > cosine_similarity(query, bad)
