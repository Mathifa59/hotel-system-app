from datetime import datetime

from pydantic import BaseModel

from app.schemas.cleaning_request import CleaningRequestOut
from app.schemas.reservation import ReservationOut


class ActivityLogOut(BaseModel):
    action: str
    meta: dict | None
    actor_name: str | None
    created_at: datetime


class RoomHistory(BaseModel):
    reservations: list[ReservationOut]
    cleaning_requests: list[CleaningRequestOut]
    activity: list[ActivityLogOut]
