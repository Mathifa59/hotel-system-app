from datetime import datetime

from sqlalchemy.orm import Session

from app.models.enums import ReservationStatus, RoomStatus, RoomType
from app.models.reservation import Reservation
from app.models.room import Room


def find_available_room(db: Session, room_type: RoomType, check_in: datetime, check_out: datetime) -> Room | None:
    overlapping_room_ids = db.query(Reservation.room_id).filter(
        Reservation.status.in_([ReservationStatus.pending, ReservationStatus.active]),
        Reservation.check_in < check_out,
        Reservation.check_out > check_in,
    )
    return (
        db.query(Room)
        # Un cuarto en mantenimiento está fuera de servicio: no se ofrece para
        # reservar aunque no tenga reservas que se crucen con esas fechas.
        .filter(
            Room.type == room_type,
            Room.status != RoomStatus.maintenance,
            ~Room.id.in_(overlapping_room_ids),
        )
        .order_by(Room.number)
        .first()
    )
