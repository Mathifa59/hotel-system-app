from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str

    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 720

    admin_name: str = "Admin"
    admin_email: str
    admin_password: str

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
