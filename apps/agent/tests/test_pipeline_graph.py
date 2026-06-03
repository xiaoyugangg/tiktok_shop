from agent_app.callbacks import CallbackClient
from pathlib import Path

from agent_app.agents.pipeline_graph import _shot_image_path, regenerate_shot, run_pipeline_graph
from agent_app.schemas import PipelineRunRequest, PipelineShotInput, RegenerateShotRequest


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
            PipelineShotInput(id="s1", idx=0, description="商品特写", duration_sec=4),
            PipelineShotInput(id="s2", idx=1, description="场景演示", duration_sec=4),
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


def test_first_shot_uses_main_material_even_when_idx_starts_at_one(tmp_path: Path):
    req = PipelineRunRequest(
        task_id="t1",
        ratio="9:16",
        storage_root=str(tmp_path),
        product_main_material_path="storage/uploads/main.jpg",
        shots=[
            PipelineShotInput(id="s1", idx=1, description="first generated shot", duration_sec=4),
            PipelineShotInput(id="s2", idx=2, description="second generated shot", duration_sec=4),
        ],
        callback_base_url="http://node.local",
        callback_token="token",
    )

    assert _shot_image_path(req, req.shots[0]) == "storage/uploads/main.jpg"
    assert _shot_image_path(req, req.shots[1]) is None


def test_regenerate_shot_mock_restitches_output(tmp_path: Path):
    callback_calls = []

    class FakeCallback:
        def trace(self, **kwargs):
            callback_calls.append(("trace", kwargs))

        def shot_status(self, **kwargs):
            callback_calls.append(("shot", kwargs))

        def task_status(self, **kwargs):
            callback_calls.append(("task", kwargs))

    shot = PipelineShotInput(id="s1", idx=0, description="product close up", duration_sec=4)
    req = RegenerateShotRequest(
        task_id="t1",
        ratio="9:16",
        storage_root=str(tmp_path),
        shot=shot,
        shots=[shot],
        enable_subtitle=False,
        enable_bgm=False,
        callback_base_url="http://node.local",
        callback_token="token",
    )

    result = regenerate_shot(req, callback=FakeCallback())

    assert result.status == "succeeded"
    assert result.output_path
    assert (tmp_path / result.output_path).exists()
    assert any(call[0] == "trace" and call[1]["stage"] == "shot.regenerate.success" for call in callback_calls)


def test_regenerate_shot_retries_duration_error(monkeypatch, tmp_path: Path):
    callback_calls = []
    attempts = []

    class FakeCallback:
        def trace(self, **kwargs):
            callback_calls.append(("trace", kwargs))

        def shot_status(self, **kwargs):
            callback_calls.append(("shot", kwargs))

        def task_status(self, **kwargs):
            callback_calls.append(("task", kwargs))

    def fake_generate_clip(req):
        attempts.append(req.duration_sec)
        if len(attempts) == 1:
            raise RuntimeError(
                'seedance create task failed: 400 {"error":{"code":"InvalidParameter",'
                '"message":"duration is invalid"}}'
            )
        Path(req.output_path).write_bytes(b"fake")

    def fake_concat(clips, output_path, ratio):
        Path(output_path).write_bytes(b"stitched")

    monkeypatch.setattr("agent_app.agents.pipeline_graph.generate_clip", fake_generate_clip)
    monkeypatch.setattr("agent_app.agents.pipeline_graph.concat_clips", fake_concat)

    shot = PipelineShotInput(id="s1", idx=0, description="product close up", duration_sec=3)
    req = RegenerateShotRequest(
        task_id="t1",
        ratio="9:16",
        storage_root=str(tmp_path),
        shot=shot,
        shots=[shot],
        enable_subtitle=False,
        enable_bgm=False,
        callback_base_url="http://node.local",
        callback_token="token",
    )

    result = regenerate_shot(req, callback=FakeCallback())

    assert result.status == "succeeded"
    assert attempts == [3, 5]
    assert any(call[0] == "trace" and call[1]["stage"] == "agent.retry.decision" for call in callback_calls)
    assert any(
        call[0] == "shot" and call[1]["status"] == "video_ok" and call[1]["duration_sec"] == 5
        for call in callback_calls
    )
