"""Application settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables."""

    model_config = SettingsConfigDict(env_prefix="ATHANOR_", env_file=".env", extra="ignore")

    app_name: str = "AthanorIDE API"
    api_version: str = "0.1.0"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Compiler / sandbox
    compiler_provider: str = "mock"
    compiler_max_attempts: int = 3
    sandbox_image: str = "docker.io/library/python:3.12-slim"
    sandbox_timeout_seconds: int = 10
    sandbox_memory: str = "128m"
    sandbox_cpus: str = "0.5"
    sandbox_pids_limit: int = 64


settings = Settings()
