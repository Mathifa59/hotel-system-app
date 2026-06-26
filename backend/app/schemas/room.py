import uuid

from pydantic import BaseModel, ConfigDict

from app.models.enums import RoomStatus, RoomType


class RoomCreate(BaseModel):
    number: str
    floor: int
    type: RoomType
    has_minibar: bool = False
    notes: str | None = None


class RoomStatusUpdate(BaseModel):
    status: RoomStatus


class RoomUpdate(BaseModel):
    number: str | None = None
    floor: int | None = None
    type: RoomType | None = None
    has_minibar: bool | None = None
    notes: str | None = None


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: str
    floor: int
    type: RoomType
    status: RoomStatus
    has_minibar: bool
    notes: str | None


class RoomTypeRateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: RoomType
    price_pen: float
    price_usd: float


class RoomTypeRateUpdate(BaseModel):
    price_pen: float
    price_usd: float
