import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models.charge import Charge
from app.models.cleaning_request import CleaningRequest
from app.models.enums import (
    ChargeStatus,
    ChargeType,
    CleaningRequestType,
    RatePlan,
    ReservationSource,
    ReservationStatus,
    RoomStatus,
    RoomType,
    UserRole,
)
from app.models.reservation import Reservation
from app.models.room import Room, RoomTypeRate
from app.models.user import User
from app.schemas.reservation import (
    HistoricalReservationCreate,
    PaymentInfo,
    ReservationCreate,
    ReservationFolio,
    ReservationOut,
    ReservationUpdate,
    VoucherOut,
)
from app.services.activity_log import log_activity
from app.services.capacity import ROOM_CAPACITY
from app.services.events import publish_event
from app.services.labels import CLEANING_TYPE_LABEL, ROOM_STATUS_LABEL
from app.services.notifications import create_notification

router = APIRouter(prefix="/reservations", tags=["reservations"])


def _nights(reservation: Reservation) -> int:
    return max((reservation.check_out.date() - reservation.check_in.date()).days, 1)


def _nightly_rate(reservation: Reservation, room_type: RoomType, db: Session) -> tuple[Decimal, Decimal]:
    """Precio por noche que le corresponde a ESTA reserva: el que se le fijó
    a mano (custom_rate_pen/usd), o si no tiene, el vigente para su tipo de
    cuarto y plan. Punto único de esta decisión — los 4 lugares que cobran
    alojamiento (alta, check-out, folio, voucher) pasan por acá, así que
    fijar un precio propio para una reserva no requiere tocar la tarifa
    general ni recordar actualizarla en cuatro sitios."""
    if reservation.custom_rate_pen is not None and reservation.custom_rate_usd is not None:
        return Decimal(reservation.custom_rate_pen), Decimal(reservation.custom_rate_usd)
    rate = db.get(RoomTypeRate, room_type)
    return _rate_for_plan(rate, reservation.rate_plan)


def _rate_for_plan(rate: RoomTypeRate, plan: RatePlan) -> tuple[Decimal, Decimal]:
    """Precio por noche (PEN, USD) según la tarifa elegida para la reserva.
    Si el tipo de cuarto no tiene tarifa promocional cargada (ej. Doble
    Deluxe - 2 camas), cae de vuelta a la profesional en vez de cobrar 0."""
    if plan == RatePlan.promotional and rate.price_pen_promo is not None and rate.price_usd_promo is not None:
        return Decimal(rate.price_pen_promo), Decimal(rate.price_usd_promo)
    return Decimal(rate.price_pen), Decimal(rate.price_usd)


