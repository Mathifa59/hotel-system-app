from app.models.enums import RoomType

# Aforo máximo por tipo de cuarto, derivado de la configuración de camas.
# Si cambia la realidad del hotel, editar acá (es lo único que valida cuántos
# huéspedes admite cada tipo al crear una reserva).
ROOM_CAPACITY: dict[RoomType, int] = {
    RoomType.individual: 1,
    RoomType.doble: 2,
    RoomType.doble_deluxe: 2,
    RoomType.doble_deluxe_twin: 2,
    RoomType.deluxe_extragrande: 2,
    RoomType.triple: 3,
}
