import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import ReservationStatus, RoomType


class RoomTypeAvailability(BaseModel):
    type: RoomType
    available: bool
    price_pen: float
    price_usd: float


class AvailabilityOut(BaseModel):
    check_in: datetime
    check_out: datetime
    room_types: list[RoomTypeAvailability]


class BookingRequestCreate(BaseModel):
    guest_name: str
    guest_email: EmailStr
    guest_phone: str | None = None
    check_in: datetime
    check_out: datetime
    guests: int = Field(ge=1)
    room_type: RoomType
    notes: str | None = None
    # Honeypot anti-bot: campo oculto en el formulario que un humano nunca ve
    # ni llena. Si llega con contenido, es un bot llenando todo a ciegas.
    company: str | None = None


class BookingRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    guest_name: str
    check_in: datetime
    check_out: datetime
    status: ReservationStatus