@router.get("", response_model=list[ReservationOut])
def list_reservations(
    room_id: uuid.UUID | None = Query(default=None),
    status_filter: ReservationStatus | None = Query(default=None, alias="status"),
    source_filter: ReservationSource | None = Query(default=None, alias="source"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Reservation)
    if room_id is not None:
        query = query.filter(Reservation.room_id == room_id)
    if status_filter is not None:
        query = query.filter(Reservation.status == status_filter)
    if source_filter is not None:
        query = query.filter(Reservation.source == source_filter)
    return query.order_by(Reservation.created_at.desc()).all()


@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
def create_reservation(
    data: ReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    room = db.get(Room, data.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")
    if data.check_out <= data.check_in:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="check_out debe ser posterior a check_in")

    capacity = ROOM_CAPACITY[room.type]
    if data.guests > capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El cuarto {room.number} admite máximo {capacity} huésped(es)",
        )

    overlap = (
        db.query(Reservation)
        .filter(
            Reservation.room_id == data.room_id,
            Reservation.status.in_([ReservationStatus.pending, ReservationStatus.active]),
            Reservation.check_in < data.check_out,
            Reservation.check_out > data.check_in,
        )
        .first()
    )
    if overlap is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El cuarto {room.number} ya tiene una reserva de {overlap.guest_name} que se cruza con esas fechas",
        )

    # `deposit` no es columna de Reservation (son 4 campos deposit_* aparte)
    # — se excluye del dump y se asigna a mano, igual que hace el registro de
    # estadía pasada con su `payment`.
    reservation = Reservation(**data.model_dump(exclude={"deposit"}), created_by=current_user.id)
    if data.deposit is not None:
        reservation.deposit_amount_pen = data.deposit.amount_pen
        reservation.deposit_amount_usd = data.deposit.amount_usd
        reservation.deposit_method = data.deposit.method
        reservation.deposit_paid_at = data.deposit.paid_at
    db.add(reservation)
    try:
        db.flush()
    except IntegrityError:
        # Red de seguridad contra la condición de carrera: dos requests
        # concurrentes pueden pasar el chequeo de arriba (SELECT) antes de
        # que cualquiera de las dos llegue a insertar — el constraint
        # EXCLUDE de la base (ver migración c7d2f4a8e1b6) es lo único que de
        # verdad lo impide. Esto solo se dispara en ese caso raro; el
        # chequeo manual de arriba ya cubre el caso normal con un mensaje
        # más específico (con el nombre del huésped que ya tiene el cuarto).
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El cuarto {room.number} acaba de ser reservado para esas fechas por otra persona — actualiza e intenta de nuevo",
        )
    log_activity(
        db,
        user_id=current_user.id,
        action="reservation.created",
        entity="reservations",
        entity_id=reservation.id,
        meta={"room": room.number, "guest": data.guest_name},
    )
    db.commit()
    db.refresh(reservation)
    return reservation


@router.post("/historical", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
def create_historical_reservation(
    data: HistoricalReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    """Registra una estadía que YA terminó, sin pasar por el flujo en vivo.

    El camino normal (crear → check-in → check-out) actúa sobre el presente:
    ocupa el cuarto, lo manda a limpieza y avisa a housekeeping. Para algo que
    pasó hace semanas todo eso sería incorrecto — el cuarto hoy está libre (o
    lo ocupa otro huésped) y no hay nada que limpiar. Por eso esta estadía
    entra directo como `checked_out`, con su cargo de alojamiento ya cobrado,
    sin tocar el estado del cuarto ni emitir eventos en vivo.
    """
    room = db.get(Room, data.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    # Las fechas sin zona horaria se asumen en UTC, igual que en
    # update_reservation, para poder compararlas entre sí y contra "ahora".
    check_in = data.check_in if data.check_in.tzinfo else data.check_in.replace(tzinfo=timezone.utc)
    check_out = data.check_out if data.check_out.tzinfo else data.check_out.replace(tzinfo=timezone.utc)

    if check_out <= check_in:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="check_out debe ser posterior a check_in")
    if check_out > datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta opción es solo para estadías que ya terminaron — para una reserva futura usa el flujo normal",
        )

    capacity = ROOM_CAPACITY[room.type]
    if data.guests > capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"El cuarto {room.number} admite máximo {capacity} huésped(es)",
        )

    # A diferencia del alta normal, acá el cruce se busca también contra
    # estadías ya cerradas: dos huéspedes no pudieron ocupar el mismo cuarto
    # las mismas noches, así que si choca es que se está cargando dos veces.
    # (El constraint EXCLUDE de la base solo cubre reservas vivas, a propósito
    # — ver migración c7d2f4a8e1b6 — así que este chequeo va por consulta.)
    overlap = (
        db.query(Reservation)
        .filter(
            Reservation.room_id == data.room_id,
            Reservation.status != ReservationStatus.cancelled,
            Reservation.check_in < check_out,
            Reservation.check_out > check_in,
        )
        .first()
    )
    if overlap is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El cuarto {room.number} ya tiene registrada una estadía de {overlap.guest_name} en esas fechas",
        )

    reservation = Reservation(
        room_id=data.room_id,
        guest_name=data.guest_name,
        guest_phone=data.guest_phone,
        guest_id_document=data.guest_id_document,
        check_in=check_in,
        check_out=check_out,
        guests=data.guests,
        rate_plan=data.rate_plan,
        custom_rate_pen=data.custom_rate_pen,
        custom_rate_usd=data.custom_rate_usd,
        status=ReservationStatus.checked_out,
        source=ReservationSource.staff,
        confirmed=True,
        created_by=current_user.id,
    )
    if data.payment is not None:
        reservation.payment_method = data.payment.method
        reservation.payment_amount_pen = data.payment.amount_pen
        reservation.payment_amount_usd = data.payment.amount_usd
        reservation.paid_at = data.payment.paid_at
    if data.deposit is not None:
        reservation.deposit_amount_pen = data.deposit.amount_pen
        reservation.deposit_amount_usd = data.deposit.amount_usd
        reservation.deposit_method = data.deposit.method
        reservation.deposit_paid_at = data.deposit.paid_at
    db.add(reservation)
    db.flush()

    nights = _nights(reservation)
    pen_rate, usd_rate = _nightly_rate(reservation, room.type, db)
    plan_label = "Promocional" if reservation.rate_plan == RatePlan.promotional else "Profesional"

    db.add(
        Charge(
            reservation_id=reservation.id,
            type=ChargeType.room,
            description=f"Alojamiento — {nights} noche(s) ({plan_label})",
            amount_pen=pen_rate * nights,
            amount_usd=usd_rate * nights,
            status=ChargeStatus.billed,
            created_by=current_user.id,
            # La fecha económica es la de la estadía, no la de hoy — es lo que
            # hace que este registro sume a los ingresos del mes correcto.
            occurred_at=check_out,
        )
    )

    log_activity(
        db,
        user_id=current_user.id,
        action="reservation.historical_created",
        entity="rooms",
        entity_id=room.id,
        meta={"room": room.number, "guest": data.guest_name, "nights": nights},
    )
    db.commit()
    db.refresh(reservation)
    return reservation


