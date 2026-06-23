import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.deps import require_role
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.activity_log import log_activity

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    return db.query(User).order_by(User.name).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un usuario con ese correo")

    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
    )
    db.add(user)
    db.flush()
    log_activity(
        db, user_id=current_user.id, action="user.created", entity="users", entity_id=user.id, meta={"role": data.role.value}
    )
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if user.id == current_user.id and data.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No puedes desactivar tu propia cuenta")

    payload = data.model_dump(exclude_unset=True, mode="json")
    password = payload.pop("password", None)

    for field, value in payload.items():
        setattr(user, field, value)
    if password:
        user.password_hash = hash_password(password)

    # nunca se guarda la contraseña en claro en el log, solo que ocurrió un reset
    log_meta = {**payload, "password_reset": True} if password else (payload or None)
    log_activity(db, user_id=current_user.id, action="user.updated", entity="users", entity_id=user.id, meta=log_meta)
    db.commit()
    db.refresh(user)
    return user
