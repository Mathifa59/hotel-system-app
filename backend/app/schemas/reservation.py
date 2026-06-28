import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentMethod, ReservationSource, ReservationStatus, RoomType
from app.schemas.charge import ChargeOut


class ReservationCreate(BaseModel):
    room_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime
    check_out: datetime
    guests: int = Field(default=1, ge=1)


class ReservationUpdate(BaseModel):
    room_id: uuid.UUID | None = None
    guest_name: str | None = None
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime | None = None
    check_out: datetime | None = None
    guests: int | None = Field(default=None, ge=1)
    notes: str | None = None


class PaymentInfo(BaseModel):
    method: PaymentMethod
    amount_pen: Decimal
    amount_usd: Decimal
    paid_at: datetime


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID | None
    requested_room_type: RoomType | None
    guest_name: str
    guest_phone: str | None
    guest_email: str | None
    guest_id_document: str | None
    notes: str | None
    check_in: datetime
    check_out: datetime
    guests: int
    status: ReservationStatus
    source: ReservationSource
    confirmed: bool
    created_by: uuid.UUID | None
    created_at: datetime
    payment_method: PaymentMethod | None
    payment_amount_pen: Decimal | None
    payment_amount_usd: Decimal | None
    paid_at: datetime | None


class ReservationFolio(BaseModel):
    nights: int
    room_charge_pen: Decimal
    room_charge_usd: Decimal
    charges: list[ChargeOut]
    total_pen: Decimal
    total_usd: Decimal
