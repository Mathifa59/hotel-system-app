import uuid
from decimal import Decimal

from pydantic import BaseModel


class OccupancyReport(BaseModel):
    counts: dict[str, int]
    total_rooms: int
    occupancy_rate: float


class MinibarReportItem(BaseModel):
    product_id: uuid.UUID
    product_name: str
    total_quantity: int
    total_revenue: Decimal


class MinibarReport(BaseModel):
    items: list[MinibarReportItem]
    total_revenue: Decimal
