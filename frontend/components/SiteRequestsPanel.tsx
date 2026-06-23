"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Reservation, Room } from "@/lib/types";
import { formatDateTime, roomTypeLabel } from "@/lib/labels";

export function SiteRequestsPanel({
  token,
  refreshSignal,
  emptyMessage,
}: {
  token: string;
  refreshSignal?: number;
  emptyMessage?: string;
}) {
  const [requests, setRequests] = useState<Reservation[]>([]);
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Reservation[]>("/reservations?source=website&status=pending", token)
      .then((list) => setRequests(list.filter((r) => !r.confirmed)));
    api.get<Room[]>("/rooms", token).then((list) => setRooms(Object.fromEntries(list.map((r) => [r.id, r]))));
  }, [token]);

  useEffect(load, [load, refreshSignal]);

  async function confirm(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.patch(`/reservations/${id}/confirm`, undefined, token);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la solicitud");
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.patch(`/reservations/${id}/reject`, undefined, token);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo rechazar la solicitud");
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) {
    return emptyMessage ? <p className="text-sm text-parchment-dim">{emptyMessage}</p> : null;
  }

  return (
    <div className="mb-6 space-y-2">
      <h2 className="font-display text-lg italic text-parchment">
        Solicitudes del sitio web <span className="text-sm text-parchment-dim">({requests.length})</span>
      </h2>
      {error && <p className="text-sm text-room-maintenance">{error}</p>}
      {requests.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brass/30 bg-surface-raised p-4"
        >
          <div>
            <p className="text-sm text-parchment">
              {r.guest_name} · cuarto {rooms[r.room_id]?.number ?? "—"}
              {rooms[r.room_id] && <span className="text-parchment-dim"> ({roomTypeLabel[rooms[r.room_id].type]})</span>}
            </p>
            <p className="text-[11px] text-parchment-dim">
              {formatDateTime(r.check_in)} → {formatDateTime(r.check_out)}
              {r.guest_email && <span> · {r.guest_email}</span>}
              {r.guest_phone && <span> · {r.guest_phone}</span>}
            </p>
            {r.notes && <p className="mt-1 text-[11px] italic text-parchment-dim">“{r.notes}”</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => confirm(r.id)}
              disabled={busy === r.id}
              className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              onClick={() => reject(r.id)}
              disabled={busy === r.id}
              className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-room-maintenance/40 hover:text-room-maintenance disabled:opacity-50"
            >
              Rechazar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
