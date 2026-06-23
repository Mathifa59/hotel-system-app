import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ReservationStatus, RoomType


class RoomTypeAvailability(BaseModel):
    type: RoomType
    available: bool


class AvailabilityOut(BaseModel):
    check_in: datetime
    check_out: datetime
    room_types: list[RoomTypeAvailability]


class BookingRequestCreate(BaseModel):
    guest_name: str
    guest_email: str
    guest_phone: str | None = None
    check_in: datetime
    check_out: datetime
    guests: int = Field(ge=1)
    room_type: RoomType
    notes: str | None = None


class BookingRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    guest_name: str
    check_in: datetime
    check_out: datetime
    status: ReservationStatus
