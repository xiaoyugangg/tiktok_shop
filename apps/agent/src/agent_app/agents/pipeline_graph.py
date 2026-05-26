from pathlib import Path
from typing import TypedDict

from langgraph.graph import END, StateGraph

from agent_app.agents.retry_agent import decide_retry
from agent_app.callbacks import CallbackClient
from agent_app.media.ffmpeg_tools import concat_clips
from agent_app.media.postprocess import run_postprocess
from agent_app.providers.seedance_video import generate_clip
from agent_app.schemas import (
    ClipGenerateRequest,
    PipelineRunRequest,
    PipelineRunResponse,
    PipelineShotInput,
    PostprocessRequest,
    RetryDecisionRequest,
    SubtitleCue,
    TraceItem,
)


class PipelineState(TypedDict):
    req: PipelineRunRequest
    callback: object
    clips: list[str]
    output_rel: str | None
    error: str | None
    trace: list[TraceItem]


def _rel(storage_root: str, abs_path: str) -> str:
    return str(Path(abs_path).resolve().relative_to(Path(storage_root).resolve())).replace("\\", "/")


def _shot_image_path(req: PipelineRunRequest, shot: PipelineShotInput) -> str | None:
    return shot.source_material_path or (req.product_main_material_path if shot.idx == 0 else None)


def start_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    cb = state["callback"]
    cb.task_status(task_id=req.task_id, status="shots_running", stage="Python pipeline generating shots")
    cb.trace(task_id=req.task_id, stage="pipeline.start", message="Python LangGraph pipeline started")
    state["trace"].append(TraceItem(stage="pipeline.start", message="Started Python pipeline"))
    return state


def generate_shots_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    cb = state["callback"]
    clips: list[str] = []
    shots_dir = Path(req.storage_root) / "tasks" / req.task_id / "shots"
    shots_dir.mkdir(parents=True, exist_ok=True)

    for shot in req.shots:
        clip_abs = shots_dir / f"shot_{shot.idx}.mp4"
        prompt = shot.prompt or shot.description
        cb.trace(
            task_id=req.task_id,
            shot_id=shot.id,
            stage="shot.generate.start",
            message=f"Generating shot {shot.idx + 1} in Python pipeline",
            payload={"prompt": prompt},
        )
        try:
            generate_clip(
                ClipGenerateRequest(
                    prompt=prompt,
                    ratio=req.ratio,
                    duration_sec=int(shot.duration_sec),
                    image_path=_shot_image_path(req, shot),
                    output_path=str(clip_abs),
                )
            )
            clip_rel = _rel(req.storage_root, str(clip_abs))
            cb.shot_status(shot_id=shot.id, status="video_ok", clip_path=clip_rel)
            cb.trace(
                task_id=req.task_id,
                shot_id=shot.id,
                stage="shot.generate.success",
                message=f"Shot {shot.idx + 1} generated",
                payload={"clip_path": clip_rel},
            )
            clips.append(str(clip_abs))
        except Exception as err:
            msg = str(err)
            cb.trace(
                task_id=req.task_id,
                shot_id=shot.id,
                stage="shot.generate.failed",
                level="error",
                message=msg,
            )
            decision = decide_retry(
                RetryDecisionRequest(
                    task_id=req.task_id,
                    shot_id=shot.id,
                    shot_idx=shot.idx,
                    error_message=msg,
                    retry_count=shot.retry_count,
                    prompt=prompt,
                    duration_sec=int(shot.duration_sec),
                )
            )
            cb.trace(
                task_id=req.task_id,
                shot_id=shot.id,
                stage="agent.retry.decision",
                message=decision.reason,
                payload=decision.model_dump(),
            )
            if not decision.should_retry:
                cb.shot_status(shot_id=shot.id, status="failed", error_msg=msg)
                raise

            patched_prompt = decision.patch.prompt or prompt
            patched_duration = decision.patch.duration_sec or shot.duration_sec
            generate_clip(
                ClipGenerateRequest(
                    prompt=patched_prompt,
                    ratio=req.ratio,
                    duration_sec=int(patched_duration),
                    image_path=_shot_image_path(req, shot),
                    output_path=str(clip_abs),
                )
            )
            clip_rel = _rel(req.storage_root, str(clip_abs))
            cb.shot_status(
                shot_id=shot.id,
                status="video_ok",
                clip_path=clip_rel,
                prompt=patched_prompt,
                duration_sec=patched_duration,
                retry_count_increment=1,
            )
            clips.append(str(clip_abs))

    state["clips"] = clips
    return state


