"use client";

import type { Room } from "@/lib/types";
import { roomTypeLabel } from "@/lib/labels";
import { RoomBadge } from "./RoomBadge";

export function RoomGrid({ rooms, onSelect }: { rooms: Room[]; onSelect: (room: Room) => void }) {
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
                  className="group animate-rise rounded-xl border border-border-warm bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-brass/50 hover:shadow-lg hover:shadow-black/30"
                >
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
                  <div className="mt-3">
                    <RoomBadge status={room.status} />
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
