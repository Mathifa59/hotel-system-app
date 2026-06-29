import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models.activity_log import ActivityLog
from app.models.charge import Charge
from app.models.cleaning_request import CleaningRequest
from app.models.enums import CleaningRequestStatus, RoomStatus, RoomType, UserRole
from app.models.reservation import Reservation
from app.models.room import Room, RoomTypeRate
from app.models.user import User
from app.schemas.activity_log import ActivityLogOut, RoomHistory
from app.schemas.room import RoomCreate, RoomOut, RoomStatusUpdate, RoomTypeRateOut, RoomTypeRateUpdate, RoomUpdate
from app.services.activity_log import log_activity
from app.services.events import publish_event
from app.services.labels import ROOM_STATUS_LABEL
from app.services.notifications import create_notification

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=list[RoomOut])
def list_rooms(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Room).order_by(Room.number).all()


@router.get("/rates", response_model=list[RoomTypeRateOut])
def list_rates(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(RoomTypeRate).order_by(RoomTypeRate.type).all()


@router.put("/rates/{room_type}", response_model=RoomTypeRateOut)
def update_rate(
    room_type: RoomType,
    data: RoomTypeRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    rate = db.get(RoomTypeRate, room_type)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de habitación no encontrado")

    rate.price_pen = data.price_pen
    rate.price_usd = data.price_usd
    log_activity(
        db,
        user_id=current_user.id,
        action="room_type_rate.updated",
        entity="room_type_rates",
        meta={"type": room_type.value, "price_pen": data.price_pen, "price_usd": data.price_usd},
    )
    db.commit()
    db.refresh(rate)
    return rate


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def create_room(
    data: RoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    if db.query(Room).filter(Room.number == data.number).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un cuarto con ese número")

    room = Room(**data.model_dump())
    db.add(room)
    db.flush()
    log_activity(db, user_id=current_user.id, action="room.created", entity="rooms", entity_id=room.id)
    db.commit()
    return room


@router.patch("/{room_id}", response_model=RoomOut)
def update_room(
    room_id: uuid.UUID,
    data: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    changes = data.model_dump(exclude_unset=True)
    if "number" in changes and changes["number"] != room.number:
        if db.query(Room).filter(Room.number == changes["number"], Room.id != room_id).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ya existe un cuarto con ese número")

    for field, value in changes.items():
        setattr(room, field, value)

    log_activity(
        db,
        user_id=current_user.id,
        action="room.updated",
        entity="rooms",
        entity_id=room.id,
        meta=changes,
    )
    db.commit()
    db.refresh(room)
    return room


@router.patch("/{room_id}/status", response_model=RoomOut)
def update_room_status(
    room_id: uuid.UUID,
    data: RoomStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    room.status = data.status
    log_activity(
        db,
        user_id=current_user.id,
        action="room.status_changed",
        entity="rooms",
        entity_id=room.id,
        meta={"status": data.status.value},
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Cuarto {room.number} cambió a {ROOM_STATUS_LABEL[data.status]}",
        meta={"room": room.number, "status": data.status.value},
    )
    db.commit()
    db.refresh(room)

    publish_event(
        "room_status_changed",
        audiences=["all"],
        payload={"room": room.number, "status": room.status.value},
    )
    return room


@router.patch("/{room_id}/mark-clean", response_model=RoomOut)
def mark_clean(
    room_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.cleaning)),
):
    """Acción rápida para el housekeeper desde el mapa de cuartos: marca el
    cuarto como limpio directamente — no tiene sentido que limpieza "solicite"
    una limpieza para sí misma. Si hay una tarea pendiente o en curso para
    este cuarto, se cierra junto con el cuarto para que "Mis tareas" quede
    sincronizado sin un paso aparte de tomar y completar."""
    room = db.get(Room, room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    pending_request = (
        db.query(CleaningRequest)
        .filter(
            CleaningRequest.room_id == room_id,
            CleaningRequest.status.in_([CleaningRequestStatus.pending, CleaningRequestStatus.in_progress]),
        )
        .order_by(CleaningRequest.created_at.desc())
        .first()
    )
    now = datetime.now(timezone.utc)
    if pending_request is not None:
        pending_request.status = CleaningRequestStatus.completed
        pending_request.completed_at = now
        pending_request.assigned_to = current_user.id
        if pending_request.started_at is None:
            pending_request.started_at = now

    room.status = RoomStatus.clean
    log_activity(
        db, user_id=current_user.id, action="room.status_changed", entity="rooms", entity_id=room.id,
        meta={"status": room.status.value},
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
        meta={"room": room.number, "status": room.status.value},
    )
    db.commit()
    db.refresh(room)

    publish_event("room_status_changed", audiences=["all"], payload={"room": room.number, "status": room.status.value})
    if pending_request is not None:
        publish_event(
            "cleaning_request_completed",
            audiences=["reception", "admin"],
            payload={"id": str(pending_request.id), "room": room.number},
        )
    return room


@router.get("/{room_id}/history", response_model=RoomHistory)
def room_history(
    room_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception, UserRole.cleaning)),
):
    if db.get(Room, room_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    reservations = (
        db.query(Reservation).filter(Reservation.room_id == room_id).order_by(Reservation.created_at.desc()).all()
    )
    cleaning_requests = (
        db.query(CleaningRequest)
        .filter(CleaningRequest.room_id == room_id)
        .order_by(CleaningRequest.created_at.desc())
        .all()
    )
    charges = (
        db.query(Charge)
        .filter(Charge.reservation_id.in_([r.id for r in reservations]))
        .order_by(Charge.created_at.desc())
        .all()
        if reservations
        else []
    )
    activity_rows = (
        db.query(ActivityLog, User.name)
        .outerjoin(User, User.id == ActivityLog.user_id)
        .filter(ActivityLog.entity == "rooms", ActivityLog.entity_id == room_id)
        .order_by(ActivityLog.created_at.desc())
        .all()
    )
    activity = [
        ActivityLogOut(action=log.action, meta=log.meta, actor_name=actor_name, created_at=log.created_at)
        for log, actor_name in activity_rows
    ]

    return RoomHistory(reservations=reservations, cleaning_requests=cleaning_requests, charges=charges, activity=activity)
