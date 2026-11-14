from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    
    # Optional, so the app can still start without AI/map API keys.
    gemini_api_key: str | None = None
    kakao_rest_api_key: str | None = None
    baze_api_key: str | None = None


settings = Settings()