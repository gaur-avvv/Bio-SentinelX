from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Bio-SentinelX (Python Rewrite Scaffold)"
    environment: str = "development"
    debug: bool = True
    host: str = "127.0.0.1"
    port: int = 8080

    biosentinel_api_url: str = Field(default="http://localhost:8000", alias="BIOSENTINEL_API_URL")
    biosentinel_api_key: str = Field(default="", alias="BIOSENTINEL_API_KEY")

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    groq_api_key: str = Field(default="", alias="GROQ_API_KEY")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openweather_api_key: str = Field(default="", alias="OPENWEATHER_API_KEY")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