def stitch_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    cb = state["callback"]
    cb.task_status(task_id=req.task_id, status="stitching", stage="Python pipeline stitching video")
    out_abs = Path(req.storage_root) / "tasks" / req.task_id / "output.mp4"
    concat_clips(state["clips"], str(out_abs), req.ratio)
    state["output_rel"] = _rel(req.storage_root, str(out_abs))
    cb.trace(task_id=req.task_id, stage="pipeline.stitch.done", message="Stitched clips in Python")
    return state


def postprocess_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    if not req.enable_subtitle and not req.enable_bgm:
        return state

    out_abs = Path(req.storage_root) / "tasks" / req.task_id / "output.mp4"
    post_abs = Path(req.storage_root) / "tasks" / req.task_id / "output_p1.mp4"
    cursor = 0.0
    cues: list[SubtitleCue] = []
    for shot in req.shots:
        start = cursor
        cursor += float(shot.duration_sec)
        cues.append(SubtitleCue(start_sec=start, end_sec=cursor, text=shot.subtitle or shot.description[:24]))

    run_postprocess(
        PostprocessRequest(
            input_path=str(out_abs),
            output_path=str(post_abs),
            ratio=req.ratio,
            subtitles=cues,
            enable_subtitle=req.enable_subtitle,
            enable_bgm=req.enable_bgm,
        )
    )
    state["output_rel"] = _rel(req.storage_root, str(post_abs))
    state["callback"].trace(task_id=req.task_id, stage="media.postprocess.done", message="Python postprocess complete")
    return state


def finish_node(state: PipelineState) -> PipelineState:
    req = state["req"]
    state["callback"].task_status(
        task_id=req.task_id,
        status="succeeded",
        output_path=state["output_rel"],
        stage="Completed",
    )
    state["trace"].append(TraceItem(stage="pipeline.done", message="Python pipeline completed"))
    return state


def build_pipeline_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("start", start_node)
    graph.add_node("generate_shots", generate_shots_node)
    graph.add_node("stitch", stitch_node)
    graph.add_node("postprocess", postprocess_node)
    graph.add_node("finish", finish_node)
    graph.set_entry_point("start")
    graph.add_edge("start", "generate_shots")
    graph.add_edge("generate_shots", "stitch")
    graph.add_edge("stitch", "postprocess")
    graph.add_edge("postprocess", "finish")
    graph.add_edge("finish", END)
    return graph.compile()


def run_pipeline_graph(req: PipelineRunRequest, callback: object | None = None) -> PipelineRunResponse:
    cb = callback or CallbackClient(req.callback_base_url, req.callback_token)
    try:
        final = build_pipeline_graph().invoke(
            {"req": req, "callback": cb, "clips": [], "output_rel": None, "error": None, "trace": []}
        )
        return PipelineRunResponse(
            task_id=req.task_id,
            status="succeeded",
            output_path=final["output_rel"],
            trace=final["trace"],
        )
    except Exception as err:
        msg = str(err)
        cb.task_status(task_id=req.task_id, status="failed", error_msg=msg, stage="Failed")
        cb.trace(task_id=req.task_id, stage="pipeline.failed", level="error", message=msg)
        return PipelineRunResponse(task_id=req.task_id, status="failed", error_message=msg, trace=[])
