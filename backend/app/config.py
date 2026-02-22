from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_client_id: str = Field(alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(alias="GOOGLE_CLIENT_SECRET")
    google_redirect_uri: str = Field(alias="GOOGLE_REDIRECT_URI")
    frontend_url: str = Field(default="http://localhost:5173", alias="FRONTEND_URL")
    app_base_url: str = Field(default="http://localhost:8000", alias="APP_BASE_URL")
    groq_api_key: str = Field(alias="GROQ_API_KEY")
    groq_model: str = Field(default="llama-3.1-8b-instant", alias="GROQ_MODEL")

    model_config = {
        "env_file": ".env",
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
