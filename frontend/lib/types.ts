export type Role = "admin" | "reception" | "cleaning";
export type RoomStatus = "available" | "occupied" | "cleaning" | "clean" | "maintenance" | "do_not_disturb";
export type RoomType = "individual" | "doble" | "doble_deluxe" | "doble_deluxe_twin" | "deluxe_extragrande" | "triple";
export type RatePlan = "professional" | "promotional";
export type CleaningRequestType = "full" | "sheets_only" | "towels_only" | "partial" | "do_not_enter";
export type CleaningRequestStatus = "pending" | "in_progress" | "completed" | "skipped";
export type ChargeType = "minibar" | "damage" | "extra_cleaning" | "other" | "room";
export type ChargeStatus = "pending" | "approved" | "billed" | "cancelled";
export type ReservationStatus = "pending" | "active" | "checked_out" | "cancelled";
export type ReservationSource = "staff" | "website";
export type PaymentMethod = "cash" | "card" | "transfer";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  number: string;
  floor: number;
  type: RoomType;
  status: RoomStatus;
  has_minibar: boolean;
  notes: string | null;
}

export interface CleaningRequest {
  id: string;
  room_id: string;
  reservation_id: string | null;
  request_type: CleaningRequestType;
  status: CleaningRequestStatus;
  assigned_to: string | null;
  requested_by: string;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MinibarProduct {
  id: string;
  name: string;
  price_pen: string;
  price_usd: string;
  cost: string;
  is_active: boolean;
}

export interface StockItem {
  id: string;
  room_id: string;
  product_id: string;
  quantity: number;
  initial_quantity: number;
  updated_at: string;
}

export interface Charge {
  id: string;
  reservation_id: string;
  type: ChargeType;
  description: string;
  amount_pen: string;
  amount_usd: string;
  status: ChargeStatus;
  created_by: string;
  created_at: string;
  // Fecha en que ocurrió el consumo, que puede diferir de created_at cuando
  // se registra una estadía pasada. Es la que usan los reportes.
  occurred_at: string;
}

export interface RoomTypeRate {
  type: RoomType;
  price_pen: number;
  price_usd: number;
  // Nulos cuando ese tipo no tiene tarifa promocional cargada — en ese caso
  // se cobra la profesional (ver _rate_for_plan en el backend).
  price_pen_promo: number | null;
  price_usd_promo: number | null;
}

export interface Reservation {
  id: string;
  room_id: string | null;
  requested_room_type: RoomType | null;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_id_document: string | null;
  notes: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  rate_plan: RatePlan;
  status: ReservationStatus;
  source: ReservationSource;
  confirmed: boolean;
  created_by: string | null;
  created_at: string;
  payment_method: PaymentMethod | null;
  payment_amount_pen: string | null;
  payment_amount_usd: string | null;
  paid_at: string | null;
}

export interface ReservationFolio {
  nights: number;
  rate_plan: RatePlan;
  room_charge_pen: string;
  room_charge_usd: string;
  charges: Charge[];
  total_pen: string;
  total_usd: string;
}

export interface OccupancyReport {
  counts: Record<RoomStatus, number>;
  total_rooms: number;
  occupancy_rate: number;
}

export interface MinibarReportItem {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_revenue_pen: string;
  total_revenue_usd: string;
}

export interface MinibarReport {
  items: MinibarReportItem[];
  total_revenue_pen: string;
  total_revenue_usd: string;
}

export interface IncomeReportItem {
  type: ChargeType;
  total_pen: string;
  total_usd: string;
}

export interface IncomeReport {
  items: IncomeReportItem[];
  total_pen: string;
  total_usd: string;
}

export interface StatsKpis {
  total_revenue_pen: string;
  total_revenue_usd: string;
  lodging_revenue_pen: string;
  lodging_revenue_usd: string;
  extras_revenue_pen: string;
  extras_revenue_usd: string;
  nights_sold: number;
  available_room_nights: number;
  occupancy_rate: number;
  adr_pen: string;
  adr_usd: string;
  revpar_pen: string;
  revpar_usd: string;
  arrivals: number;
  guests: number;
  avg_nights: number;
}

export interface StatsBucket {
  key: string;
  label: string;
  nights: number;
  revenue_pen: string;
  revenue_usd: string;
}

export interface StatsDailyPoint {
  day: string;
  lodging_pen: string;
  lodging_usd: string;
  extras_pen: string;
  extras_usd: string;
}

export interface StatsReport {
  start: string;
  end: string;
  kpis: StatsKpis;
  daily: StatsDailyPoint[];
  by_room_type: StatsBucket[];
  by_rate_plan: StatsBucket[];
  by_room: StatsBucket[];
  by_source: StatsBucket[];
  extras_by_type: IncomeReportItem[];
}

export interface RealtimeEvent {
  event: string;
  ts: string;
  [key: string]: unknown;
}

export interface RoomHistory {
  reservations: Reservation[];
}

export interface AppNotification {
  id: string;
  event: string;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  read: boolean;
}
