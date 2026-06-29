"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api } from "@/lib/api";
import type { Room, RealtimeEvent } from "@/lib/types";
import { DashboardShell } from "@/components/DashboardShell";
import { RoomGrid } from "@/components/RoomGrid";
import { RoomDetailModal } from "@/components/RoomDetailModal";

const NAV = [
  { href: "/cleaning", label: "Mis tareas" },
  { href: "/cleaning/cuartos", label: "Cuartos" },
];

export default function CleaningRoomsPage() {
  const { token } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [changedRoomNumbers, setChangedRoomNumbers] = useState<Set<string>>(new Set());

  const loadRooms = useCallback(() => {
    if (!token) return;
    api.get<Room[]>("/rooms", token).then(setRooms).finally(() => setLoading(false));
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
    <DashboardShell title="Limpieza" nav={NAV} connected={connected}>
      <h1 className="mb-6 font-display text-2xl italic text-parchment">Cuartos</h1>

      {loading ? (
        <p className="text-sm text-parchment-dim">Cargando…</p>
      ) : (
        <RoomGrid rooms={rooms} onSelect={setSelected} changedRoomNumbers={changedRoomNumbers} />
      )}

      {selected && token && (
        <RoomDetailModal
          room={selected}
          token={token}
          canEditStatus={false}
          canManageMinibar
          canCompleteCleaning
          onClose={() => setSelected(null)}
          onUpdated={(updated) => {
            setRooms((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setSelected(updated);
          }}
        />
      )}
    </DashboardShell>
  );
}
