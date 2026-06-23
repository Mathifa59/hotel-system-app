"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cleaningStatusLabel, cleaningTypeLabel, formatDateTime, reservationStatusLabel, roomStatusLabel, roomTypeLabel } from "@/lib/labels";
import type { ActivityLogEntry, CleaningRequestType, Room, RoomHistory, RoomStatus } from "@/lib/types";
import { Modal } from "./Modal";
import { RoomBadge } from "./RoomBadge";

const STATUSES: RoomStatus[] = ["available", "occupied", "cleaning", "clean", "maintenance", "do_not_disturb"];
const REQUEST_TYPES: CleaningRequestType[] = ["full", "sheets_only", "towels_only", "partial", "do_not_enter"];

type TimelineItem = { date: string; label: string; detail?: string };

// El backend registra acciones internas como "room.status_changed" — aquí se
// traducen a algo que un recepcionista o camarista realmente entienda.
function activityLabel(a: ActivityLogEntry): string {
  switch (a.action) {
    case "room.created":
      return "Cuarto creado";
    case "room.status_changed": {
      const status = a.meta?.status as RoomStatus | undefined;
      return status ? `Cuarto cambió a ${roomStatusLabel[status]}` : "Cambió el estado del cuarto";
    }
    default:
      return "Actualización del cuarto";
  }
}

function buildTimeline(history: RoomHistory): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const r of history.reservations) {
    items.push({
      date: r.created_at,
      label: `Reserva — ${r.guest_name}${r.guest_id_document ? ` (ID ${r.guest_id_document})` : ""}`,
      detail: `${reservationStatusLabel[r.status]} · ${formatDateTime(r.check_in)} → ${formatDateTime(r.check_out)}`,
    });
  }
  for (const c of history.cleaning_requests) {
    items.push({
      date: c.created_at,
      label: `Limpieza — ${cleaningTypeLabel[c.request_type]}`,
      detail: cleaningStatusLabel[c.status],
    });
  }
  for (const a of history.activity) {
    items.push({
      date: a.created_at,
      label: activityLabel(a),
      detail: a.actor_name ? `por ${a.actor_name}` : undefined,
    });
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function RoomDetailModal({
  room,
  token,
  canEditStatus,
  onClose,
  onUpdated,
}: {
  room: Room;
  token: string;
  canEditStatus: boolean;
  onClose: () => void;
  onUpdated: (room: Room) => void;
}) {
  const [requestType, setRequestType] = useState<CleaningRequestType>("full");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<RoomHistory | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (!history) {
      setLoadingHistory(true);
      try {
        setHistory(await api.get<RoomHistory>(`/rooms/${room.id}/history`, token));
      } finally {
        setLoadingHistory(false);
      }
    }
  }

  async function changeStatus(status: RoomStatus) {
    setError(null);
    try {
      const updated = await api.patch<Room>(`/rooms/${room.id}/status`, { status }, token);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado");
    }
  }

  async function createRequest() {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await api.post(
        "/housekeeping/requests",
        { room_id: room.id, request_type: requestType, notes: notes || undefined },
        token
      );
      setMessage("Solicitud de limpieza creada.");
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la solicitud");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Cuarto ${room.number}`} onClose={onClose}>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-parchment-dim">{roomTypeLabel[room.type]}</p>
        <RoomBadge status={room.status} />
      </div>

      {canEditStatus && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-dim">Cambiar estado</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                disabled={s === room.status}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  s === room.status
                    ? "border-brass/50 bg-brass/15 text-brass"
                    : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
                }`}
              >
                {roomStatusLabel[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-border-warm/50 pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-dim">Solicitar limpieza</p>
        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as CleaningRequestType)}
          className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        >
          {REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {cleaningTypeLabel[t]}
            </option>
          ))}
        </select>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notas (opcional)"
          className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
        {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}
        {message && <p className="mb-3 text-sm text-room-available">{message}</p>}
        <button
          onClick={createRequest}
          disabled={submitting}
          className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
        >
          {submitting ? "Creando…" : "Crear solicitud"}
        </button>
      </div>

      <div className="mt-4 border-t border-border-warm/50 pt-4">
        <button
          onClick={toggleHistory}
          className="text-xs font-medium uppercase tracking-wide text-parchment-dim transition hover:text-brass"
        >
          {showHistory ? "Ocultar historial ↑" : "Ver historial ↓"}
        </button>

        {showHistory && (
          <div className="mt-3 max-h-56 space-y-2.5 overflow-y-auto pr-1">
            {loadingHistory && <p className="text-sm text-parchment-dim">Cargando…</p>}
            {history &&
              buildTimeline(history).map((item, i) => (
                <div key={i} className="border-l border-border-warm pl-3">
                  <p className="text-xs text-parchment">{item.label}</p>
                  <p className="text-[11px] text-parchment-dim">
                    {formatDateTime(item.date)}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </p>
                </div>
              ))}
            {history && buildTimeline(history).length === 0 && (
              <p className="text-sm text-parchment-dim">Sin historial todavía.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
