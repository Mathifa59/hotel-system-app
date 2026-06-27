from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import ReservationSource, ReservationStatus, RoomType
from app.models.reservation import Reservation
from app.models.room import RoomTypeRate
from app.schemas.public import AvailabilityOut, BookingRequestCreate, BookingRequestOut, RoomTypeAvailability
from app.services.activity_log import log_activity
from app.services.availability import find_available_room
from app.services.capacity import ROOM_CAPACITY
from app.services.events import publish_event
from app.services.labels import ROOM_TYPE_LABEL
from app.services.notifications import create_notification
from app.services.rate_limit import rate_limit

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/availability", response_model=AvailabilityOut, dependencies=[Depends(rate_limit(30))])
def check_availability(
    check_in: datetime = Query(...),
    check_out: datetime = Query(...),
    db: Session = Depends(get_db),
):
    if check_out <= check_in:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="check_out debe ser posterior a check_in")

    rates = {rate.type: rate for rate in db.query(RoomTypeRate).all()}
    room_types = [
        RoomTypeAvailability(
            type=t,
            available=find_available_room(db, t, check_in, check_out) is not None,
            price_pen=rates[t].price_pen,
            price_usd=rates[t].price_usd,
        )
        for t in RoomType
    ]
    return AvailabilityOut(check_in=check_in, check_out=check_out, room_types=room_types)


@router.post(
    "/booking-requests",
    response_model=BookingRequestOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(5))],
)
def create_booking_request(
    data: BookingRequestCreate,
    db: Session = Depends(get_db),
):
    # Honeypot: si el campo oculto viene lleno, es un bot. Respondemos 400
    # genérico sin crear nada ni notificar a recepción.
    if data.company:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Solicitud inválida")

    if data.check_out <= data.check_in:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="check_out debe ser posterior a check_in")

    capacity = ROOM_CAPACITY[data.room_type]
    if data.guests > capacity:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"Ese tipo de cuarto admite máximo {capacity} huésped(es)",
        )

    room = find_available_room(db, data.room_type, data.check_in, data.check_out)
    if room is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="No hay cuartos de ese tipo disponibles para esas fechas"
        )

    reservation = Reservation(
        room_id=room.id,
        guest_name=data.guest_name,
        guest_email=data.guest_email,
        guest_phone=data.guest_phone,
        check_in=data.check_in,
        check_out=data.check_out,
        guests=data.guests,
        notes=data.notes,
        status=ReservationStatus.pending,
        source=ReservationSource.website,
        confirmed=False,
    )
    db.add(reservation)
    db.flush()

    log_activity(
        db,
        user_id=None,
        action="reservation.requested_from_website",
        entity="reservations",
        entity_id=reservation.id,
        meta={"room": room.number, "guest": data.guest_name},
    )
    message = f"Nueva solicitud del sitio web — {data.guest_name}, cuarto {room.number} ({ROOM_TYPE_LABEL[room.type]})"
    for audience in ("reception", "admin"):
        create_notification(
            db,
            audience=audience,
            event="booking_request_created",
            message=message,
            meta={"id": str(reservation.id), "room": room.number, "guest": data.guest_name},
        )

    db.commit()
    db.refresh(reservation)

    publish_event(
        "booking_request_created",
        audiences=["reception", "admin"],
        payload={"id": str(reservation.id), "room": room.number, "guest": data.guest_name},
    )
    return reservation
