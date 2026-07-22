"use client";

import type { Room } from "@/lib/types";
import { roomTypeLabel } from "@/lib/labels";
import { RoomBadge } from "./RoomBadge";

export function RoomGrid({
  rooms,
  onSelect,
  changedRoomNumbers,
  overdueRoomNumbers,
}: {
  rooms: Room[];
  onSelect: (room: Room) => void;
  changedRoomNumbers?: Set<string>;
  overdueRoomNumbers?: Set<string>;
}) {
  const floors = Array.from(new Set(rooms.map((r) => r.floor))).sort((a, b) => a - b);

  if (rooms.length === 0) {
    return <p className="text-sm text-parchment-dim">Todavía no hay cuartos registrados.</p>;
  }

  return (
    <div className="space-y-7">
      {floors.map((floor) => (
        <div key={floor}>
          <p className="mb-3 font-data text-xs uppercase tracking-[0.25em] text-parchment-dim">Piso {floor}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {rooms
              .filter((r) => r.floor === floor)
              .sort((a, b) => a.number.localeCompare(b.number))
              .map((room) => (
                <button
                  key={room.id}
                  onClick={() => onSelect(room)}
                  className="group relative animate-rise rounded-xl border border-border-warm bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-brass/50 hover:shadow-lg hover:shadow-black/30"
                >
                  {changedRoomNumbers?.has(room.number) && (
                    <span
                      title="Estado actualizado"
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brass text-onbrass shadow-md shadow-black/30"
                    >
                      <span className="absolute inset-0 animate-ping rounded-full bg-brass/70" />
                      <svg viewBox="0 0 24 24" className="relative h-3.5 w-3.5" fill="currentColor">
                        <path d="M12 2a6 6 0 0 0-6 6v3.1c0 .9-.3 1.8-.9 2.5L4 15.5c-.6.8 0 2 1 2h14c1 0 1.6-1.2 1-2l-1.1-1.9c-.6-.7-.9-1.6-.9-2.5V8a6 6 0 0 0-6-6Z" />
                        <path d="M9.5 19a2.5 2.5 0 0 0 5 0" />
                      </svg>
                    </span>
                  )}
                  <div className="flex items-start justify-between">
                    <span className="font-data text-2xl font-semibold text-parchment">{room.number}</span>
                    {room.has_minibar && (
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-brass/70" fill="currentColor">
                        <title>Con frigobar</title>
                        <path d="M9 2h6v3.2c0 .6.3 1.1.8 1.5C17 7.8 18 9.5 18 11.5V20a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8.5c0-2 1-3.7 2.2-4.8.5-.4.8-.9.8-1.5V2Z" />
                      </svg>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-parchment-dim">{roomTypeLabel[room.type]}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <RoomBadge status={room.status} />
                    {overdueRoomNumbers?.has(room.number) && (
                      <span className="rounded-full bg-room-maintenance/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-room-maintenance">
                        Salida vencida
                      </span>
                    )}
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
