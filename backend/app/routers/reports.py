from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import require_role
from app.models.charge import Charge
from app.models.enums import ChargeStatus, ChargeType, RatePlan, ReservationStatus, RoomStatus, UserRole
from app.models.minibar import MinibarConsumption, MinibarProduct
from app.models.reservation import Reservation
from app.models.room import Room, RoomTypeRate
from app.models.user import User
from app.schemas.report import (
    IncomeReport,
    IncomeReportItem,
    MinibarReport,
    MinibarReportItem,
    OccupancyReport,
    StatsBucket,
    StatsDailyPoint,
    StatsKpis,
    StatsReport,
)
from app.services.labels import RATE_PLAN_LABEL, RESERVATION_SOURCE_LABEL, ROOM_TYPE_LABEL

router = APIRouter(prefix="/reports", tags=["reports"])


def _nightly_rate(rate: RoomTypeRate | None, plan: RatePlan) -> tuple[Decimal, Decimal]:
    """Precio por noche según la tarifa de la reserva. Misma regla que usa el
    cobro real (_rate_for_plan en routers/reservations.py): si el tipo no tiene
    promocional cargada, cae a la profesional."""
    if rate is None:
        return Decimal("0"), Decimal("0")
    if plan == RatePlan.promotional and rate.price_pen_promo is not None and rate.price_usd_promo is not None:
        return Decimal(str(rate.price_pen_promo)), Decimal(str(rate.price_usd_promo))
    return Decimal(str(rate.price_pen)), Decimal(str(rate.price_usd))


def _stay_nights(reservation: Reservation) -> list[date]:
    """Las noches que abarca una estadía, identificadas por la fecha en que se
    duerme. Del 10 al 13 son las noches del 10, 11 y 12 — la del 13 no, porque
    ese día el huésped se va. Una estadía del mismo día cuenta como 1 noche,
    igual que en el cobro (_nights)."""
    first = reservation.check_in.date()
    last = reservation.check_out.date()
    if last <= first:
        return [first]
    return [first + timedelta(days=i) for i in range((last - first).days)]


