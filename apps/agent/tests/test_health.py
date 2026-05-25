from fastapi.testclient import TestClient

from agent_app.main import app


def test_health_returns_service_name():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["service"] == "tiktop-agent"
