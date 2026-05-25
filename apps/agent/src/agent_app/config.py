from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8790
    model_mode: str = "mock"
    storage_root: str = "./storage"
    default_bgm_path: str | None = None


settings = Settings()
