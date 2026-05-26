from pathlib import Path
import subprocess

from agent_app.media.ffmpeg_tools import concat_clips, generate_mock_clip


def _generate_clip_with_audio(path: Path, frequency: int) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-t",
            "1",
            "-i",
            "color=c=blue:s=720x1280:r=24",
            "-f",
            "lavfi",
            "-t",
            "1",
            "-i",
            f"sine=frequency={frequency}:sample_rate=44100",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-pix_fmt",
            "yuv420p",
            str(path),
        ],
        check=True,
    )


def _has_audio_stream(path: Path) -> bool:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "csv=p=0",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return "audio" in result.stdout


def test_concat_clips_creates_output(tmp_path: Path):
    c1 = tmp_path / "c1.mp4"
    c2 = tmp_path / "c2.mp4"
    out = tmp_path / "out.mp4"
    generate_mock_clip(str(c1), "9:16", 1, "片段1")
    generate_mock_clip(str(c2), "9:16", 1, "片段2")
    concat_clips([str(c1), str(c2)], str(out), "9:16")

    assert out.exists()


def test_concat_clips_preserves_audio_stream(tmp_path: Path):
    c1 = tmp_path / "audio1.mp4"
    c2 = tmp_path / "audio2.mp4"
    out = tmp_path / "out_audio.mp4"
    _generate_clip_with_audio(c1, 440)
    _generate_clip_with_audio(c2, 660)

    concat_clips([str(c1), str(c2)], str(out), "9:16")

    assert out.exists()
    assert _has_audio_stream(out)
