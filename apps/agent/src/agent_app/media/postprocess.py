import subprocess
from pathlib import Path

from agent_app.schemas import PostprocessRequest, PostprocessResponse, SubtitleCue, TraceItem


def _ass_time(seconds: float) -> str:
    cs = int(round(seconds * 100))
    h = cs // 360000
    m = (cs // 6000) % 60
    s = (cs // 100) % 60
    c = cs % 100
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def _ass_escape(text: str) -> str:
    return text.replace("\n", " ").replace("{", "").replace("}", "")


def build_ass_text(cues: list[SubtitleCue]) -> str:
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 720",
        "PlayResY: 1280",
        "",
        "[V4+ Styles]",
        (
            "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, "
            "Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, "
            "MarginV, Encoding"
        ),
        "Style: Default,Arial,46,&H00FFFFFF,&H00000000,&H66000000,1,0,1,3,1,2,40,40,120,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for cue in cues:
        lines.append(
            "Dialogue: "
            f"0,{_ass_time(cue.start_sec)},{_ass_time(cue.end_sec)},"
            f"Default,,0,0,0,,{_ass_escape(cue.text)}"
        )
    return "\n".join(lines) + "\n"


def _subtitle_filter_path(path: Path) -> str:
    return str(path).replace("\\", "/").replace(":", "\\:")


def run_postprocess(req: PostprocessRequest) -> PostprocessResponse:
    output = Path(req.output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    trace = [TraceItem(stage="media.postprocess.start", message="Started video postprocess")]
    subtitle_path: str | None = None
    vf_args: list[str] = []

    if req.enable_subtitle and req.subtitles:
        subtitle_file = output.with_suffix(".ass")
        subtitle_file.write_text(build_ass_text(req.subtitles), encoding="utf-8")
        subtitle_path = str(subtitle_file)
        vf_args = ["-vf", f"ass='{_subtitle_filter_path(subtitle_file)}'"]
        trace.append(
            TraceItem(
                stage="media.subtitle",
                message="Generated ASS subtitles",
                payload={"path": subtitle_path},
            )
        )

    args = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", req.input_path]
    if req.enable_bgm and req.bgm_path:
        args.extend(["-stream_loop", "-1", "-i", req.bgm_path])
        args.extend(vf_args)
        args.extend(["-shortest", "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-c:a", "aac"])
        trace.append(TraceItem(stage="media.bgm", message="Mixed BGM audio"))
    else:
        args.extend(vf_args)
        args.extend(["-c:v", "libx264", "-an"])

    args.extend(["-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)])
    subprocess.run(args, check=True)
    trace.append(
        TraceItem(
            stage="media.postprocess.done",
            message="Postprocess complete",
            payload={"output": str(output)},
        )
    )
    return PostprocessResponse(output_path=str(output), subtitle_path=subtitle_path, trace=trace)
