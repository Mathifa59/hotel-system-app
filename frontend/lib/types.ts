export type Role = "admin" | "reception" | "cleaning";
export type RoomStatus = "available" | "occupied" | "cleaning" | "clean" | "maintenance" | "do_not_disturb";
export type RoomType = "individual" | "doble" | "doble_deluxe" | "doble_deluxe_twin" | "deluxe_extragrande";
export type CleaningRequestType = "full" | "sheets_only" | "towels_only" | "partial" | "do_not_enter";
export type CleaningRequestStatus = "pending" | "in_progress" | "completed" | "skipped";
export type ChargeType = "minibar" | "damage" | "extra_cleaning" | "other" | "room";
export type ChargeStatus = "pending" | "approved" | "billed" | "cancelled";
export type ReservationStatus = "pending" | "active" | "checked_out" | "cancelled";
export type ReservationSource = "staff" | "website";

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
}

export interface Reservation {
  id: string;
  room_id: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  guest_id_document: string | null;
  notes: string | null;
  check_in: string;
  check_out: string;
  guests: number;
  status: ReservationStatus;
  source: ReservationSource;
  confirmed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ReservationFolio {
  nights: number;
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

export interface RealtimeEvent {
  event: string;
  ts: string;
  [key: string]: unknown;
}

export interface ActivityLogEntry {
  action: string;
  meta: Record<string, unknown> | null;
  actor_name: string | null;
  created_at: string;
}

export interface RoomHistory {
  reservations: Reservation[];
  cleaning_requests: CleaningRequest[];
  activity: ActivityLogEntry[];
}

export interface AppNotification {
  id: string;
  event: string;
  message: string;
  meta: Record<string, unknown> | null;
  created_at: string;
  read: boolean;
}
