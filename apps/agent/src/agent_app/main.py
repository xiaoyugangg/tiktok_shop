from fastapi import FastAPI

from agent_app.config import settings
from agent_app.schemas import HealthResponse

app = FastAPI(title="TikTop P1 Agent Service")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(model_mode=settings.model_mode)
