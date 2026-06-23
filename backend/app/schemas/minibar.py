import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class MinibarProductCreate(BaseModel):
    name: str
    price: Decimal
    cost: Decimal
    is_active: bool = True


class MinibarProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    price: Decimal
    cost: Decimal
    is_active: bool


class StockSetRequest(BaseModel):
    room_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int


class StockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    initial_quantity: int
    updated_at: datetime


class ConsumptionItem(BaseModel):
    product_id: uuid.UUID
    quantity: int


class ConsumptionCreate(BaseModel):
    room_id: uuid.UUID
    reservation_id: uuid.UUID
    items: list[ConsumptionItem]


class ConsumptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    room_id: uuid.UUID
    reservation_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    unit_price: Decimal
    total: Decimal
    registered_by: uuid.UUID
    registered_at: datetime


class ConsumptionRegisterOut(BaseModel):
    consumptions: list[ConsumptionOut]
    charge_id: uuid.UUID
    charge_total: Decimal
