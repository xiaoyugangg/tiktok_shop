from pathlib import Path
import subprocess

from agent_app.media.postprocess import build_ass_text
from agent_app.schemas import PostprocessRequest, SubtitleCue


def _generate_clip_with_audio(path: Path) -> None:
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
            "sine=frequency=440:sample_rate=44100",
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


def test_build_ass_text_contains_subtitle():
    text = build_ass_text([SubtitleCue(start_sec=0, end_sec=2.5, text="Buy now")])

    assert "Dialogue:" in text
    assert "Buy now" in text


def test_postprocess_preserves_source_audio_when_no_bgm(tmp_path: Path):
    input_path = tmp_path / "input.mp4"
    output_path = tmp_path / "output.mp4"
    _generate_clip_with_audio(input_path)

    from agent_app.media.postprocess import run_postprocess

    run_postprocess(
        PostprocessRequest(
            input_path=str(input_path),
            output_path=str(output_path),
            ratio="9:16",
            subtitles=[SubtitleCue(start_sec=0, end_sec=1, text="Buy now")],
            enable_subtitle=True,
            enable_bgm=False,
        )
    )

    assert output_path.exists()
    assert _has_audio_stream(output_path)
