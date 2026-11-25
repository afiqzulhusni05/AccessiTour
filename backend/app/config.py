from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440
    
    # Optional, so the app can still start without AI/map API keys.
    gemini_api_key: str | None = None
    kakao_rest_api_key: str | None = None
    baze_api_key: str | None = None

    # data.go.kr key (Decoding version), used for emergency hospitals.
    # Without it, the emergency endpoint answers 503; everything else still works.
    data_go_kr_key: str | None = None

    # "Forgot password" emails. Without SMTP settings the reset link is only written to the
    # server log (fine on a laptop); set them on Render so real emails go out.
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    mail_from: str | None = None  # defaults to smtp_user
    # Where the website is, for the link in the email
    frontend_url: str = "http://localhost:5173"


settings = Settings()