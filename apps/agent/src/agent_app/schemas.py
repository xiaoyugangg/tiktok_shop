from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "tiktop-agent"
    model_mode: str


class TraceItem(BaseModel):
    stage: str
    message: str
    payload: dict = Field(default_factory=dict)


class MaterialAnalyzeRequest(BaseModel):
    material_id: str
    filename: str
    mime: str
    kind: str
    product_title: str | None = None
    selling_points: list[str] = Field(default_factory=list)


class MaterialAnalyzeResponse(BaseModel):
    material_id: str
    summary: str
    tags: list[str]
    embedding_text: str
    embedding_vector: list[float]
    trace: list[TraceItem]


class MaterialSearchRequest(BaseModel):
    query: str
    materials: list[MaterialAnalyzeResponse]
    limit: int = 5


class MaterialSearchResult(BaseModel):
    material_id: str
    score: float
    reason: str


class MaterialSearchResponse(BaseModel):
    results: list[MaterialSearchResult]
    trace: list[TraceItem]


class ShotInput(BaseModel):
    idx: int
    description: str
    camera_motion: str = ""
    subtitle: str = ""
    bgm_hint: str = ""
    duration_sec: int


class ScriptInput(BaseModel):
    narrative: str
    visual_style: str
    ratio: str
    shots: list[ShotInput]


class ProductInput(BaseModel):
    id: str | None = None
    title: str
    selling_points: list[str] = Field(default_factory=list)
    target_audience: str | None = None
    scene: str | None = None


class MaterialSummary(BaseModel):
    material_id: str
    kind: str
    summary: str
    tags: list[str] = Field(default_factory=list)
    embedding_text: str = ""
    embedding_vector: list[float] = Field(default_factory=list)


class EditingPlanRequest(BaseModel):
    product: ProductInput
    script: ScriptInput
    materials: list[MaterialSummary] = Field(default_factory=list)


class PlannedShot(BaseModel):
    idx: int
    prompt: str
    subtitle: str
    bgm_hint: str
    duration_sec: int
    source_material_id: str | None = None
    reason: str


class EditingPlanResponse(BaseModel):
    shots: list[PlannedShot]
    strategy: str
    trace: list[TraceItem]
