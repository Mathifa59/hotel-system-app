import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.enums import ChargeStatus, ChargeType


class ChargeCreate(BaseModel):
    reservation_id: uuid.UUID
    type: ChargeType
    description: str
    amount_pen: Decimal
    amount_usd: Decimal


class ChargeUpdate(BaseModel):
    description: str | None = None
    amount_pen: Decimal | None = None
    amount_usd: Decimal | None = None


class ChargeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    reservation_id: uuid.UUID
    type: ChargeType
    description: str
    amount_pen: Decimal
    amount_usd: Decimal
    status: ChargeStatus
    created_by: uuid.UUID
    created_at: datetime
    occurred_at: datetime
