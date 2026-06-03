import json
import subprocess
from pathlib import Path

from pydantic import ValidationError

from agent_app.providers.ark_text import chat_json
from agent_app.providers.vision_caption import caption_material
from agent_app.schemas import ReferenceVideoAnalysisResponse, ReferenceVideoAnalyzeRequest, TraceItem


def _sample_keyframes(video_path: str, output_dir: Path, count: int = 4) -> list[Path]:
    path = Path(video_path)
    if not path.exists():
        return []

    output_dir.mkdir(parents=True, exist_ok=True)
    pattern = output_dir / "frame_%02d.jpg"
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(path),
        "-vf",
        f"fps=1/{count},scale=640:-1",
        "-frames:v",
        str(count),
        str(pattern),
    ]
    subprocess.run(command, check=True, capture_output=True)
    return sorted(output_dir.glob("frame_*.jpg"))[:count]


def _fallback_analysis(
    req: ReferenceVideoAnalyzeRequest,
    captions: list[str],
    trace: list[TraceItem],
    reason: str,
) -> ReferenceVideoAnalysisResponse:
    keywords = "、".join(req.keywords[:5]) or req.category or req.title
    return ReferenceVideoAnalysisResponse(
        reference_video_id=req.reference_video_id,
        summary=f"参考视频《{req.title}》围绕 {keywords} 展开，适合作为电商短视频创意参考。",
        hook_type="痛点开场",
        pain_point=f"目标用户对 {keywords} 的需求尚未被快速满足。",
        selling_points=req.keywords[:3] or [req.title],
        shot_structure=["痛点/场景引入", "产品或方案展示", "卖点强化", "行动召唤"],
        visual_style="真实电商短视频风格，画面重点突出商品和使用场景。",
        subtitle_style="短句高亮核心卖点，避免遮挡主体。",
        bgm_rhythm="前段制造关注，中段节奏增强，结尾配合 CTA 收束。",
        cta_pattern="结尾用清晰购买引导承接转化。",
        reusable_template="痛点场景 -> 商品出现 -> 卖点证明 -> 优惠/下单引导",
        keyframe_captions=captions,
        trace=[
            *trace,
            TraceItem(
                stage="reference.analysis.fallback",
                message="Used fallback reference analysis",
                payload={"reason": reason},
            ),
        ],
    )


def analyze_reference_video(req: ReferenceVideoAnalyzeRequest) -> ReferenceVideoAnalysisResponse:
    trace: list[TraceItem] = [
        TraceItem(
            stage="reference.analysis.start",
            message="Started reference video analysis",
            payload={"reference_video_id": req.reference_video_id, "title": req.title},
        )
    ]
    captions: list[str] = []

    try:
        if req.path:
            frame_dir = Path(req.path).parent / f"{Path(req.path).stem}_frames"
            frames = _sample_keyframes(req.path, frame_dir)
            trace.append(
                TraceItem(
                    stage="reference.keyframes.sample",
                    message="Sampled keyframes from reference video",
                    payload={"count": len(frames)},
                )
            )
            captions = [caption_material(str(frame), "image/jpeg", req.title) for frame in frames]
    except (OSError, subprocess.SubprocessError) as err:
        trace.append(
            TraceItem(
                stage="reference.keyframes.error",
                message="Failed to sample or caption keyframes",
                payload={"error": str(err)[:240]},
            )
        )

    if not captions and req.source_url:
        captions = [f"站外参考视频链接：{req.source_url}，需要基于标题和关键词进行创意拆解。"]

    system_prompt = (
        "你是电商短视频创意拆解 Agent。请基于参考视频标题、关键词、关键帧 caption 或站外链接说明，"
        "输出严格 JSON。字段必须包括 summary, hook_type, pain_point, selling_points, "
        "shot_structure, visual_style, subtitle_style, bgm_rhythm, cta_pattern, reusable_template。"
        "所有内容必须使用中文，聚焦 Hook 手法、卖点表达、分镜结构、画面风格和可复用模板。"
    )
    payload = {
        "title": req.title,
        "category": req.category,
        "keywords": req.keywords,
        "source_url": req.source_url,
        "keyframe_captions": captions,
        "output_schema": {
            "summary": "string",
            "hook_type": "string",
            "pain_point": "string",
            "selling_points": ["string"],
            "shot_structure": ["string"],
            "visual_style": "string",
            "subtitle_style": "string",
            "bgm_rhythm": "string",
            "cta_pattern": "string",
            "reusable_template": "string",
        },
    }

    try:
        result = chat_json(system_prompt, payload, "reference.analysis")
        trace.append(
            TraceItem(
                stage="reference.analysis.llm",
                message="Generated structured reference video analysis",
                payload={"caption_count": len(captions)},
            )
        )
        return ReferenceVideoAnalysisResponse(
            reference_video_id=req.reference_video_id,
            summary=str(result.get("summary") or ""),
            hook_type=str(result.get("hook_type") or ""),
            pain_point=str(result.get("pain_point") or ""),
            selling_points=[str(item) for item in result.get("selling_points", [])][:8],
            shot_structure=[str(item) for item in result.get("shot_structure", [])][:8],
            visual_style=str(result.get("visual_style") or ""),
            subtitle_style=str(result.get("subtitle_style") or ""),
            bgm_rhythm=str(result.get("bgm_rhythm") or ""),
            cta_pattern=str(result.get("cta_pattern") or ""),
            reusable_template=str(result.get("reusable_template") or ""),
            keyframe_captions=captions,
            trace=trace,
        )
    except (RuntimeError, KeyError, json.JSONDecodeError, ValidationError, ValueError) as err:
        return _fallback_analysis(req, captions, trace, str(err)[:240])
