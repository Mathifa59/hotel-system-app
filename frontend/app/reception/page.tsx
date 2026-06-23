"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api } from "@/lib/api";
import type { RealtimeEvent, Room } from "@/lib/types";
import { DashboardShell } from "@/components/DashboardShell";
import { RoomGrid } from "@/components/RoomGrid";
import { RoomDetailModal } from "@/components/RoomDetailModal";

const NAV = [
  { href: "/reception", label: "Cuartos" },
  { href: "/reception/reservas", label: "Reservas" },
  { href: "/reception/cargos", label: "Cargos" },
];

export default function ReceptionRoomsPage() {
  const { token } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selected, setSelected] = useState<Room | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.get<Room[]>("/rooms", token).then(setRooms);
  }, [token]);

  useEffect(load, [load]);

  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "room_status_changed") {
      setRooms((prev) =>
        prev.map((r) => (r.number === event.room ? { ...r, status: event.status as Room["status"] } : r))
      );
    }
  });

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  return (
    <DashboardShell title="Recepción" nav={NAV} connected={connected}>
      <h1 className="mb-6 font-display text-2xl italic text-parchment">Mapa de cuartos</h1>
      <RoomGrid rooms={rooms} onSelect={setSelected} />

      {selected && token && (
        <RoomDetailModal
          room={selected}
          token={token}
          canEditStatus
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
