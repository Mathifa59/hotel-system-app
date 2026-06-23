"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api } from "@/lib/api";
import type { MinibarReport, OccupancyReport, RoomStatus } from "@/lib/types";
import { formatMoney, roomStatusColor, roomStatusLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default function ReportsPage() {
  const { token } = useAuth();
  const connected = useRealtime(token, () => {});
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [minibar, setMinibar] = useState<MinibarReport | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get<OccupancyReport>("/reports/occupancy", token).then(setOccupancy);
    api.get<MinibarReport>("/reports/minibar", token).then(setMinibar);
  }, [token]);

  const maxQuantity = minibar ? Math.max(1, ...minibar.items.map((i) => i.total_quantity)) : 1;

  return (
    <DashboardShell title="Admin" nav={NAV} connected={connected}>
      <h1 className="mb-6 font-display text-2xl italic text-parchment">Reportes</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-warm bg-surface p-5">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">Ocupación</h2>
            {occupancy && (
              <span className="font-data text-2xl text-brass">{Math.round(occupancy.occupancy_rate * 100)}%</span>
            )}
          </div>

          {occupancy && (
            <div className="space-y-2.5">
              {(Object.keys(occupancy.counts) as RoomStatus[]).map((status) => {
                const count = occupancy.counts[status];
                const pct = occupancy.total_rooms ? (count / occupancy.total_rooms) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-xs text-parchment-dim">
                      <span>{roomStatusLabel[status]}</span>
                      <span className="font-data">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/60">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: roomStatusColor[status] }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-2 text-xs text-parchment-dim">{occupancy.total_rooms} cuartos en total</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border-warm bg-surface p-5">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">Consumo de frigobar</h2>
            {minibar && <span className="font-data text-2xl text-brass">{formatMoney(minibar.total_revenue)}</span>}
          </div>

          <div className="space-y-3">
            {minibar?.items.map((item) => (
              <div key={item.product_id}>
                <div className="mb-1 flex justify-between text-xs text-parchment-dim">
                  <span>{item.product_name}</span>
                  <span className="font-data">
                    {item.total_quantity} · {formatMoney(item.total_revenue)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink/60">
                  <div
                    className="h-full rounded-full bg-brass transition-all"
                    style={{ width: `${(item.total_quantity / maxQuantity) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {minibar?.items.length === 0 && <p className="text-sm text-parchment-dim">Sin consumo registrado todavía.</p>}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
