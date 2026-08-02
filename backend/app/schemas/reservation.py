import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentMethod, RatePlan, ReservationSource, ReservationStatus, RoomType
from app.schemas.charge import ChargeOut


class PaymentInfo(BaseModel):
    method: PaymentMethod
    amount_pen: Decimal
    amount_usd: Decimal
    paid_at: datetime


class ReservationCreate(BaseModel):
    room_id: uuid.UUID
    guest_name: str
    guest_phone: str | None = None
    guest_id_document: str | None = None
    check_in: datetime
    check_out: datetime
    guests: int = Field(default=1, ge=1)
    rate_plan: RatePlan = RatePlan.professional
    # Precio por noche fijado a mano para esta reserva — si se envían los
    # dos (PEN y USD), gana sobre la tarifa del tipo de cuarto. Evita tener
    # que cambiar la tarifa general solo para dar un precio distinto a una
    # reserva puntual.
    custom_rate_pen: Decimal | None = None
    custom_rate_usd: Decimal | None = None
    # Adelanto que el huésped paga al momento de reservar — opcional, no
    # toda reserva se hace con adelanto. Distinto del pago final que se
    # registra en el check-out (PaymentInfo, campo `payment` de ese endpoint).
    deposit: PaymentInfo | None = None


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
    custom_rate_pen: Decimal | None = None
    custom_rate_usd: Decimal | None = None
    # Ausente = no tocar el adelanto. Un objeto = registrarlo/corregirlo.
    # `null` explícito = borrarlo (el huésped nunca pagó, o se registró mal).
    deposit: PaymentInfo | None = None


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
    custom_rate_pen: Decimal | None = None
    custom_rate_usd: Decimal | None = None
    # Opcional: si no se sabe cómo/cuánto pagó (histórico viejo), la estadía
    # igual queda registrada para ocupación e ingresos por tarifa.
    payment: PaymentInfo | None = None
    # Adelanto que se pagó al reservar, antes de que la estadía ocurriera —
    # distinto de `payment` (el pago final, al irse). Antes de esto una
    # estadía pasada solo podía registrar el pago final, nunca un adelanto.
    deposit: PaymentInfo | None = None


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
    custom_rate_pen: Decimal | None
    custom_rate_usd: Decimal | None
    status: ReservationStatus
    source: ReservationSource
    confirmed: bool
    created_by: uuid.UUID | None
    created_at: datetime
    payment_method: PaymentMethod | None
    payment_amount_pen: Decimal | None
    payment_amount_usd: Decimal | None
    paid_at: datetime | None
    voucher_number: int | None
    deposit_amount_pen: Decimal | None
    deposit_amount_usd: Decimal | None
    deposit_method: PaymentMethod | None
    deposit_paid_at: datetime | None


class ReservationFolio(BaseModel):
    nights: int
    rate_plan: RatePlan
    room_charge_pen: Decimal
    room_charge_usd: Decimal
    charges: list[ChargeOut]
    total_pen: Decimal
    total_usd: Decimal


class VoucherOut(BaseModel):
    """Constancia de reserva — no es comprobante de pago. Trae todo ya
    resuelto (número formateado, etiquetas, saldo) para que el frontend solo
    imprima, sin repetir ninguna cuenta que ya hizo el backend."""

    voucher_number: str  # "RES-0001"
    issued_at: datetime

    guest_name: str
    guest_id_document: str | None

    room_number: str | None  # None cuando la reserva sigue en lista de espera
    room_type: RoomType
    check_in: datetime
    check_out: datetime
    nights: int
    guests: int

    rate_plan: RatePlan
    price_per_night_pen: Decimal
    price_per_night_usd: Decimal
    subtotal_pen: Decimal
    subtotal_usd: Decimal

    deposit_amount_pen: Decimal | None
    deposit_amount_usd: Decimal | None
    deposit_method: PaymentMethod | None
    deposit_paid_at: datetime | None

    balance_due_pen: Decimal
    balance_due_usd: Decimal
