"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api, ApiError } from "@/lib/api";
import type { Reservation, Room, RoomType, RealtimeEvent } from "@/lib/types";
import { roomTypeLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";
import { RoomGrid } from "@/components/RoomGrid";
import { RoomDetailModal } from "@/components/RoomDetailModal";
import { Modal } from "@/components/Modal";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default function AdminRoomsPage() {
  const { token } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changedRoomNumbers, setChangedRoomNumbers] = useState<Set<string>>(new Set());
  const [overdueRoomNumbers, setOverdueRoomNumbers] = useState<Set<string>>(new Set());

  const loadRooms = useCallback(() => {
    if (!token) return;
    api.get<Room[]>("/rooms", token).then((roomList) => {
      setRooms(roomList);
      setLoading(false);
      const byId = Object.fromEntries(roomList.map((r) => [r.id, r.number]));
      api.get<Reservation[]>("/reservations?status=active", token).then((active) => {
        const now = Date.now();
        setOverdueRoomNumbers(
          new Set(
            active
              .filter((r) => new Date(r.check_out).getTime() < now)
              .map((r) => byId[r.room_id])
              .filter(Boolean)
          )
        );
      });
    });
  }, [token]);

  useEffect(loadRooms, [loadRooms]);

  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "room_status_changed") {
      const roomNumber = event.room as string;
      setRooms((prev) =>
        prev.map((r) => (r.number === roomNumber ? { ...r, status: event.status as Room["status"] } : r))
      );
      flagRoomChanged(roomNumber);
    }
  });

  function flagRoomChanged(roomNumber: string) {
    setChangedRoomNumbers((prev) => new Set(prev).add(roomNumber));
    setTimeout(() => {
      setChangedRoomNumbers((prev) => {
        const next = new Set(prev);
        next.delete(roomNumber);
        return next;
      });
    }, 6000);
  }

  useEffect(() => {
    if (connected) loadRooms();
  }, [connected, loadRooms]);

  return (
    <DashboardShell title="Admin" nav={NAV} connected={connected}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl italic text-parchment">Mapa de cuartos</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright"
        >
          + Nuevo cuarto
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-parchment-dim">Cargando…</p>
      ) : (
        <RoomGrid
          rooms={rooms}
          onSelect={setSelected}
          changedRoomNumbers={changedRoomNumbers}
          overdueRoomNumbers={overdueRoomNumbers}
        />
      )}

      {selected && token && (
        <RoomDetailModal
          room={selected}
          token={token}
          canEditStatus
          canManageMinibar
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSelected(updated);
          }}
        />
      )}

      {creating && token && (
        <CreateRoomModal token={token} onClose={() => setCreating(false)} onCreated={(room) => setRooms((prev) => [...prev, room])} />
      )}
    </DashboardShell>
  );
}

function CreateRoomModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (room: Room) => void;
}) {
  const [number, setNumber] = useState("");
  const [floor, setFloor] = useState(1);
  const [type, setType] = useState<RoomType>("individual");
  const [hasMinibar, setHasMinibar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const room = await api.post<Room>("/rooms", { number, floor, type, has_minibar: hasMinibar }, token);
      onCreated(room);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el cuarto");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nuevo cuarto" onClose={onClose}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Número</label>
      <input
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="101"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Piso</label>
      <input
        type="number"
        value={floor}
        onChange={(e) => setFloor(Number(e.target.value))}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Tipo</label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as RoomType)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      >
        {(["individual", "doble", "doble_deluxe", "doble_deluxe_twin", "deluxe_extragrande"] as RoomType[]).map((t) => (
          <option key={t} value={t}>
            {roomTypeLabel[t]}
          </option>
        ))}
      </select>

      <label className="mb-4 flex items-center gap-2 text-sm text-parchment-dim">
        <input type="checkbox" checked={hasMinibar} onChange={(e) => setHasMinibar(e.target.checked)} className="accent-brass" />
        Tiene frigobar
      </label>

      {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || !number}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Creando…" : "Crear cuarto"}
      </button>
    </Modal>
  );
}
