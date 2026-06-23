import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import CleaningRequestStatus, CleaningRequestType


class CleaningRequestCreate(BaseModel):
    room_id: uuid.UUID
    request_type: CleaningRequestType
    reservation_id: uuid.UUID | None = None
    notes: str | None = None


class CleaningRequestSkip(BaseModel):
    notes: str | None = None


class CleaningRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    reservation_id: uuid.UUID | None
    request_type: CleaningRequestType
    status: CleaningRequestStatus
    assigned_to: uuid.UUID | None
    requested_by: uuid.UUID
    notes: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