@router.post("/expire-no-shows")
def expire_no_shows(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    """Cancela las reservas pendientes cuya fecha de llegada ya pasó (no se
    presentaron), liberando esos cuartos. Acción explícita del operador."""
    now = datetime.now(timezone.utc)
    stale = (
        db.query(Reservation)
        .filter(Reservation.status == ReservationStatus.pending, Reservation.check_in < now)
        .all()
    )
    for reservation in stale:
        reservation.status = ReservationStatus.cancelled
        log_activity(
            db, user_id=current_user.id, action="reservation.no_show", entity="reservations", entity_id=reservation.id
        )
    db.commit()
    return {"cancelled": len(stale)}


@router.patch("/{reservation_id}", response_model=ReservationOut)
def update_reservation(
    reservation_id: uuid.UUID,
    data: ReservationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    # Cancelada = nunca ocupó el cuarto, no hay nada que corregir. Todo lo
    # demás —incluida checked_out— se puede editar: una estadía pasada o ya
    # cerrada puede tener un dato mal (nombre, fechas, adelanto, precio) que
    # hay que poder arreglar sin reabrir toda la reserva.
    if reservation.status == ReservationStatus.cancelled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No se puede editar una reserva cancelada")

    changes = data.model_dump(exclude_unset=True)
    # `deposit` no es una columna de Reservation (son 4 campos deposit_*
    # aparte) — se saca del dict genérico ANTES del chequeo de "no hay nada
    # que cambiar", porque alguien puede llamar a este endpoint solo para
    # corregir el adelanto sin tocar ningún otro campo.
    deposit_provided = "deposit" in changes
    deposit_data = changes.pop("deposit", None)
    if not changes and not deposit_provided:
        return reservation

    # Las fechas que llegan sin zona horaria se asumen en UTC, para poder
    # compararlas con las que ya están guardadas (que sí tienen zona).
    for key in ("check_in", "check_out"):
        if key in changes and changes[key] is not None and changes[key].tzinfo is None:
            changes[key] = changes[key].replace(tzinfo=timezone.utc)

    new_room_id = changes.get("room_id", reservation.room_id)
    new_check_in = changes.get("check_in", reservation.check_in)
    new_check_out = changes.get("check_out", reservation.check_out)
    new_guests = changes.get("guests", reservation.guests)

    if new_check_out <= new_check_in:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="check_out debe ser posterior a check_in")

    # new_room_id puede seguir siendo None: una reserva en lista de espera
    # (del sitio web, sin cuarto libre al momento de pedirla) puede editarse
    # en otros campos (huésped, fechas) sin que recepción tenga que asignarle
    # ya un cuarto. Las validaciones de capacidad/cruce de fechas solo
    # aplican cuando SÍ hay un cuarto de por medio.
    new_room = db.get(Room, new_room_id) if new_room_id is not None else None
    if new_room_id is not None and new_room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    capacity_type = new_room.type if new_room else reservation.requested_room_type
    if capacity_type is not None:
        capacity = ROOM_CAPACITY[capacity_type]
        if new_guests > capacity:
            label = new_room.number if new_room else "ese tipo de cuarto"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"El cuarto {label} admite máximo {capacity} huésped(es)",
            )

    if new_room is not None:
        overlap = (
            db.query(Reservation)
            .filter(
                Reservation.room_id == new_room_id,
                Reservation.id != reservation_id,
                Reservation.status.in_([ReservationStatus.pending, ReservationStatus.active]),
                Reservation.check_in < new_check_out,
                Reservation.check_out > new_check_in,
            )
            .first()
        )
        if overlap is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"El cuarto {new_room.number} ya tiene una reserva de {overlap.guest_name} que se cruza con esas fechas",
            )

    # Si se cambia de cuarto en una reserva ACTIVA (huésped ya alojado), hay que
    # mover los estados: el cuarto viejo queda por limpiar, el nuevo se ocupa.
    moved_rooms: list[Room] = []
    room_changed = new_room_id != reservation.room_id
    if room_changed and reservation.status == ReservationStatus.active and new_room is not None:
        if new_room.status != RoomStatus.available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="El cuarto destino no está disponible"
            )
        old_room = db.get(Room, reservation.room_id)
        old_room.status = RoomStatus.cleaning
        new_room.status = RoomStatus.occupied
        moved_rooms = [old_room, new_room]

    for field, value in changes.items():
        setattr(reservation, field, value)

    if deposit_provided:
        if deposit_data is not None:
            reservation.deposit_amount_pen = deposit_data["amount_pen"]
            reservation.deposit_amount_usd = deposit_data["amount_usd"]
            reservation.deposit_method = deposit_data["method"]
            reservation.deposit_paid_at = deposit_data["paid_at"]
        else:
            reservation.deposit_amount_pen = None
            reservation.deposit_amount_usd = None
            reservation.deposit_method = None
            reservation.deposit_paid_at = None

    # Editar una reserva YA cerrada puede tocar justo lo que decidió su
    # cargo de alojamiento (fechas, plan, precio propio) — sin esto, el
    # voucher/folio mostrarían el monto corregido pero el cargo real (el que
    # cuentan los reportes) se quedaría con el valor viejo, dos números
    # distintos para la misma estadía.
    if reservation.status == ReservationStatus.checked_out and new_room is not None:
        room_charge = (
            db.query(Charge)
            .filter(Charge.reservation_id == reservation.id, Charge.type == ChargeType.room)
            .first()
        )
        if room_charge is not None:
            nights = _nights(reservation)
            pen_rate, usd_rate = _nightly_rate(reservation, new_room.type, db)
            room_charge.amount_pen = pen_rate * nights
            room_charge.amount_usd = usd_rate * nights

    log_activity(
        db,
        user_id=current_user.id,
        action="reservation.updated",
        entity="rooms" if new_room is not None else "reservations",
        entity_id=new_room.id if new_room is not None else reservation.id,
        meta={"changed": list(changes.keys())},
    )
    try:
        db.commit()
    except IntegrityError:
        # Mismo caso que en create_reservation: red de seguridad de la base
        # contra una condición de carrera si dos ediciones concurrentes
        # mueven reservas distintas al mismo cuarto para fechas que chocan.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ese cuarto acaba de quedar ocupado para esas fechas por otra reserva — actualiza e intenta de nuevo",
        )
    db.refresh(reservation)

    for rm in moved_rooms:
        publish_event("room_status_changed", audiences=["all"], payload={"room": rm.number, "status": rm.status.value})
    return reservation


