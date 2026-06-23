import enum


class UserRole(str, enum.Enum):
    admin = "admin"
    reception = "reception"
    cleaning = "cleaning"


class RoomType(str, enum.Enum):
    single = "single"
    double = "double"
    suite = "suite"


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


class ChargeStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    billed = "billed"


class ReservationStatus(str, enum.Enum):
    pending = "pending"
    active = "active"
    checked_out = "checked_out"
    cancelled = "cancelled"


class ReservationSource(str, enum.Enum):
    staff = "staff"
    website = "website"
