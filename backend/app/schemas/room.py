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


class RoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    number: str
    floor: int
    type: RoomType
    status: RoomStatus
    has_minibar: bool
    notes: str | None
