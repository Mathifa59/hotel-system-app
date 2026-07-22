"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useCurrency } from "@/lib/currency";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
import type { IncomeReport, MinibarReport, OccupancyReport, RoomStatus } from "@/lib/types";
import { chargeTypeLabel, formatMoney, roomStatusColor, roomStatusLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

// Primer y último día del mes actual en formato YYYY-MM-DD.
function monthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fmt = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export default function ReportsPage() {
  const { token } = useAuth();
  const connected = useRealtime(token, () => {});
  const { currency } = useCurrency();
  const toast = useToast();
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [minibar, setMinibar] = useState<MinibarReport | null>(null);
  const [income, setIncome] = useState<IncomeReport | null>(null);
  const [range, setRange] = useState(monthRange);

  useEffect(() => {
    if (!token) return;
    api
      .get<OccupancyReport>("/reports/occupancy", token)
      .then(setOccupancy)
      .catch(() => toast.error("No se pudo cargar el reporte de ocupación."));
    api
      .get<MinibarReport>("/reports/minibar", token)
      .then(setMinibar)
      .catch(() => toast.error("No se pudo cargar el reporte de frigobar."));
  }, [token, toast]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams({
      start: `${range.start}T00:00:00`,
      end: `${range.end}T23:59:59`,
    });
    api
      .get<IncomeReport>(`/reports/income?${params.toString()}`, token)
      .then(setIncome)
      .catch(() => toast.error("No se pudo cargar el reporte de ingresos."));
  }, [token, range, toast]);

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
            {minibar && (
              <span className="font-data text-2xl text-brass">
                {formatMoney({ pen: minibar.total_revenue_pen, usd: minibar.total_revenue_usd }, currency)}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {minibar?.items.map((item) => (
              <div key={item.product_id}>
                <div className="mb-1 flex justify-between text-xs text-parchment-dim">
                  <span>{item.product_name}</span>
                  <span className="font-data">
                    {item.total_quantity} ·{" "}
                    {formatMoney({ pen: item.total_revenue_pen, usd: item.total_revenue_usd }, currency)}
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

      <section className="mt-6 rounded-2xl border border-border-warm bg-surface p-5">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">Ingresos por periodo</h2>
          {income && (
            <span className="font-data text-2xl text-brass">
              {formatMoney({ pen: income.total_pen, usd: income.total_usd }, currency)}
            </span>
          )}
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-parchment-dim">Desde</label>
            <input
              type="date"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))}
              className="rounded-lg border border-border-warm bg-ink/60 px-3 py-1.5 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-parchment-dim">Hasta</label>
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))}
              className="rounded-lg border border-border-warm bg-ink/60 px-3 py-1.5 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
            />
          </div>
        </div>

        <div className="space-y-2">
          {income?.items.map((item) => (
            <div
              key={item.type}
              className="flex items-center justify-between rounded-lg border border-border-warm/60 px-3 py-2 text-sm"
            >
              <span className="text-parchment">{chargeTypeLabel[item.type]}</span>
              <span className="font-data text-parchment-dim">
                {formatMoney({ pen: item.total_pen, usd: item.total_usd }, currency)}
              </span>
            </div>
          ))}
          {income?.items.length === 0 && (
            <p className="text-sm text-parchment-dim">Sin ingresos registrados en este periodo.</p>
          )}
        </div>
      </section>
    </DashboardShell>
  );
}