@router.patch("/{reservation_id}/checkin", response_model=ReservationOut)
def checkin(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    if reservation.status != ReservationStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La reserva no está pendiente")
    if not reservation.confirmed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La reserva todavía no está confirmada")
    if reservation.room_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta reserva está en lista de espera — asígnale un cuarto antes de hacer check-in",
        )

    room = db.get(Room, reservation.room_id)
    if room.status != RoomStatus.available:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El cuarto no está disponible para check-in")

    reservation.status = ReservationStatus.active
    room.status = RoomStatus.occupied

    log_activity(
        db, user_id=current_user.id, action="reservation.checked_in", entity="reservations", entity_id=reservation.id
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Check-in de {reservation.guest_name} — cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
        meta={"room": room.number, "status": room.status.value},
    )
    db.commit()
    db.refresh(reservation)

    publish_event("room_status_changed", audiences=["all"], payload={"room": room.number, "status": room.status.value})
    return reservation


@router.patch("/{reservation_id}/confirm", response_model=ReservationOut)
def confirm_reservation(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    if reservation.source != ReservationSource.website:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Solo las solicitudes del sitio web se confirman así"
        )
    if reservation.confirmed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta solicitud ya está confirmada")

    reservation.confirmed = True
    room = db.get(Room, reservation.room_id) if reservation.room_id else None
    room_label = f"cuarto {room.number}" if room else "lista de espera, sin cuarto asignado"

    log_activity(
        db, user_id=current_user.id, action="reservation.confirmed", entity="reservations", entity_id=reservation.id
    )
    create_notification(
        db,
        audience="all",
        event="booking_request_confirmed",
        message=f"Solicitud de {reservation.guest_name} confirmada — {room_label}",
        meta={"room": room.number if room else None, "guest": reservation.guest_name},
    )
    db.commit()
    db.refresh(reservation)

    publish_event(
        "booking_request_confirmed",
        audiences=["all"],
        payload={"room": room.number if room else None, "guest": reservation.guest_name},
    )
    return reservation


