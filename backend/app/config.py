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
    # Which Gemini model writes itineraries. The fallback (optional) is tried when the main
    # one is busy. Both can be changed in Render's Environment tab without changing code.
    gemini_model: str = "gemini-3.8-flash"
    gemini_fallback_model: str | None = None
    # Optional backup, tried when Gemini is busy: any OpenAI-compatible API.
    # Needs a key and a model. For the Korea University API Gateway, also set the
    # base URL (https://api.baze.co/v1/gateway); leave it empty for OpenAI itself.
    openai_api_key: str | None = None
    openai_model: str | None = None
    openai_base_url: str | None = None


settings = Settings()