from app.models.enums import CleaningRequestType, RatePlan, ReservationSource, RoomStatus, RoomType

ROOM_TYPE_LABEL = {
    RoomType.individual: "Individual",
    RoomType.doble: "Doble",
    RoomType.doble_deluxe: "Doble Deluxe",
    RoomType.doble_deluxe_twin: "Doble Deluxe - 2 camas",
    RoomType.deluxe_extragrande: "Deluxe con cama extragrande",
    RoomType.triple: "Triple",
}

ROOM_STATUS_LABEL = {
    RoomStatus.available: "Disponible",
    RoomStatus.occupied: "Ocupado",
    RoomStatus.cleaning: "En limpieza",
    RoomStatus.clean: "Limpio",
    RoomStatus.maintenance: "Mantenimiento",
    RoomStatus.do_not_disturb: "No molestar",
}

RATE_PLAN_LABEL = {
    RatePlan.professional: "Profesional",
    RatePlan.promotional: "Promocional",
}

RESERVATION_SOURCE_LABEL = {
    ReservationSource.staff: "Recepción",
    ReservationSource.website: "Sitio web",
}

CLEANING_TYPE_LABEL = {
    CleaningRequestType.full: "Completa",
    CleaningRequestType.sheets_only: "Solo sábanas",
    CleaningRequestType.towels_only: "Solo toallas",
    CleaningRequestType.partial: "Parcial",
    CleaningRequestType.do_not_enter: "No ingresar",
}
