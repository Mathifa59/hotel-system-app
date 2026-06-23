import uuid

from sqlalchemy.orm import Session

from app.models.activity_log import ActivityLog


def log_activity(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    action: str,
    entity: str,
    entity_id: uuid.UUID | None = None,
    meta: dict | None = None,
) -> None:
    db.add(ActivityLog(user_id=user_id, action=action, entity=entity, entity_id=entity_id, meta=meta))
