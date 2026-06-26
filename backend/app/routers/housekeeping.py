import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.deps import get_current_user, require_role
from app.models.cleaning_request import CleaningRequest
from app.models.enums import CleaningRequestStatus, CleaningRequestType, RoomStatus, UserRole
from app.models.room import Room
from app.models.user import User
from app.schemas.cleaning_request import CleaningRequestCreate, CleaningRequestOut, CleaningRequestSkip
from app.services.activity_log import log_activity
from app.services.events import publish_event
from app.services.labels import CLEANING_TYPE_LABEL, ROOM_STATUS_LABEL
from app.services.notifications import create_notification

router = APIRouter(prefix="/housekeeping/requests", tags=["housekeeping"])

# ponytail: cuartos ocupados, en mantenimiento o "no molestar" no cambian de
# estado solo porque se crea una solicitud — el huésped o la política pueden
# bloquear el acceso. Ajustar aquí si el hotel necesita reglas más finas.
_ROOM_STATUS_BLOCKS_AUTO_CLEANING = {RoomStatus.occupied, RoomStatus.maintenance, RoomStatus.do_not_disturb}


@router.post("", response_model=CleaningRequestOut, status_code=status.HTTP_201_CREATED)
def create_request(
    data: CleaningRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin, UserRole.reception)),
):
    room = db.get(Room, data.room_id)
    if room is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cuarto no encontrado")

    request = CleaningRequest(
        room_id=data.room_id,
        reservation_id=data.reservation_id,
        request_type=data.request_type,
        notes=data.notes,
        requested_by=current_user.id,
    )
    db.add(request)

    room_status_changed = False
    if data.request_type != CleaningRequestType.do_not_enter and room.status not in _ROOM_STATUS_BLOCKS_AUTO_CLEANING:
        room.status = RoomStatus.cleaning
        room_status_changed = True

    db.flush()
    log_activity(
        db,
        user_id=current_user.id,
        action="cleaning.requested",
        entity="rooms",
        entity_id=room.id,
        meta={"request_type": data.request_type.value},
    )
    create_notification(
        db,
        audience="cleaning",
        event="cleaning_request_created",
        message=f"Nueva solicitud de limpieza ({CLEANING_TYPE_LABEL[data.request_type]}) — cuarto {room.number}",
        meta={"id": str(request.id), "room": room.number},
    )
    if room_status_changed:
        create_notification(
            db,
            audience="all",
            event="room_status_changed",
            message=f"Cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
            meta={"room": room.number, "status": room.status.value},
        )
    db.commit()
    db.refresh(request)

    publish_event(
        "cleaning_request_created",
        audiences=["cleaning"],
        payload={"id": str(request.id), "room": room.number, "request_type": request.request_type.value},
    )
    if room_status_changed:
        publish_event(
            "room_status_changed",
            audiences=["all"],
            payload={"room": room.number, "status": room.status.value},
        )
    return request


@router.get("", response_model=list[CleaningRequestOut])
def list_requests(
    assigned_to: str | None = Query(default=None, description="'me' para ver solo las propias"),
    status_filter: CleaningRequestStatus | None = Query(default=None, alias="status"),
    room_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(CleaningRequest)
    if assigned_to == "me":
        query = query.filter(CleaningRequest.assigned_to == current_user.id)
    if status_filter is not None:
        query = query.filter(CleaningRequest.status == status_filter)
    if room_id is not None:
        query = query.filter(CleaningRequest.room_id == room_id)
    return query.order_by(CleaningRequest.created_at.desc()).all()


@router.patch("/{request_id}/start", response_model=CleaningRequestOut)
def start_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.cleaning)),
):
    request = db.get(CleaningRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if request.status != CleaningRequestStatus.pending:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud ya fue tomada o cerrada")

    request.status = CleaningRequestStatus.in_progress
    request.started_at = datetime.now(timezone.utc)
    request.assigned_to = current_user.id

    room = db.get(Room, request.room_id)
    log_activity(db, user_id=current_user.id, action="cleaning.started", entity="rooms", entity_id=room.id)
    create_notification(
        db,
        audience="admin",
        event="cleaning_request_assigned",
        message=f"{current_user.name} tomó la limpieza del cuarto {room.number}",
        meta={"id": str(request.id), "room": room.number},
    )
    db.commit()
    db.refresh(request)

    publish_event(
        "cleaning_request_assigned",
        audiences=["admin"],
        payload={"id": str(request.id), "room": room.number, "assigned_to": current_user.name},
    )
    return request


@router.patch("/{request_id}/complete", response_model=CleaningRequestOut)
def complete_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.cleaning)),
):
    request = db.get(CleaningRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if request.status != CleaningRequestStatus.in_progress:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud no está en progreso")
    if request.assigned_to != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo quien la tomó puede completarla")

    request.status = CleaningRequestStatus.completed
    request.completed_at = datetime.now(timezone.utc)

    room = db.get(Room, request.room_id)
    room.status = RoomStatus.clean

    log_activity(db, user_id=current_user.id, action="cleaning.completed", entity="rooms", entity_id=room.id)
    create_notification(
        db,
        audience="reception",
        event="cleaning_request_completed",
        message=f"Limpieza completada — cuarto {room.number}",
        meta={"id": str(request.id), "room": room.number},
    )
    create_notification(
        db,
        audience="admin",
        event="cleaning_request_completed",
        message=f"Limpieza completada — cuarto {room.number}",
        meta={"id": str(request.id), "room": room.number},
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
        meta={"room": room.number, "status": room.status.value},
    )
    db.commit()
    db.refresh(request)

    publish_event(
        "cleaning_request_completed",
        audiences=["reception", "admin"],
        payload={"id": str(request.id), "room": room.number},
    )
    publish_event(
        "room_status_changed",
        audiences=["all"],
        payload={"room": room.number, "status": room.status.value},
    )
    return request


@router.patch("/{request_id}/skip", response_model=CleaningRequestOut)
def skip_request(
    request_id: uuid.UUID,
    data: CleaningRequestSkip,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.cleaning, UserRole.admin)),
):
    request = db.get(CleaningRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitud no encontrada")
    if request.status not in (CleaningRequestStatus.pending, CleaningRequestStatus.in_progress):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="La solicitud ya está cerrada")

    request.status = CleaningRequestStatus.skipped
    request.completed_at = datetime.now(timezone.utc)
    if data.notes:
        request.notes = data.notes

    room = db.get(Room, request.room_id)
    room.status = RoomStatus.do_not_disturb

    log_activity(
        db,
        user_id=current_user.id,
        action="cleaning.skipped",
        entity="rooms",
        entity_id=room.id,
        meta={"notes": data.notes} if data.notes else None,
    )
    create_notification(
        db,
        audience="all",
        event="room_status_changed",
        message=f"Limpieza omitida — cuarto {room.number} cambió a {ROOM_STATUS_LABEL[room.status]}",
        meta={"room": room.number, "status": room.status.value},
    )
    db.commit()
    db.refresh(request)

    publish_event(
        "room_status_changed",
        audiences=["all"],
        payload={"room": room.number, "status": room.status.value},
    )
    return request
