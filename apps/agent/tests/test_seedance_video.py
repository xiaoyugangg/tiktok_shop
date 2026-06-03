from pathlib import Path

import pytest

from agent_app.providers import seedance_video
from agent_app.providers.seedance_video import clamp_duration, generate_clip
from agent_app.schemas import ClipGenerateRequest


def test_clamp_duration():
    assert clamp_duration(1) == 4
    assert clamp_duration(3) == 4
    assert clamp_duration(20) == 12
    assert clamp_duration(5) == 5


def test_generate_clip_mock_creates_file(tmp_path: Path):
    output = tmp_path / "clip.mp4"
    result = generate_clip(
        ClipGenerateRequest(
            prompt="商品特写",
            ratio="9:16",
            duration_sec=2,
            output_path=str(output),
        )
    )

    assert output.exists()
    assert result.output_path == str(output)


def test_generate_clip_live_error_includes_response_body(monkeypatch, tmp_path: Path):
    class Response:
        status_code = 400
        text = '{"error":{"code":"InvalidParameter","message":"duration is invalid"}}'

        def raise_for_status(self):
            import httpx

            raise httpx.HTTPStatusError(
                "400 Bad Request",
                request=httpx.Request("POST", "https://example.test/tasks"),
                response=httpx.Response(400, text=self.text),
            )

    class Client:
        def __init__(self, timeout):
            self.timeout = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers, json):
            return Response()

    monkeypatch.setattr(seedance_video.settings, "model_mode", "live")
    monkeypatch.setattr(seedance_video.settings, "ark_api_key", "ark-key")
    monkeypatch.setattr(seedance_video.settings, "ark_video_model", "seedance")
    monkeypatch.setattr(seedance_video.httpx, "Client", Client)

    with pytest.raises(RuntimeError, match="InvalidParameter.*duration"):
        generate_clip(
            ClipGenerateRequest(
                prompt="商品特写",
                ratio="9:16",
                duration_sec=3,
                output_path=str(tmp_path / "clip.mp4"),
            )
        )
