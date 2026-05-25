from fastapi import FastAPI

from agent_app.agents.material_agent import analyze_material, search_materials
from agent_app.config import settings
from agent_app.schemas import (
    HealthResponse,
    MaterialAnalyzeRequest,
    MaterialAnalyzeResponse,
    MaterialSearchRequest,
    MaterialSearchResponse,
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