@router.get("/stats", response_model=StatsReport)
def stats_report(
    start: date = Query(...),
    end: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    """Indicadores del periodo, calculados sobre las ESTADÍAS (no sobre la
    fecha en que se registró el cobro).

    Las noches se prorratean: una estadía del 28 de julio al 3 de agosto aporta
    4 noches a julio y 3 a agosto, cada una con su ingreso. Es lo que hace que
    ocupación, ADR y RevPAR sean comparables entre meses — y también lo que
    hace que las estadías pasadas que se registran a mano (ver
    create_historical_reservation) caigan en el mes en que de verdad ocurrieron.
    """
    if end < start:
        start, end = end, start

    rooms = db.query(Room).all()
    room_by_id = {room.id: room for room in rooms}
    rates = {rate.type: rate for rate in db.query(RoomTypeRate).all()}

    period_days = (end - start).days + 1
    available_room_nights = len(rooms) * period_days

    # Estadías que tocan el periodo. Se excluyen las canceladas (nunca
    # ocuparon el cuarto); se incluyen las activas además de las cerradas,
    # para que el mes en curso muestre a los huéspedes que están alojados
    # ahora mismo y no solo a los que ya se fueron.
    reservations = (
        db.query(Reservation)
        .filter(
            Reservation.room_id.isnot(None),
            Reservation.status.in_([ReservationStatus.active, ReservationStatus.checked_out]),
            Reservation.check_in < datetime.combine(end + timedelta(days=1), datetime.min.time()),
            Reservation.check_out > datetime.combine(start, datetime.min.time()),
        )
        .all()
    )

    nights_sold = 0
    lodging_pen = Decimal("0")
    lodging_usd = Decimal("0")
    arrivals = 0
    guests = 0
    stay_lengths: list[int] = []

    daily_lodging: dict[date, list[Decimal]] = defaultdict(lambda: [Decimal("0"), Decimal("0")])
    by_type: dict[str, list] = {}
    by_plan: dict[str, list] = {}
    by_room: dict[str, list] = {}
    by_source: dict[str, list] = {}

    def add(bucket: dict, key: str, label: str, night_count: int, pen: Decimal, usd: Decimal) -> None:
        entry = bucket.setdefault(key, [label, 0, Decimal("0"), Decimal("0")])
        entry[1] += night_count
        entry[2] += pen
        entry[3] += usd

    for reservation in reservations:
        room = room_by_id.get(reservation.room_id)
        if room is None:
            continue
        pen_rate, usd_rate = _nightly_rate(rates.get(room.type), reservation.rate_plan)

        nights_in_period = [night for night in _stay_nights(reservation) if start <= night <= end]
        if not nights_in_period:
            continue

        count = len(nights_in_period)
        pen_total = pen_rate * count
        usd_total = usd_rate * count

        nights_sold += count
        lodging_pen += pen_total
        lodging_usd += usd_total

        for night in nights_in_period:
            daily_lodging[night][0] += pen_rate
            daily_lodging[night][1] += usd_rate

        # Llegadas: estadías que EMPIEZAN dentro del periodo. Es lo que
        # responde "cuántos huéspedes recibimos este mes", distinto de las
        # noches vendidas (que incluyen estadías arrastradas del mes anterior).
        if start <= reservation.check_in.date() <= end:
            arrivals += 1
            guests += reservation.guests
            stay_lengths.append(len(_stay_nights(reservation)))

        add(by_type, room.type.value, ROOM_TYPE_LABEL[room.type], count, pen_total, usd_total)
        add(by_plan, reservation.rate_plan.value, RATE_PLAN_LABEL[reservation.rate_plan], count, pen_total, usd_total)
        add(by_room, room.number, f"Cuarto {room.number}", count, pen_total, usd_total)
        add(
            by_source,
            reservation.source.value,
            RESERVATION_SOURCE_LABEL[reservation.source],
            count,
            pen_total,
            usd_total,
        )

    # Cargos extra (frigobar, daños, limpieza extra…) por su fecha económica.
    # Se excluye `room`: el alojamiento ya está calculado noche por noche
    # arriba, sumar también su cargo lo contaría dos veces.
    extra_rows = (
        db.query(Charge)
        .filter(
            Charge.status != ChargeStatus.cancelled,
            Charge.type != ChargeType.room,
            func.date(Charge.occurred_at) >= start,
            func.date(Charge.occurred_at) <= end,
        )
        .all()
    )
    extras_pen = sum((Decimal(c.amount_pen) for c in extra_rows), Decimal("0"))
    extras_usd = sum((Decimal(c.amount_usd) for c in extra_rows), Decimal("0"))

    daily_extras: dict[date, list[Decimal]] = defaultdict(lambda: [Decimal("0"), Decimal("0")])
    extras_by_type: dict[ChargeType, list[Decimal]] = defaultdict(lambda: [Decimal("0"), Decimal("0")])
    for charge in extra_rows:
        day = charge.occurred_at.date()
        daily_extras[day][0] += Decimal(charge.amount_pen)
        daily_extras[day][1] += Decimal(charge.amount_usd)
        extras_by_type[charge.type][0] += Decimal(charge.amount_pen)
        extras_by_type[charge.type][1] += Decimal(charge.amount_usd)

    # Serie diaria completa: se emiten TODOS los días del periodo, incluso los
    # de cero, para que el gráfico no comprima los huecos y se vea el ritmo
    # real de la temporada.
    daily = [
        StatsDailyPoint(
            day=start + timedelta(days=i),
            lodging_pen=daily_lodging[start + timedelta(days=i)][0],
            lodging_usd=daily_lodging[start + timedelta(days=i)][1],
            extras_pen=daily_extras[start + timedelta(days=i)][0],
            extras_usd=daily_extras[start + timedelta(days=i)][1],
        )
        for i in range(period_days)
    ]

    def buckets(source: dict) -> list[StatsBucket]:
        return [
            StatsBucket(key=key, label=value[0], nights=value[1], revenue_pen=value[2], revenue_usd=value[3])
            for key, value in sorted(source.items(), key=lambda kv: kv[1][2], reverse=True)
        ]

    kpis = StatsKpis(
        total_revenue_pen=lodging_pen + extras_pen,
        total_revenue_usd=lodging_usd + extras_usd,
        lodging_revenue_pen=lodging_pen,
        lodging_revenue_usd=lodging_usd,
        extras_revenue_pen=extras_pen,
        extras_revenue_usd=extras_usd,
        nights_sold=nights_sold,
        available_room_nights=available_room_nights,
        occupancy_rate=round(nights_sold / available_room_nights, 4) if available_room_nights else 0.0,
        adr_pen=round(lodging_pen / nights_sold, 2) if nights_sold else Decimal("0"),
        adr_usd=round(lodging_usd / nights_sold, 2) if nights_sold else Decimal("0"),
        revpar_pen=round(lodging_pen / available_room_nights, 2) if available_room_nights else Decimal("0"),
        revpar_usd=round(lodging_usd / available_room_nights, 2) if available_room_nights else Decimal("0"),
        arrivals=arrivals,
        guests=guests,
        avg_nights=round(sum(stay_lengths) / len(stay_lengths), 1) if stay_lengths else 0.0,
    )

    return StatsReport(
        start=start,
        end=end,
        kpis=kpis,
        daily=daily,
        by_room_type=buckets(by_type),
        by_rate_plan=buckets(by_plan),
        by_room=buckets(by_room),
        by_source=buckets(by_source),
        extras_by_type=[
            IncomeReportItem(type=charge_type, total_pen=totals[0], total_usd=totals[1])
            for charge_type, totals in sorted(extras_by_type.items(), key=lambda kv: kv[1][0], reverse=True)
        ],
    )


@router.get("/occupancy", response_model=OccupancyReport)
def occupancy_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
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
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
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
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    """Suma todos los cargos NO anulados por tipo (alojamiento, frigobar, daños,
    etc.) dentro del rango de fechas dado.

    Filtra por `occurred_at` (cuándo ocurrió el consumo) y no por `created_at`
    (cuándo se tecleó): así una estadía pasada cargada hoy suma al mes en que
    de verdad ocurrió. Ver la migración d9a1c5e7b3f8."""
    query = db.query(
        Charge.type,
        func.sum(Charge.amount_pen).label("total_pen"),
        func.sum(Charge.amount_usd).label("total_usd"),
    ).filter(Charge.status != ChargeStatus.cancelled)
    if start is not None:
        query = query.filter(Charge.occurred_at >= start)
    if end is not None:
        query = query.filter(Charge.occurred_at <= end)
    rows = query.group_by(Charge.type).all()

    items = [
        IncomeReportItem(type=r.type, total_pen=r.total_pen or Decimal("0"), total_usd=r.total_usd or Decimal("0"))
        for r in rows
    ]
    total_pen = sum((i.total_pen for i in items), Decimal("0"))
    total_usd = sum((i.total_usd for i in items), Decimal("0"))

    return IncomeReport(items=items, total_pen=total_pen, total_usd=total_usd)
