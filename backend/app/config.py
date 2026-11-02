from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440

    # Optional, so the app (and alembic on Render) still starts without them.
    # Without a key, AI itinerary generation answers 503 instead of crashing everything.
    gemini_api_key: str | None = None
    kakao_rest_api_key: str | None = None


settings = Settings()