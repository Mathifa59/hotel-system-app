import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Numeric, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.database import Base
from app.models.enums import PaymentMethod, ReservationSource, ReservationStatus, RoomType


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    # Nulo cuando la reserva queda en lista de espera (el sitio web permite
    # solicitar un tipo sin cuartos libres para esas fechas en vez de
    # rechazarla de plano) — recepción asigna el cuarto real después, cuando
    # haya uno disponible, editando la reserva.
    room_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=True)
    # Tipo que pidió el huésped — la única forma de saber qué quería mientras
    # no tenga cuarto asignado (sin esto, una reserva en lista de espera no
    # sabría si era Individual o Doble).
    requested_room_type: Mapped[RoomType | None] = mapped_column(
        Enum(RoomType, name="room_type"), nullable=True
    )
    guest_name: Mapped[str] = mapped_column(String(150))
    guest_phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    guest_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    guest_id_document: Mapped[str | None] = mapped_column(String(50), nullable=True)
    check_in: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    check_out: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    guests: Mapped[int] = mapped_column(SmallInteger, default=1, server_default=text("1"))
    status: Mapped[ReservationStatus] = mapped_column(
        Enum(ReservationStatus, name="reservation_status"),
        default=ReservationStatus.pending,
        server_default=ReservationStatus.pending.value,
    )
    source: Mapped[ReservationSource] = mapped_column(
        Enum(ReservationSource, name="reservation_source"),
        default=ReservationSource.staff,
        server_default=ReservationSource.staff.value,
    )
    confirmed: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Pago registrado por recepción al hacer check-out (un solo pago total —
    # el hotel cobra todo en persona al final de la estadía, no hay pagos
    # parciales ni pasarela). Todo nulo hasta que se registre.
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        Enum(PaymentMethod, name="payment_method"), nullable=True
    )
    payment_amount_pen: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    payment_amount_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
