from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "tiktop-agent"
    model_mode: str


class TraceItem(BaseModel):
    stage: str
    message: str
    payload: dict = Field(default_factory=dict)
