"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api } from "@/lib/api";
import type { RealtimeEvent, Reservation, Room } from "@/lib/types";
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
  const [changedRoomNumbers, setChangedRoomNumbers] = useState<Set<string>>(new Set());
  const [overdueRoomNumbers, setOverdueRoomNumbers] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!token) return;
    api.get<Room[]>("/rooms", token).then((roomList) => {
      setRooms(roomList);
      const byId = Object.fromEntries(roomList.map((r) => [r.id, r.number]));
      api.get<Reservation[]>("/reservations?status=active", token).then((active) => {
        const now = Date.now();
        setOverdueRoomNumbers(
          new Set(
            active
              .filter((r): r is typeof r & { room_id: string } => r.room_id !== null && new Date(r.check_out).getTime() < now)
              .map((r) => byId[r.room_id])
              .filter(Boolean)
          )
        );
      });
    });
  }, [token]);

  useEffect(load, [load]);

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
    if (connected) load();
  }, [connected, load]);

  return (
    <DashboardShell title="Recepción" nav={NAV} connected={connected}>
      <h1 className="mb-6 font-display text-2xl italic text-parchment">Mapa de cuartos</h1>
      <RoomGrid
        rooms={rooms}
        onSelect={setSelected}
        changedRoomNumbers={changedRoomNumbers}
        overdueRoomNumbers={overdueRoomNumbers}
      />

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
    </DashboardShell>
  );
}
