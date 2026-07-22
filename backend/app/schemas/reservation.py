import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentMethod, RatePlan, ReservationSource, ReservationStatus, RoomType
from app.schemas.charge import ChargeOut


class ReservationCreate(BaseModel):
    room_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime
    check_out: datetime
    guests: int = Field(default=1, ge=1)
    rate_plan: RatePlan = RatePlan.professional


class ReservationUpdate(BaseModel):
    room_id: uuid.UUID | None = None
    guest_name: str | None = None
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime | None = None
    check_out: datetime | None = None
    guests: int | None = Field(default=None, ge=1)
    notes: str | None = None
    rate_plan: RatePlan | None = None


class PaymentInfo(BaseModel):
    method: PaymentMethod
    amount_pen: Decimal
    amount_usd: Decimal
    paid_at: datetime


class HistoricalReservationCreate(BaseModel):
    """Estadía que YA ocurrió, cargada después de los hechos (ej. un walk-in
    que no se alcanzó a registrar, o el histórico previo al sistema). No pasa
    por el flujo en vivo pendiente→activa→checked_out: entra directo como
    cerrada, con su cargo de alojamiento ya calculado. Ver
    create_historical_reservation."""

    room_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime
    check_out: datetime
    guests: int = Field(default=1, ge=1)
    rate_plan: RatePlan = RatePlan.professional
    # Opcional: si no se sabe cómo/cuánto pagó (histórico viejo), la estadía
    # igual queda registrada para ocupación e ingresos por tarifa.
    payment: PaymentInfo | None = None


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
    rate_plan: RatePlan
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
    rate_plan: RatePlan
    room_charge_pen: Decimal
    room_charge_usd: Decimal
    charges: list[ChargeOut]
    total_pen: Decimal
    total_usd: Decimal