@router.patch("/{reservation_id}/reject", response_model=ReservationOut)
def reject_reservation(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    if reservation.source != ReservationSource.website:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Solo las solicitudes del sitio web se rechazan así"
        )
    if reservation.status != ReservationStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Esta solicitud ya no está pendiente")

    reservation.status = ReservationStatus.cancelled
    room = db.get(Room, reservation.room_id) if reservation.room_id else None
    room_label = f"cuarto {room.number}" if room else "lista de espera"

    log_activity(
        db, user_id=current_user.id, action="reservation.rejected", entity="reservations", entity_id=reservation.id
    )
    create_notification(
        db,
        audience="all",
        event="booking_request_rejected",
        message=f"Solicitud de {reservation.guest_name} rechazada — {room_label}",
        meta={"room": room.number if room else None, "guest": reservation.guest_name},
    )
    db.commit()
    db.refresh(reservation)

    publish_event(
        "booking_request_rejected",
        audiences=["all"],
        payload={"room": room.number if room else None, "guest": reservation.guest_name},
    )
    return reservation


@router.get("/{reservation_id}/folio", response_model=ReservationFolio)
def reservation_folio(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")

    room = db.get(Room, reservation.room_id)
    nights = _nights(reservation)
    pen_rate, usd_rate = _nightly_rate(reservation, room.type, db)
    room_charge_pen = pen_rate * nights
    room_charge_usd = usd_rate * nights

    # Se excluyen los cargos de tipo `room`: el alojamiento ya se muestra
    # aparte (room_charge_pen/usd, calculado arriba). Sin este filtro, una
    # reserva que ya pasó por check-out —o una estadía pasada registrada, que
    # nace con su cargo— lo sumaría dos veces al total.
    charges = (
        db.query(Charge)
        .filter(
            Charge.reservation_id == reservation_id,
            Charge.status != ChargeStatus.cancelled,
            Charge.type != ChargeType.room,
        )
        .order_by(Charge.created_at)
        .all()
    )
    total_pen = room_charge_pen + sum((c.amount_pen for c in charges), Decimal("0"))
    total_usd = room_charge_usd + sum((c.amount_usd for c in charges), Decimal("0"))

    return ReservationFolio(
        nights=nights,
        rate_plan=reservation.rate_plan,
        room_charge_pen=room_charge_pen,
        room_charge_usd=room_charge_usd,
        charges=charges,
        total_pen=total_pen,
        total_usd=total_usd,
    )


@router.get("/{reservation_id}/voucher", response_model=VoucherOut)
def reservation_voucher(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    """Constancia de reserva para el huésped — NO es un comprobante de pago
    (boleta/factura), es solo la confirmación de que la reserva existe, el
    adelanto recibido y el saldo pendiente al llegar."""
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")

    room = db.get(Room, reservation.room_id) if reservation.room_id else None
    room_type = room.type if room is not None else reservation.requested_room_type
    if room_type is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Esta reserva no tiene cuarto ni tipo de cuarto asignado — asígnalo antes de generar el voucher",
        )

    nights = _nights(reservation)
    pen_rate, usd_rate = _nightly_rate(reservation, room_type, db)
    subtotal_pen = pen_rate * nights
    subtotal_usd = usd_rate * nights

    deposit_pen = reservation.deposit_amount_pen or Decimal("0")
    deposit_usd = reservation.deposit_amount_usd or Decimal("0")

    # El correlativo se asigna la PRIMERA vez que alguien pide el voucher —no
    # al crear la reserva—, así que el número que ve la dueña sigue el orden
    # real en que entregó vouchers, no el orden en que se tecleó cada
    # reserva. nextval() es atómico en Postgres: dos pedidos simultáneos del
    # mismo voucher nunca terminan con el mismo número.
    if reservation.voucher_number is None:
        reservation.voucher_number = db.execute(text("SELECT nextval('reservation_voucher_seq')")).scalar()
        db.commit()
        db.refresh(reservation)

    return VoucherOut(
        voucher_number=f"RES-{reservation.voucher_number:04d}",
        issued_at=datetime.now(timezone.utc),
        guest_name=reservation.guest_name,
        guest_id_document=reservation.guest_id_document,
        room_number=room.number if room is not None else None,
        room_type=room_type,
        check_in=reservation.check_in,
        check_out=reservation.check_out,
        nights=nights,
        guests=reservation.guests,
        rate_plan=reservation.rate_plan,
        price_per_night_pen=pen_rate,
        price_per_night_usd=usd_rate,
        subtotal_pen=subtotal_pen,
        subtotal_usd=subtotal_usd,
        deposit_amount_pen=reservation.deposit_amount_pen,
        deposit_amount_usd=reservation.deposit_amount_usd,
        deposit_method=reservation.deposit_method,
        deposit_paid_at=reservation.deposit_paid_at,
        balance_due_pen=subtotal_pen - deposit_pen,
        balance_due_usd=subtotal_usd - deposit_usd,
    )


@router.patch("/{reservation_id}/checkout", response_model=ReservationOut)
def checkout(
    reservation_id: uuid.UUID,
    payment: PaymentInfo | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    if reservation.status != ReservationStatus.active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La reserva no está activa")

    if payment is not None:
        reservation.payment_method = payment.method
        reservation.payment_amount_pen = payment.amount_pen
        reservation.payment_amount_usd = payment.amount_usd
        reservation.paid_at = payment.paid_at

    room = db.get(Room, reservation.room_id)
    nights = _nights(reservation)
    pen_rate, usd_rate = _nightly_rate(reservation, room.type, db)
    plan_label = "Promocional" if reservation.rate_plan == RatePlan.promotional else "Profesional"

    room_charge = Charge(
        reservation_id=reservation.id,
        type=ChargeType.room,
        description=f"Alojamiento — {nights} noche(s) ({plan_label})",
        amount_pen=pen_rate * nights,
        amount_usd=usd_rate * nights,
        status=ChargeStatus.approved,
        created_by=current_user.id,
        # El alojamiento se reconoce en la fecha de salida del huésped, no en
        # el instante en que recepción aprieta el botón — normalmente son el
        # mismo día, pero si el check-out se registra tarde (al día siguiente)
        # el ingreso igual cae en el día que corresponde.
        occurred_at=reservation.check_out,
    )
    db.add(room_charge)

    approved_charges = (
        db.query(Charge)
        .filter(Charge.reservation_id == reservation.id, Charge.status == ChargeStatus.approved)
        .all()
    )
    for charge in approved_charges:
        charge.status = ChargeStatus.billed
    room_charge.status = ChargeStatus.billed

    reservation.status = ReservationStatus.checked_out
    room.status = RoomStatus.cleaning

    cleaning_request = CleaningRequest(
        room_id=room.id,
        reservation_id=reservation.id,
        request_type=CleaningRequestType.full,
        requested_by=current_user.id,
    )
    db.add(cleaning_request)
    db.flush()

    log_activity(
        db, user_id=current_user.id, action="reservation.checked_out", entity="reservations", entity_id=reservation.id
    )
    if payment is not None:
        log_activity(
            db,
            user_id=current_user.id,
            action="reservation.paid",
            entity="rooms",
            entity_id=room.id,
            meta={
                "method": payment.method.value,
                "amount_pen": str(payment.amount_pen),
                "amount_usd": str(payment.amount_usd),
            },
        )
    log_activity(
        db,
        user_id=current_user.id,
        action="checkout.billed",
        entity="rooms",
        entity_id=room.id,
        meta={"nights": nights, "amount_pen": str(room_charge.amount_pen), "amount_usd": str(room_charge.amount_usd)},
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Check-out de {reservation.guest_name} — cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
        meta={"room": room.number, "status": room.status.value},
    )
    create_notification(
        db,
        audience="cleaning",
        event="cleaning_request_created",
        message=f"Nueva solicitud de limpieza ({CLEANING_TYPE_LABEL[cleaning_request.request_type]}) — cuarto {room.number}",
        meta={"id": str(cleaning_request.id), "room": room.number},
    )
    db.commit()
    db.refresh(reservation)

    publish_event("room_status_changed", audiences=["all"], payload={"room": room.number, "status": room.status.value})
    publish_event(
        "cleaning_request_created",
        audiences=["cleaning"],
        payload={"id": str(cleaning_request.id), "room": room.number, "request_type": cleaning_request.request_type.value},
    )
    return reservation


@router.patch("/{reservation_id}/cancel", response_model=ReservationOut)
def cancel_reservation(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    if reservation.status != ReservationStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solo se pueden cancelar reservas pendientes")

    reservation.status = ReservationStatus.cancelled

    log_activity(
        db, user_id=current_user.id, action="reservation.cancelled", entity="reservations", entity_id=reservation.id
    )
    db.commit()
    db.refresh(reservation)
    return reservation
