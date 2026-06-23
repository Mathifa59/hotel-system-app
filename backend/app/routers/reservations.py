import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models.enums import ReservationSource, ReservationStatus, RoomStatus, UserRole
from app.models.reservation import Reservation
from app.models.room import Room
from app.models.user import User
from app.schemas.reservation import ReservationCreate, ReservationOut
from app.services.activity_log import log_activity
from app.services.events import publish_event
from app.services.labels import ROOM_STATUS_LABEL
from app.services.notifications import create_notification

router = APIRouter(prefix="/reservations", tags=["reservations"])


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

    reservation = Reservation(**data.model_dump(), created_by=current_user.id)
    db.add(reservation)
    db.flush()
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
    room = db.get(Room, reservation.room_id)

    log_activity(
        db, user_id=current_user.id, action="reservation.confirmed", entity="reservations", entity_id=reservation.id
    )
    create_notification(
        db,
        audience="all",
        event="booking_request_confirmed",
        message=f"Solicitud de {reservation.guest_name} confirmada — cuarto {room.number}",
        meta={"room": room.number, "guest": reservation.guest_name},
    )
    db.commit()
    db.refresh(reservation)

    publish_event(
        "booking_request_confirmed", audiences=["all"], payload={"room": room.number, "guest": reservation.guest_name}
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
    room = db.get(Room, reservation.room_id)

    log_activity(
        db, user_id=current_user.id, action="reservation.rejected", entity="reservations", entity_id=reservation.id
    )
    create_notification(
        db,
        audience="all",
        event="booking_request_rejected",
        message=f"Solicitud de {reservation.guest_name} rechazada — cuarto {room.number}",
        meta={"room": room.number, "guest": reservation.guest_name},
    )
    db.commit()
    db.refresh(reservation)

    publish_event(
        "booking_request_rejected", audiences=["all"], payload={"room": room.number, "guest": reservation.guest_name}
    )
    return reservation


@router.patch("/{reservation_id}/checkout", response_model=ReservationOut)
def checkout(
    reservation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reserva no encontrada")
    if reservation.status != ReservationStatus.active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La reserva no está activa")

    room = db.get(Room, reservation.room_id)
    reservation.status = ReservationStatus.checked_out
    room.status = RoomStatus.cleaning

    log_activity(
        db, user_id=current_user.id, action="reservation.checked_out", entity="reservations", entity_id=reservation.id
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Check-out de {reservation.guest_name} — cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
        meta={"room": room.number, "status": room.status.value},
    )
    db.commit()
    db.refresh(reservation)

    publish_event("room_status_changed", audiences=["all"], payload={"room": room.number, "status": room.status.value})
    return reservation
