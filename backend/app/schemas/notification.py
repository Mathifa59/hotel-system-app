import uuid
from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    id: uuid.UUID
    event: str
    message: str
    meta: dict | None
    created_at: datetime
    read: bool
