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

    # Mismas variables que ya usa el sitio público (repo apu-garden-lodge-web)
    # para el Libro de Reclamaciones — acá se reusan para avisar por correo
    # cuando llega una solicitud de disponibilidad desde la web, además de la
    # notificación interna que ya existía (ver app/services/email.py).
    # Opcionales: sin ellas el envío simplemente se salta, no rompe nada.
    resend_api_key: str | None = None
    complaints_email_to: str | None = None

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
