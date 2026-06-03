from fastapi import FastAPI

from agent_app.agents.analytics_agent import build_mock_analytics
from agent_app.agents.editing_agent import build_editing_plan
from agent_app.agents.material_agent import analyze_material, search_materials
from agent_app.agents.pipeline_graph import regenerate_shot, restitch_task, run_pipeline_graph
from agent_app.agents.reference_video_agent import analyze_reference_video
from agent_app.agents.retry_agent import decide_retry
from agent_app.config import settings
from agent_app.media.postprocess import run_postprocess
from agent_app.providers.ark_text import generate_script
from agent_app.providers.seedance_video import generate_clip
from agent_app.schemas import (
    AnalyticsRequest,
    AnalyticsResponse,
    ClipGenerateRequest,
    ClipGenerateResponse,
    EditingPlanRequest,
    EditingPlanResponse,
    HealthResponse,
    MaterialAnalyzeRequest,
    MaterialAnalyzeResponse,
    MaterialSearchRequest,
    MaterialSearchResponse,
    PipelineRunRequest,
    PipelineRunResponse,
    PostprocessRequest,
    PostprocessResponse,
    ReferenceVideoAnalysisResponse,
    ReferenceVideoAnalyzeRequest,
    RegenerateShotRequest,
    RestitchRequest,
    RetryDecisionRequest,
    RetryDecisionResponse,
    ScriptGenerateRequest,
    ScriptGenerateResponse,
)

app = FastAPI(title="TikTop P1 Agent Service")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(model_mode=settings.model_mode)


@app.post("/materials/analyze", response_model=MaterialAnalyzeResponse)
def material_analyze(req: MaterialAnalyzeRequest) -> MaterialAnalyzeResponse:
    return analyze_material(req)


@app.post("/materials/search", response_model=MaterialSearchResponse)
def material_search(req: MaterialSearchRequest) -> MaterialSearchResponse:
    return search_materials(req)


@app.post("/editing/plan", response_model=EditingPlanResponse)
def editing_plan(req: EditingPlanRequest) -> EditingPlanResponse:
    return build_editing_plan(req)


@app.post("/retry/decide", response_model=RetryDecisionResponse)
def retry_decide(req: RetryDecisionRequest) -> RetryDecisionResponse:
    return decide_retry(req)


@app.post("/analytics/mock", response_model=AnalyticsResponse)
def analytics_mock(req: AnalyticsRequest) -> AnalyticsResponse:
    return build_mock_analytics(req)


@app.post("/scripts/generate", response_model=ScriptGenerateResponse)
def script_generate(req: ScriptGenerateRequest) -> ScriptGenerateResponse:
    return generate_script(req)


@app.post("/references/analyze", response_model=ReferenceVideoAnalysisResponse)
def reference_analyze(req: ReferenceVideoAnalyzeRequest) -> ReferenceVideoAnalysisResponse:
    return analyze_reference_video(req)


@app.post("/video/clip", response_model=ClipGenerateResponse)
def video_clip(req: ClipGenerateRequest) -> ClipGenerateResponse:
    return generate_clip(req)


@app.post("/pipeline/run", response_model=PipelineRunResponse)
def pipeline_run(req: PipelineRunRequest) -> PipelineRunResponse:
    return run_pipeline_graph(req)


@app.post("/pipeline/regenerate-shot", response_model=PipelineRunResponse)
def pipeline_regenerate_shot(req: RegenerateShotRequest) -> PipelineRunResponse:
    return regenerate_shot(req)


@app.post("/pipeline/restitch", response_model=PipelineRunResponse)
def pipeline_restitch(req: RestitchRequest) -> PipelineRunResponse:
    return restitch_task(req)


@app.post("/media/postprocess", response_model=PostprocessResponse)
def media_postprocess(req: PostprocessRequest) -> PostprocessResponse:
    return run_postprocess(req)
