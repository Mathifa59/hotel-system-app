"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import type { RatePlan, Reservation, RealtimeEvent, Room, RoomHistory } from "@/lib/types";
import { formatDateTime, ratePlanLabel, reservationStatusLabel, roomTypeLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";
import { DateTimeField } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";
import { RoomReservationHistory } from "@/components/RoomReservationHistory";
import { SiteRequestsPanel, roomOrWaitlistLabel } from "@/components/SiteRequestsPanel";
import { CheckoutModal } from "@/components/CheckoutModal";
import { CreateReservationModal, RatePlanToggle, CHECKOUT_TIMES } from "@/components/CreateReservationModal";

const NAV = [
  { href: "/reception", label: "Cuartos" },
  { href: "/reception/reservas", label: "Reservas" },
  { href: "/reception/cargos", label: "Cargos" },
];

// Señales por fecha: una reserva activa cuya salida ya pasó (el huésped debió
// irse) o una pendiente cuya llegada ya pasó (no se presentó). Devuelve null si
// no hay nada que señalar.
function dateSignal(r: Reservation): string | null {
  const now = Date.now();
  if (r.status === "active" && new Date(r.check_out).getTime() < now) return "Salida vencida";
  if (r.status === "pending" && new Date(r.check_in).getTime() < now) return "No llegó";
  return null;
}

export default function ReservationsPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [creating, setCreating] = useState(false);
  const [initialRoomId, setInitialRoomId] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [siteRequestsRefresh, setSiteRequestsRefresh] = useState(0);
  const [checkingOut, setCheckingOut] = useState<Reservation | null>(null);
  const [viewingRoomHistory, setViewingRoomHistory] = useState<Room | null>(null);

  const noShowCount = reservations.filter((r) => dateSignal(r) === "No llegó").length;

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<Reservation[]>("/reservations", token)
      .then(setReservations)
      .catch(() => toast.error("No se pudieron cargar las reservas."));
    api
      .get<Room[]>("/rooms", token)
      .then((list) => setRooms(Object.fromEntries(list.map((r) => [r.id, r]))))
      .catch(() => toast.error("No se pudieron cargar los cuartos."));
  }, [token, toast]);

  useEffect(load, [load]);

  // Cuando recepción marca un cuarto "Ocupado" desde el mapa de cuartos y
  // confirma que quiere crear la reserva, RoomDetailModal navega acá con
  // estos parámetros — se abre "Nueva reserva" con el cuarto ya elegido, en
  // vez de que recepción tenga que buscarlo de nuevo en el selector.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openReservation") === "1") {
      const roomId = params.get("roomId");
      if (roomId) setInitialRoomId(roomId);
      setCreating(true);
      window.history.replaceState(null, "", "/reception/reservas");
    }
  }, []);
  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "booking_request_created") {
      setSiteRequestsRefresh((n) => n + 1);
    }
    // Si alguien confirma/rechaza desde otra pantalla (ej. el admin), esta
    // lista también debe reflejarlo sin que recepción tenga que recargar.
    if (event.event === "booking_request_confirmed" || event.event === "booking_request_rejected") {
      load();
    }
  });

  async function checkin(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/reservations/${id}/checkin`, undefined, token);
      toast.success("Check-in registrado — el cuarto quedó ocupado.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo hacer el check-in.");
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    if (!token) return;
    if (!window.confirm("¿Cancelar esta reserva y liberar el cuarto?")) return;
    setBusy(id);
    try {
      await api.patch(`/reservations/${id}/cancel`, undefined, token);
      toast.success("Reserva cancelada.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cancelar la reserva.");
    } finally {
      setBusy(null);
    }
  }

  async function liberarNoShows() {
    if (!token) return;
    if (!window.confirm(`¿Cancelar ${noShowCount} reserva(s) que no se presentaron y liberar esos cuartos?`)) return;
    try {
      await api.post("/reservations/expire-no-shows", undefined, token);
      toast.success(`Se liberaron ${noShowCount} cuarto(s) de reservas no presentadas.`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron liberar los no-shows.");
    }
  }

  return (
    <DashboardShell title="Recepción" nav={NAV} connected={connected}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl italic text-parchment">Reservas</h1>
        <div className="flex items-center gap-2">
          {noShowCount > 0 && (
            <button
              onClick={liberarNoShows}
              className="rounded-lg border border-room-maintenance/40 px-4 py-2 text-sm font-medium text-room-maintenance transition hover:bg-room-maintenance/10"
            >
              Liberar no-shows ({noShowCount})
            </button>
          )}
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright"
          >
            + Nueva reserva
          </button>
        </div>
      </div>

      {token && <SiteRequestsPanel token={token} refreshSignal={siteRequestsRefresh} onResolved={load} />}

      <div className="space-y-2">
        {reservations
          .filter((r) => r.confirmed || r.status !== "pending" || r.source !== "website")
          // Una vez con check-out o cancelada, la reserva ya no es algo sobre
          // lo que recepción tenga que actuar — queda en el historial del
          // cuarto, no aquí, para no acumular filas muertas en esta lista.
          .filter((r) => r.status !== "checked_out" && r.status !== "cancelled")
          .map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-warm bg-surface p-4">
            <div>
              <p className="text-sm text-parchment">
                {r.guest_name} · {roomOrWaitlistLabel(r, rooms)}
                <span className="text-parchment-dim"> · {r.guests} huésped(es)</span>
                {r.guest_id_document && <span className="text-parchment-dim"> · ID {r.guest_id_document}</span>}
                {!r.room_id && (
                  <span className="ml-2 rounded-full bg-room-maintenance/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-room-maintenance">
                    Sin cuarto
                  </span>
                )}
              </p>
              <p className="text-[11px] text-parchment-dim">
                {formatDateTime(r.check_in)} → {formatDateTime(r.check_out)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {dateSignal(r) && (
                <span className="rounded-full bg-room-maintenance/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-room-maintenance">
                  {dateSignal(r)}
                </span>
              )}
              <span className="rounded-full bg-ink/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-parchment-dim">
                {reservationStatusLabel[r.status]}
              </span>
              {(r.status === "pending" || r.status === "active") && (
                <button
                  onClick={() => setEditing(r)}
                  disabled={busy === r.id}
                  className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-50"
                >
                  Editar
                </button>
              )}
              {r.status === "pending" && (
                <>
                  <button
                    onClick={() => checkin(r.id)}
                    disabled={busy === r.id || !r.room_id}
                    title={!r.room_id ? "Asigna un cuarto primero (Editar)" : undefined}
                    className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
                  >
                    Check-in
                  </button>
                  <button
                    onClick={() => cancel(r.id)}
                    disabled={busy === r.id}
                    className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-room-maintenance/40 hover:text-room-maintenance disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </>
              )}
              {r.status === "active" && (
                <button
                  onClick={() => setCheckingOut(r)}
                  disabled={busy === r.id}
                  className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-50"
                >
                  Check-out
                </button>
              )}
              {r.room_id && rooms[r.room_id] && (
                <button
                  onClick={() => setViewingRoomHistory(rooms[r.room_id!])}
                  className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass"
                >
                  Historial del cuarto
                </button>
              )}
            </div>
          </div>
        ))}
        {reservations.length === 0 && <p className="text-sm text-parchment-dim">No hay reservas registradas.</p>}
      </div>

      {creating && token && (
        <CreateReservationModal
          token={token}
          rooms={Object.values(rooms)}
          initialRoomId={initialRoomId}
          onClose={() => {
            setCreating(false);
            setInitialRoomId(undefined);
          }}
          onCreated={(res) => setReservations((prev) => [res, ...prev])}
        />
      )}

      {editing && token && (
        <EditReservationModal
          token={token}
          reservation={editing}
          rooms={Object.values(rooms)}
          onClose={() => setEditing(null)}
          onUpdated={(updated) => {
            setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(null);
          }}
        />
      )}

      {checkingOut && token && (
        <CheckoutModal
          reservation={checkingOut}
          token={token}
          onClose={() => setCheckingOut(null)}
          onConfirmed={(updated) => {
            setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setCheckingOut(null);
          }}
        />
      )}

      {viewingRoomHistory && token && (
        <RoomHistoryModal room={viewingRoomHistory} token={token} onClose={() => setViewingRoomHistory(null)} />
      )}
    </DashboardShell>
  );
}

// Historial de reservas de un cuarto, consultable directamente desde la
// pestaña de Reservas (antes solo se veía abriendo el cuarto en el mapa).
function RoomHistoryModal({ room, token, onClose }: { room: Room; token: string; onClose: () => void }) {
  const [history, setHistory] = useState<RoomHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<RoomHistory>(`/rooms/${room.id}/history`, token)
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [room.id, token]);

  return (
    <Modal title={`Historial — Cuarto ${room.number}`} onClose={onClose}>
      {loading && <p className="text-sm text-parchment-dim">Cargando…</p>}
      {history && <RoomReservationHistory reservations={history.reservations} />}
    </Modal>
  );
}

// Convierte un ISO en UTC al formato local que espera un <input datetime-local>.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function EditReservationModal({
  token,
  reservation,
  rooms,
  onClose,
  onUpdated,
}: {
  token: string;
  reservation: Reservation;
  rooms: Room[];
  onClose: () => void;
  onUpdated: (r: Reservation) => void;
}) {
  const [roomId, setRoomId] = useState(reservation.room_id ?? "");
  const [guestName, setGuestName] = useState(reservation.guest_name);
  const [guestPhone, setGuestPhone] = useState(reservation.guest_phone ?? "");
  const [guestIdDocument, setGuestIdDocument] = useState(reservation.guest_id_document ?? "");
  const [guests, setGuests] = useState(reservation.guests);
  const [ratePlan, setRatePlan] = useState<RatePlan>(reservation.rate_plan);
  const [checkIn, setCheckIn] = useState(toLocalInput(reservation.check_in));
  const [checkOut, setCheckOut] = useState(toLocalInput(reservation.check_out));
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!guestName.trim()) return toast.error("Escribe el nombre del huésped.");
    if (!checkIn) return toast.error("Falta la fecha de check-in.");
    if (!checkOut) return toast.error("Falta la fecha de check-out.");
    if (new Date(checkOut) <= new Date(checkIn)) return toast.error("El check-out debe ser posterior al check-in.");

    setSubmitting(true);
    try {
      const updated = await api.patch<Reservation>(
        `/reservations/${reservation.id}`,
        {
          room_id: roomId || null,
          guest_name: guestName,
          guest_phone: guestPhone || undefined,
          guest_id_document: guestIdDocument || undefined,
          guests,
          rate_plan: ratePlan,
          check_in: new Date(checkIn).toISOString(),
          check_out: new Date(checkOut).toISOString(),
        },
        token
      );
      onUpdated(updated);
      toast.success("Reserva actualizada.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Editar reserva — ${reservation.guest_name}`} onClose={onClose}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Cuarto</label>
      <select
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className="mb-1.5 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      >
        <option value="">
          Sin asignar (lista de espera{reservation.requested_room_type ? ` — ${roomTypeLabel[reservation.requested_room_type]}` : ""})
        </option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            Cuarto {r.number}
          </option>
        ))}
      </select>
      {!roomId && (
        <p className="mb-3 text-[11px] text-room-maintenance">
          Sin cuarto asignado no se puede hacer check-in — asigna uno cuando haya disponible.
        </p>
      )}

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huésped</label>
      <input
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
        Identificación (INE, pasaporte, etc.) — opcional
      </label>
      <input
        value={guestIdDocument}
        onChange={(e) => setGuestIdDocument(e.target.value)}
        placeholder="Número de documento"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Teléfono (opcional)</label>
      <input
        value={guestPhone}
        onChange={(e) => setGuestPhone(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huéspedes</label>
      <input
        type="number"
        min={1}
        value={guests}
        onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Tarifa</label>
      <div className="mb-3">
        <RatePlanToggle value={ratePlan} onChange={setRatePlan} />
      </div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:gap-2">
        <div className="w-full sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-in</label>
          <DateTimeField value={checkIn} onChange={setCheckIn} />
        </div>
        <div className="w-full sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-out</label>
          <DateTimeField value={checkOut} onChange={setCheckOut} presetTimes={CHECKOUT_TIMES} />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Guardando…" : "Guardar cambios"}
      </button>
    </Modal>
  );
}
