from agent_app.callbacks import CallbackClient


def test_callback_client_posts_trace(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

    def fake_post(url, headers, json, timeout):
        calls.append((url, headers, json, timeout))
        return FakeResponse()

    monkeypatch.setattr("httpx.post", fake_post)
    client = CallbackClient(base_url="http://node.local", token="token-1")
    client.trace(task_id="t1", stage="stage.one", message="hello")

    assert calls[0][0] == "http://node.local/api/internal/trace"
    assert calls[0][1]["x-internal-token"] == "token-1"
    assert calls[0][2]["task_id"] == "t1"
