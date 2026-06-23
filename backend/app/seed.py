from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.user import User


def seed_admin() -> None:
    db = SessionLocal()
    try:
        exists = db.query(User).filter(User.email == settings.admin_email).first()
        if exists:
            print(f"Admin ya existe: {settings.admin_email}")
            return

        admin = User(
            name=settings.admin_name,
            email=settings.admin_email,
            password_hash=hash_password(settings.admin_password),
            role=UserRole.admin,
        )
        db.add(admin)
        db.commit()
        print(f"Admin creado: {settings.admin_email}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_admin()
