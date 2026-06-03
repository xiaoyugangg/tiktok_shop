from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8790
    model_mode: str = "mock"
    storage_root: str = "../../storage"
    default_bgm_path: str | None = None

    ark_api_key: str | None = None
    ark_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    ark_text_model: str | None = None
    ark_text_timeout_sec: int = 180
    ark_video_model: str | None = None
    ark_vision_model: str | None = None
    ark_embedding_model: str | None = None
    ark_video_poll_interval_ms: int = 4000
    ark_video_poll_timeout_ms: int = 600_000
    qwen_embedding_api_key: str | None = None
    qwen_embedding_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_embedding_model: str | None = None
    material_rag_top_k: int = 3

    node_base_url: str = "http://127.0.0.1:8787"
    internal_callback_token: str = "dev-callback-token"


settings = Settings()
