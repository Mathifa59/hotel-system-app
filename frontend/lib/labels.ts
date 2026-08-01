import type {
  ChargeStatus,
  ChargeType,
  CleaningRequestStatus,
  CleaningRequestType,
  PaymentMethod,
  RatePlan,
  ReservationStatus,
  Role,
  RoomStatus,
  RoomType,
} from "./types";
import type { Currency } from "./currency";

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
  individual: "Individual",
  doble: "Doble",
  doble_deluxe: "Doble Deluxe",
  doble_deluxe_twin: "Doble Deluxe - 2 camas",
  deluxe_extragrande: "Deluxe con cama extragrande",
  triple: "Triple",
};

export const ratePlanLabel: Record<RatePlan, string> = {
  professional: "Profesional",
  promotional: "Promocional",
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
  cancelled: "Anulado",
};

export const chargeTypeLabel: Record<ChargeType, string> = {
  room: "Alojamiento",
  minibar: "Frigobar",
  damage: "Daño",
  extra_cleaning: "Limpieza extra",
  other: "Otro",
};

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  pending: "Por entrar",
  active: "Activa",
  checked_out: "Check-out",
  cancelled: "Cancelada",
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  yape: "Yape",
};

// Solo para el voucher de reserva, que es bilingüe porque el hotel recibe
// huéspedes extranjeros — el resto de la app es español puro, así que estas
// dos tablas no se usan en ningún otro lado.
export const roomTypeLabelEn: Record<RoomType, string> = {
  individual: "Single",
  doble: "Double",
  doble_deluxe: "Double Deluxe",
  doble_deluxe_twin: "Double Deluxe - 2 beds",
  deluxe_extragrande: "Deluxe with extra-large bed",
  triple: "Triple",
};

export const paymentMethodLabelEn: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Bank transfer",
  yape: "Yape",
};

export function formatMoney(amounts: { pen: string | number; usd: string | number }, currency: Currency): string {
  const value = currency === "PEN" ? amounts.pen : amounts.usd;
  const symbol = currency === "PEN" ? "S/" : "$";
  return `${symbol} ${Number(value).toFixed(2)}`;
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}
