import uuid
from datetime import date
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


class StatsKpis(BaseModel):
    """Indicadores del periodo. Ver stats_report para cómo se calcula cada uno
    — en particular, las noches se prorratean: de una estadía a caballo entre
    dos meses, cada mes solo cuenta las noches que le tocan."""

    total_revenue_pen: Decimal
    total_revenue_usd: Decimal
    lodging_revenue_pen: Decimal
    lodging_revenue_usd: Decimal
    extras_revenue_pen: Decimal
    extras_revenue_usd: Decimal
    # Noches efectivamente vendidas dentro del periodo vs. las que se podrían
    # haber vendido (cuartos × días). Su cociente es la ocupación.
    nights_sold: int
    available_room_nights: int
    occupancy_rate: float
    # ADR = ingreso de alojamiento por noche vendida (qué tan caro se vendió).
    # RevPAR = ingreso de alojamiento por noche disponible (combina precio y
    # ocupación; es el indicador que de verdad mide el rendimiento).
    adr_pen: Decimal
    adr_usd: Decimal
    revpar_pen: Decimal
    revpar_usd: Decimal
    arrivals: int
    guests: int
    avg_nights: float


class StatsBucket(BaseModel):
    """Un corte del periodo (por tipo de cuarto, tarifa, cuarto u origen)."""

    key: str
    label: str
    nights: int
    revenue_pen: Decimal
    revenue_usd: Decimal


class StatsDailyPoint(BaseModel):
    day: date
    lodging_pen: Decimal
    lodging_usd: Decimal
    extras_pen: Decimal
    extras_usd: Decimal


class StatsReport(BaseModel):
    start: date
    end: date
    kpis: StatsKpis
    daily: list[StatsDailyPoint]
    by_room_type: list[StatsBucket]
    by_rate_plan: list[StatsBucket]
    by_room: list[StatsBucket]
    by_source: list[StatsBucket]
    extras_by_type: list[IncomeReportItem]
