import type {
  ChargeStatus,
  CleaningRequestStatus,
  CleaningRequestType,
  ReservationStatus,
  Role,
  RoomStatus,
  RoomType,
} from "./types";

export const roleLabel: Record<Role, string> = {
  admin: "Admin",
  reception: "Recepción",
  cleaning: "Limpieza",
};

export const roomStatusLabel: Record<RoomStatus, string> = {
  available: "Disponible",
  occupied: "Ocupado",
  cleaning: "En limpieza",
  clean: "Limpio",
  maintenance: "Mantenimiento",
  do_not_disturb: "No molestar",
};

export const roomStatusColor: Record<RoomStatus, string> = {
  available: "var(--color-room-available)",
  occupied: "var(--color-room-occupied)",
  cleaning: "var(--color-room-cleaning)",
  clean: "var(--color-room-clean)",
  maintenance: "var(--color-room-maintenance)",
  do_not_disturb: "var(--color-room-dnd)",
};

export const roomTypeLabel: Record<RoomType, string> = {
  single: "Individual",
  double: "Doble",
  suite: "Suite",
};

export const cleaningTypeLabel: Record<CleaningRequestType, string> = {
  full: "Completa",
  sheets_only: "Solo sábanas",
  towels_only: "Solo toallas",
  partial: "Parcial",
  do_not_enter: "No ingresar",
};

export const cleaningStatusLabel: Record<CleaningRequestStatus, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  skipped: "Omitida",
};

export const chargeStatusLabel: Record<ChargeStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  billed: "Cobrado",
};

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  pending: "Por entrar",
  active: "Activa",
  checked_out: "Check-out",
  cancelled: "Cancelada",
};

export function formatMoney(value: string | number): string {
  return `$${Number(value).toFixed(2)}`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}
