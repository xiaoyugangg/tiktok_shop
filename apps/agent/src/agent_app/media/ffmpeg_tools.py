import random
import subprocess
from pathlib import Path


RATIO_RESOLUTION = {
    "9:16": (720, 1280),
    "16:9": (1280, 720),
}


def _run_ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


def _ffprobe_value(args: list[str]) -> str:
    result = subprocess.run(
        ["ffprobe", "-v", "error", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _has_audio_stream(path: str) -> bool:
    return bool(
        _ffprobe_value(
            [
                "-select_streams",
                "a",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "csv=p=0",
                path,
            ]
        )
    )


def _duration_seconds(path: str) -> float:
    raw = _ffprobe_value(["-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])
    try:
        return max(0.1, float(raw))
    except ValueError:
        return 1.0


def _drawtext_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace(",", "\\,")
        .replace("%", "\\%")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("\n", " ")
    )


def generate_mock_clip(out_path: str, ratio: str, duration_sec: float, label: str) -> None:
    width, height = RATIO_RESOLUTION.get(ratio, RATIO_RESOLUTION["9:16"])
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    color = random.choice(["0x2e6df5", "0xff2c55", "0xff7a45", "0x52c41a", "0x722ed1", "0x13c2c2"])
    safe_label = _drawtext_escape(label[:36])
    font_size = round(min(width, height) / 18)
    filter_text = (
        f"drawtext=text='{safe_label}':fontcolor=white:fontsize={font_size}:"
        "x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=10"
    )
    _run_ffmpeg(
        [
            "-f",
            "lavfi",
            "-t",
            f"{duration_sec:.2f}",
            "-i",
            f"color=c={color}:s={width}x{height}:r=24",
            "-vf",
            filter_text,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )


def concat_clips(clip_paths: list[str], out_path: str, ratio: str) -> None:
    if not clip_paths:
        raise ValueError("clip_paths cannot be empty")
    width, height = RATIO_RESOLUTION.get(ratio, RATIO_RESOLUTION["9:16"])
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    inputs: list[str] = []
    for clip in clip_paths:
        inputs.extend(["-i", clip])
    filter_parts: list[str] = []
    for i, clip in enumerate(clip_paths):
        filter_parts.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=24[v{i}]"
        )
        if _has_audio_stream(clip):
            filter_parts.append(
                f"[{i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a{i}]"
            )
        else:
            duration = _duration_seconds(clip)
            filter_parts.append(
                "anullsrc=channel_layout=stereo:sample_rate=44100,"
                f"atrim=duration={duration:.3f},asetpts=PTS-STARTPTS[a{i}]"
            )
    concat_inputs = "".join(f"[v{i}][a{i}]" for i, _ in enumerate(clip_paths))
    filter_graph = (
        f"{';'.join(filter_parts)};"
        f"{concat_inputs}concat=n={len(clip_paths)}:v=1:a=1[outv][outa]"
    )
    _run_ffmpeg(
        [
            *inputs,
            "-filter_complex",
            filter_graph,
            "-map",
            "[outv]",
            "-map",
            "[outa]",
            "-c:v",
            "libx264",
            "-c:a",
            "aac",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "veryfast",
            "-movflags",
            "+faststart",
            out_path,
        ]
    )
