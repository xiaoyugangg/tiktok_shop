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
    path: str | None = None
    filename: str
    mime: str
    kind: str
    product_title: str | None = None
    selling_points: list[str] = Field(default_factory=list)


class MaterialAnalyzeResponse(BaseModel):
    material_id: str
    caption: str | None = None
    summary: str
    tags: list[str]
    embedding_text: str
    embedding_vector: list[float]
    embedding_model: str | None = None
    trace: list[TraceItem]


class RagCandidate(BaseModel):
    material_id: str
    kind: str
    caption: str | None = None
    summary: str
    tags: list[str] = Field(default_factory=list)
    score: float


class ShotRagContext(BaseModel):
    idx: int
    query: str
    candidates: list[RagCandidate] = Field(default_factory=list)


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
    caption: str | None = None
    summary: str
    tags: list[str] = Field(default_factory=list)
    embedding_text: str = ""
    embedding_vector: list[float] = Field(default_factory=list)
    embedding_model: str | None = None


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


class RetryDecisionRequest(BaseModel):
    task_id: str
    shot_id: str | None = None
    shot_idx: int | None = None
    error_message: str
    retry_count: int = 0
    prompt: str = ""
    duration_sec: int = 5


class RetryPatch(BaseModel):
    prompt: str | None = None
    duration_sec: int | None = None


class RetryDecisionResponse(BaseModel):
    should_retry: bool
    reason: str
    patch: RetryPatch = Field(default_factory=RetryPatch)
    trace: list[TraceItem]


class AnalyticsMetric(BaseModel):
    factor: str
    ctr: float
    cvr: float
    completion_rate: float


class AnalyticsRequest(BaseModel):
    product_title: str | None = None
    task_count: int = 8


class AnalyticsResponse(BaseModel):
    metrics: list[AnalyticsMetric]
    insights: list[str]
    trace: list[TraceItem]


class SubtitleCue(BaseModel):
    start_sec: float
    end_sec: float
    text: str


class PostprocessRequest(BaseModel):
    input_path: str
    output_path: str
    ratio: str
    subtitles: list[SubtitleCue] = Field(default_factory=list)
    bgm_path: str | None = None
    enable_subtitle: bool = True
    enable_bgm: bool = False


class PostprocessResponse(BaseModel):
    output_path: str
    subtitle_path: str | None = None
    trace: list[TraceItem]


class ScriptGenerateRequest(BaseModel):
    product: ProductInput
    ratio: str = "9:16"


class ScriptShotOutput(BaseModel):
    idx: int
    description: str
    camera_motion: str = ""
    subtitle: str = ""
    bgm_hint: str = ""
    duration_sec: int


class ScriptGenerateResponse(BaseModel):
    narrative: str
    visual_style: str
    ratio: str
    shots: list[ScriptShotOutput]
    constraints: list[str] = Field(default_factory=list)
    trace: list[TraceItem]


class ClipGenerateRequest(BaseModel):
    prompt: str
    ratio: str
    duration_sec: int
    image_path: str | None = None
    output_path: str


class ClipGenerateResponse(BaseModel):
    output_path: str
    trace: list[TraceItem]


class PipelineShotInput(BaseModel):
    id: str
    idx: int
    description: str
    camera_motion: str = ""
    duration_sec: float
    prompt: str | None = None
    subtitle: str | None = None
    bgm_hint: str | None = None
    source_material_id: str | None = None
    source_material_path: str | None = None
    retry_count: int = 0
    clip_path: str | None = None


class PipelineRunRequest(BaseModel):
    task_id: str
    ratio: str
    storage_root: str
    product_main_material_path: str | None = None
    shots: list[PipelineShotInput]
    enable_subtitle: bool = True
    enable_bgm: bool = False
    callback_base_url: str
    callback_token: str


class RegenerateShotRequest(BaseModel):
    task_id: str
    ratio: str
    storage_root: str
    shot: PipelineShotInput
    shots: list[PipelineShotInput]
    enable_subtitle: bool = True
    enable_bgm: bool = False
    callback_base_url: str
    callback_token: str


class RestitchRequest(BaseModel):
    task_id: str
    ratio: str
    storage_root: str
    shots: list[PipelineShotInput]
    enable_subtitle: bool = True
    enable_bgm: bool = False
    callback_base_url: str
    callback_token: str


class PipelineRunResponse(BaseModel):
    task_id: str
    status: str
    output_path: str | None = None
    error_message: str | None = None
    trace: list[TraceItem]


class CallbackTraceRequest(BaseModel):
    task_id: str
    shot_id: str | None = None
    stage: str
    level: str = "info"
    message: str
    payload: dict = Field(default_factory=dict)


class CallbackShotStatusRequest(BaseModel):
    shot_id: str
    status: str
    clip_path: str | None = None
    error_msg: str | None = None
    prompt: str | None = None
    duration_sec: float | None = None
    retry_count_increment: int = 0


class CallbackTaskStatusRequest(BaseModel):
    task_id: str
    status: str
    error_msg: str | None = None
    output_path: str | None = None
    stage: str | None = None
