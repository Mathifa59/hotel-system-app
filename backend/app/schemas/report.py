import uuid
from decimal import Decimal

from pydantic import BaseModel

from app.models.enums import ChargeType


class OccupancyReport(BaseModel):
    counts: dict[str, int]
    total_rooms: int
    occupancy_rate: float


class MinibarReportItem(BaseModel):
    product_id: uuid.UUID
    product_name: str
    total_quantity: int
    total_revenue_pen: Decimal
    total_revenue_usd: Decimal


class MinibarReport(BaseModel):
    items: list[MinibarReportItem]
    total_revenue_pen: Decimal
    total_revenue_usd: Decimal


class IncomeReportItem(BaseModel):
    type: ChargeType
    total_pen: Decimal
    total_usd: Decimal


class IncomeReport(BaseModel):
    items: list[IncomeReportItem]
    total_pen: Decimal
    total_usd: Decimal
