from pydantic import BaseModel

from app.schemas.reservation import ReservationOut


class RoomHistory(BaseModel):
    # Antes mezclaba reservas + limpiezas + cargos + cada entrada cruda del
    # log de actividad en una sola lista — demasiado ruido para ser útil en
    # la práctica. Ahora es solo el historial de reservas del cuarto.
    reservations: list[ReservationOut]
