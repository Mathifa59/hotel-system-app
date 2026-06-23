from sqlalchemy.orm import Session

from app.models.notification import Notification


def create_notification(
    db: Session, *, audience: str, event: str, message: str, meta: dict | None = None
) -> Notification:
    notification = Notification(audience=audience, event=event, message=message, meta=meta)
    db.add(notification)
    return notification
