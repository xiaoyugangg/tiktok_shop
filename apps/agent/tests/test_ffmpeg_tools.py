from pathlib import Path

from agent_app.media.ffmpeg_tools import concat_clips, generate_mock_clip


def test_concat_clips_creates_output(tmp_path: Path):
    c1 = tmp_path / "c1.mp4"
    c2 = tmp_path / "c2.mp4"
    out = tmp_path / "out.mp4"
    generate_mock_clip(str(c1), "9:16", 1, "片段1")
    generate_mock_clip(str(c2), "9:16", 1, "片段2")
    concat_clips([str(c1), str(c2)], str(out), "9:16")

    assert out.exists()
