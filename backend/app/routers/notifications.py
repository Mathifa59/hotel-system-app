import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user
from app.models.notification import Notification, NotificationRead
from app.models.user import User
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Notification, NotificationRead)
        .outerjoin(
            NotificationRead,
            (NotificationRead.notification_id == Notification.id)
            & (NotificationRead.user_id == current_user.id),
        )
        .filter(Notification.audience.in_([current_user.role.value, "all"]))
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        NotificationOut(
            id=n.id, event=n.event, message=n.message, meta=n.meta, created_at=n.created_at, read=read is not None
        )
        for n, read in rows
    ]


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = db.get(Notification, notification_id)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificación no encontrada")

    exists = (
        db.query(NotificationRead)
        .filter(NotificationRead.notification_id == notification_id, NotificationRead.user_id == current_user.id)
        .first()
    )
    if exists is None:
        db.add(NotificationRead(notification_id=notification_id, user_id=current_user.id))
        db.commit()


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    already_read = (
        db.query(NotificationRead.notification_id)
        .filter(NotificationRead.user_id == current_user.id)
        .subquery()
    )
    unread_ids = (
        db.query(Notification.id)
        .filter(
            Notification.audience.in_([current_user.role.value, "all"]),
            Notification.id.notin_(already_read.select()),
        )
        .all()
    )
    for (notification_id,) in unread_ids:
        db.add(NotificationRead(notification_id=notification_id, user_id=current_user.id))
    db.commit()
