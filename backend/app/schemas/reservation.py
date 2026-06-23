import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import ReservationSource, ReservationStatus


class ReservationCreate(BaseModel):
    room_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime
    check_out: datetime


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    guest_name: str
    guest_phone: str | None
    guest_email: str | None
    guest_id_document: str | None
    notes: str | None
    check_in: datetime
    check_out: datetime
    status: ReservationStatus
    source: ReservationSource
    confirmed: bool
    created_by: uuid.UUID | None
    created_at: datetime
