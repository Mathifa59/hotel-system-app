from app.models.enums import CleaningRequestType, RoomStatus

ROOM_STATUS_LABEL = {
    RoomStatus.available: "Disponible",
    RoomStatus.occupied: "Ocupado",
    RoomStatus.cleaning: "En limpieza",
    RoomStatus.clean: "Limpio",
    RoomStatus.maintenance: "Mantenimiento",
    RoomStatus.do_not_disturb: "No molestar",
}

CLEANING_TYPE_LABEL = {
    CleaningRequestType.full: "Completa",
    CleaningRequestType.sheets_only: "Solo sábanas",
    CleaningRequestType.towels_only: "Solo toallas",
    CleaningRequestType.partial: "Parcial",
    CleaningRequestType.do_not_enter: "No ingresar",
}
