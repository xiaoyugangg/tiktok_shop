from agent_app.callbacks import CallbackClient
from pathlib import Path

from agent_app.agents.pipeline_graph import run_pipeline_graph
from agent_app.schemas import PipelineRunRequest, PipelineShotInput


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


def test_pipeline_graph_mock_generates_output(tmp_path: Path):
    callback_calls = []

    class FakeCallback:
        def trace(self, **kwargs):
            callback_calls.append(("trace", kwargs))

        def shot_status(self, **kwargs):
            callback_calls.append(("shot", kwargs))

        def task_status(self, **kwargs):
            callback_calls.append(("task", kwargs))

    req = PipelineRunRequest(
        task_id="t1",
        ratio="9:16",
        storage_root=str(tmp_path),
        shots=[
            PipelineShotInput(id="s1", idx=0, description="商品特写", duration_sec=2),
            PipelineShotInput(id="s2", idx=1, description="场景演示", duration_sec=2),
        ],
        enable_subtitle=False,
        enable_bgm=False,
        callback_base_url="http://node.local",
        callback_token="token",
    )
    result = run_pipeline_graph(req, callback=FakeCallback())

    assert result.status == "succeeded"
    assert result.output_path
    assert (tmp_path / result.output_path).exists()
    assert any(call[0] == "shot" and call[1]["status"] == "video_ok" for call in callback_calls)
