from pathlib import Path

from agent_app.providers.seedance_video import clamp_duration, generate_clip
from agent_app.schemas import ClipGenerateRequest


def test_clamp_duration():
    assert clamp_duration(1) == 2
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
