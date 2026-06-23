import { roomStatusColor, roomStatusLabel } from "@/lib/labels";
import type { RoomStatus } from "@/lib/types";

export function RoomBadge({ status }: { status: RoomStatus }) {
  const color = roomStatusColor[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {roomStatusLabel[status]}
    </span>
  );
}
