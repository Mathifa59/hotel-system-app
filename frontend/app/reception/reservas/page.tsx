"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api, ApiError } from "@/lib/api";
import type { Reservation, RealtimeEvent, Room } from "@/lib/types";
import { formatDateTime, reservationStatusLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";
import { Modal } from "@/components/Modal";
import { SiteRequestsPanel } from "@/components/SiteRequestsPanel";

const NAV = [
  { href: "/reception", label: "Cuartos" },
  { href: "/reception/reservas", label: "Reservas" },
  { href: "/reception/cargos", label: "Cargos" },
];

export default function ReservationsPage() {
  const { token } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [siteRequestsRefresh, setSiteRequestsRefresh] = useState(0);

  const load = useCallback(() => {
    if (!token) return;
    api.get<Reservation[]>("/reservations", token).then(setReservations);
    api.get<Room[]>("/rooms", token).then((list) => setRooms(Object.fromEntries(list.map((r) => [r.id, r]))));
  }, [token]);

  useEffect(load, [load]);
  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "booking_request_created") {
      setSiteRequestsRefresh((n) => n + 1);
    }
  });

  async function checkin(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/reservations/${id}/checkin`, undefined, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function checkout(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/reservations/${id}/checkout`, undefined, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell title="Recepción" nav={NAV} connected={connected}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl italic text-parchment">Reservas</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright"
        >
          + Nueva reserva
        </button>
      </div>

      {token && <SiteRequestsPanel token={token} refreshSignal={siteRequestsRefresh} />}

      <div className="space-y-2">
        {reservations
          .filter((r) => r.confirmed || r.status !== "pending" || r.source !== "website")
          .map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-warm bg-surface p-4">
            <div>
              <p className="text-sm text-parchment">
                {r.guest_name} · cuarto {rooms[r.room_id]?.number ?? "—"}
                {r.guest_id_document && <span className="text-parchment-dim"> · ID {r.guest_id_document}</span>}
              </p>
              <p className="text-[11px] text-parchment-dim">
                {formatDateTime(r.check_in)} → {formatDateTime(r.check_out)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-ink/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-parchment-dim">
                {reservationStatusLabel[r.status]}
              </span>
              {r.status === "pending" && (
                <button
                  onClick={() => checkin(r.id)}
                  disabled={busy === r.id}
                  className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
                >
                  Check-in
                </button>
              )}
              {r.status === "active" && (
                <button
                  onClick={() => checkout(r.id)}
                  disabled={busy === r.id}
                  className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-50"
                >
                  Check-out
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
          onClose={() => setCreating(false)}
          onCreated={(res) => setReservations((prev) => [res, ...prev])}
        />
      )}
    </DashboardShell>
  );
}

function CreateReservationModal({
  token,
  rooms,
  onClose,
  onCreated,
}: {
  token: string;
  rooms: Room[];
  onClose: () => void;
  onCreated: (r: Reservation) => void;
}) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestIdDocument, setGuestIdDocument] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const reservation = await api.post<Reservation>(
        "/reservations",
        {
          room_id: roomId,
          guest_name: guestName,
          guest_phone: guestPhone || undefined,
          guest_id_document: guestIdDocument || undefined,
          check_in: new Date(checkIn).toISOString(),
          check_out: new Date(checkOut).toISOString(),
        },
        token
      );
      onCreated(reservation);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la reserva");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nueva reserva" onClose={onClose}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Cuarto</label>
      <select
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      >
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            Cuarto {r.number}
          </option>
        ))}
      </select>

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huésped</label>
      <input
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        placeholder="Nombre completo"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
        Identificación (INE, pasaporte, etc.)
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
        placeholder="+52 55 0000 0000"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:gap-2">
        <div className="w-full sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-in</label>
          <input
            type="datetime-local"
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
        </div>
        <div className="w-full sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-out</label>
          <input
            type="datetime-local"
            value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || !roomId || !guestName || !checkIn || !checkOut}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Creando…" : "Crear reserva"}
      </button>
    </Modal>
  );
}
