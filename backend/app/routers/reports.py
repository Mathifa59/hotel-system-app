from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import require_role
from app.models.enums import RoomStatus, UserRole
from app.models.minibar import MinibarConsumption, MinibarProduct
from app.models.room import Room
from app.models.user import User
from app.schemas.report import MinibarReport, MinibarReportItem, OccupancyReport

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
            func.sum(MinibarConsumption.total).label("total_revenue"),
        )
        .join(MinibarConsumption, MinibarConsumption.product_id == MinibarProduct.id)
        .group_by(MinibarProduct.id, MinibarProduct.name)
        .order_by(func.sum(MinibarConsumption.quantity).desc())
        .all()
    )

    items = [
        MinibarReportItem(product_id=r.id, product_name=r.name, total_quantity=r.total_quantity, total_revenue=r.total_revenue)
        for r in rows
    ]
    total_revenue = sum((i.total_revenue for i in items), Decimal("0"))

    return MinibarReport(items=items, total_revenue=total_revenue)
