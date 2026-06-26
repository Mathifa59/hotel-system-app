import uuid

from sqlalchemy import Boolean, Enum, Numeric, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import RoomStatus, RoomType


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    number: Mapped[str] = mapped_column(String(10), unique=True)
    floor: Mapped[int] = mapped_column(SmallInteger)
    type: Mapped[RoomType] = mapped_column(Enum(RoomType, name="room_type"))
    status: Mapped[RoomStatus] = mapped_column(
        Enum(RoomStatus, name="room_status"),
        default=RoomStatus.available,
        server_default=RoomStatus.available.value,
    )
    has_minibar: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class RoomTypeRate(Base):
    """Tarifa fija por noche de cada tipo de habitación — no por cuarto individual,
    ya que varios cuartos comparten el mismo tipo y deben cobrar lo mismo."""

    __tablename__ = "room_type_rates"

    type: Mapped[RoomType] = mapped_column(Enum(RoomType, name="room_type"), primary_key=True)
    price_pen: Mapped[float] = mapped_column(Numeric(8, 2))
    price_usd: Mapped[float] = mapped_column(Numeric(8, 2))
