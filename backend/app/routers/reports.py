from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import require_role
from app.models.charge import Charge
from app.models.enums import ChargeStatus, RoomStatus, UserRole
from app.models.minibar import MinibarConsumption, MinibarProduct
from app.models.room import Room
from app.models.user import User
from app.schemas.report import IncomeReport, IncomeReportItem, MinibarReport, MinibarReportItem, OccupancyReport

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/occupancy", response_model=OccupancyReport)
def occupancy_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    rows = db.query(Room.status, func.count(Room.id)).group_by(Room.status).all()
    counts = {s.value: 0 for s in RoomStatus}
    for room_status, count in rows:
        counts[room_status.value] = count

    total_rooms = sum(counts.values())
    occupancy_rate = round(counts[RoomStatus.occupied.value] / total_rooms, 4) if total_rooms else 0.0

    return OccupancyReport(counts=counts, total_rooms=total_rooms, occupancy_rate=occupancy_rate)


@router.get("/minibar", response_model=MinibarReport)
def minibar_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    rows = (
        db.query(
            MinibarProduct.id,
            MinibarProduct.name,
            func.sum(MinibarConsumption.quantity).label("total_quantity"),
            func.sum(MinibarConsumption.total_pen).label("total_revenue_pen"),
            func.sum(MinibarConsumption.total_usd).label("total_revenue_usd"),
        )
        .join(MinibarConsumption, MinibarConsumption.product_id == MinibarProduct.id)
        .group_by(MinibarProduct.id, MinibarProduct.name)
        .order_by(func.sum(MinibarConsumption.quantity).desc())
        .all()
    )

    items = [
        MinibarReportItem(
            product_id=r.id,
            product_name=r.name,
            total_quantity=r.total_quantity,
            total_revenue_pen=r.total_revenue_pen,
            total_revenue_usd=r.total_revenue_usd,
        )
        for r in rows
    ]
    total_revenue_pen = sum((i.total_revenue_pen for i in items), Decimal("0"))
    total_revenue_usd = sum((i.total_revenue_usd for i in items), Decimal("0"))

    return MinibarReport(items=items, total_revenue_pen=total_revenue_pen, total_revenue_usd=total_revenue_usd)


@router.get("/income", response_model=IncomeReport)
def income_report(
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    """Suma todos los cargos NO anulados por tipo (alojamiento, frigobar, daños,
    etc.) dentro del rango de fechas dado (por fecha de creación del cargo)."""
    query = db.query(
        Charge.type,
        func.sum(Charge.amount_pen).label("total_pen"),
        func.sum(Charge.amount_usd).label("total_usd"),
    ).filter(Charge.status != ChargeStatus.cancelled)
    if start is not None:
        query = query.filter(Charge.created_at >= start)
    if end is not None:
        query = query.filter(Charge.created_at <= end)
    rows = query.group_by(Charge.type).all()

    items = [
        IncomeReportItem(type=r.type, total_pen=r.total_pen or Decimal("0"), total_usd=r.total_usd or Decimal("0"))
        for r in rows
    ]
    total_pen = sum((i.total_pen for i in items), Decimal("0"))
    total_usd = sum((i.total_usd for i in items), Decimal("0"))

    return IncomeReport(items=items, total_pen=total_pen, total_usd=total_usd)
