from fastapi import FastAPI

from agent_app.agents.analytics_agent import build_mock_analytics
from agent_app.agents.editing_agent import build_editing_plan
from agent_app.agents.material_agent import analyze_material, search_materials
from agent_app.agents.retry_agent import decide_retry
from agent_app.config import settings
from agent_app.media.postprocess import run_postprocess
from agent_app.schemas import (
    AnalyticsRequest,
    AnalyticsResponse,
    EditingPlanRequest,
    EditingPlanResponse,
    HealthResponse,
    MaterialAnalyzeRequest,
    MaterialAnalyzeResponse,
    MaterialSearchRequest,
    MaterialSearchResponse,
    PostprocessRequest,
    PostprocessResponse,
    RetryDecisionRequest,
    RetryDecisionResponse,
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


@app.post("/media/postprocess", response_model=PostprocessResponse)
def media_postprocess(req: PostprocessRequest) -> PostprocessResponse:
    return run_postprocess(req)
