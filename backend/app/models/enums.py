import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    reception = "reception"
    cleaning = "cleaning"


class RoomType(str, enum.Enum):
    individual = "individual"
    doble = "doble"
    doble_deluxe = "doble_deluxe"
    doble_deluxe_twin = "doble_deluxe_twin"
    deluxe_extragrande = "deluxe_extragrande"
    triple = "triple"


class RoomStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    cleaning = "cleaning"
    clean = "clean"
    maintenance = "maintenance"
    do_not_disturb = "do_not_disturb"


class CleaningRequestType(str, enum.Enum):
    full = "full"
    sheets_only = "sheets_only"
    towels_only = "towels_only"
    partial = "partial"
    do_not_enter = "do_not_enter"


class CleaningRequestStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    skipped = "skipped"


class ChargeType(str, enum.Enum):
    minibar = "minibar"
    damage = "damage"
    extra_cleaning = "extra_cleaning"
    other = "other"
    room = "room"


class ChargeStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    billed = "billed"
    cancelled = "cancelled"


class ReservationStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    checked_out = "checked_out"
    cancelled = "cancelled"


class ReservationSource(str, enum.Enum):
    staff = "staff"
    website = "website"


class PaymentMethod(str, enum.Enum):
    cash = "cash"
    card = "card"
    transfer = "transfer"


class RatePlan(str, enum.Enum):
    # Tarifa estándar vs. la rebajada que se ofrece por temporada/canal — se
    # elige por reserva, no por tipo de cuarto (el mismo cuarto puede
    # venderse a cualquiera de las dos según el caso).
    professional = "professional"
    promotional = "promotional"
