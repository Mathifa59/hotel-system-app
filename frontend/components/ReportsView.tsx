"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useCurrency } from "@/lib/currency";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
import type { MinibarReport, OccupancyReport, RoomStatus, StatsReport } from "@/lib/types";
import { chargeTypeLabel, formatMoney, roomStatusColor, roomStatusLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";
import { DailyRevenueChart } from "@/components/DailyRevenueChart";
import { BreakdownBars } from "@/components/BreakdownBars";

const fmtDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// Rangos de uso frecuente — evitan tener que teclear dos fechas para las
// consultas que se hacen siempre.
function presets(): { label: string; range: { start: string; end: string } }[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return [
    { label: "Este mes", range: { start: fmtDay(new Date(y, m, 1)), end: fmtDay(new Date(y, m + 1, 0)) } },
    { label: "Mes pasado", range: { start: fmtDay(new Date(y, m - 1, 1)), end: fmtDay(new Date(y, m, 0)) } },
    {
      label: "Últimos 30 días",
      range: { start: fmtDay(new Date(now.getTime() - 29 * 86_400_000)), end: fmtDay(now) },
    },
    { label: "Este año", range: { start: fmtDay(new Date(y, 0, 1)), end: fmtDay(new Date(y, 11, 31)) } },
  ];
}

// Cifra suelta: el dato más importante de una tarjeta va grande y solo, sin
// gráfico alrededor — un número no necesita barras para leerse.
function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border-warm bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-parchment-dim">{label}</p>
      <p className="mt-1 font-data text-xl font-semibold text-parchment">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-parchment-dim">{hint}</p>}
    </div>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border-warm bg-surface p-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-parchment-dim">{title}</h2>
        {aside && <span className="font-data text-lg text-brass">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

// Contenido de /admin/reportes y /reception/reportes: mismo reporte para
// ambos roles (recepción también necesita ver ocupación/ingresos, no solo
// admin), cada ruta le pasa su propio título y barra de navegación.
export function ReportsView({ title, nav }: { title: string; nav: { href: string; label: string }[] }) {
  const { token } = useAuth();
  const connected = useRealtime(token, () => {});
  const { currency } = useCurrency();
  const toast = useToast();
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [minibar, setMinibar] = useState<MinibarReport | null>(null);
  const [stats, setStats] = useState<StatsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(() => presets()[0].range);

  useEffect(() => {
    if (!token) return;
    api
      .get<OccupancyReport>("/reports/occupancy", token)
      .then(setOccupancy)
      .catch(() => toast.error("No se pudo cargar la ocupación actual."));
    api
      .get<MinibarReport>("/reports/minibar", token)
      .then(setMinibar)
      .catch(() => toast.error("No se pudo cargar el reporte de frigobar."));
  }, [token, toast]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .get<StatsReport>(`/reports/stats?start=${range.start}&end=${range.end}`, token)
      .then(setStats)
      .catch(() => toast.error("No se pudieron cargar las estadísticas del periodo."))
      .finally(() => setLoading(false));
  }, [token, range, toast]);

  const k = stats?.kpis;
  const maxQuantity = minibar ? Math.max(1, ...minibar.items.map((i) => i.total_quantity)) : 1;

  return (
    <DashboardShell title={title} nav={nav} connected={connected}>
      <h1 className="mb-5 font-display text-2xl italic text-parchment">Reportes</h1>

      {/* Los filtros van juntos en una fila, arriba de todo lo que afectan. */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border-warm bg-surface p-4">
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
        <div className="flex flex-wrap gap-1.5">
          {presets().map((p) => {
            const active = p.range.start === range.start && p.range.end === range.end;
            return (
              <button
                key={p.label}
                onClick={() => setRange(p.range)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-brass/50 bg-brass/15 text-brass"
                    : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {loading && <span className="ml-auto text-xs text-parchment-dim">Calculando…</span>}
      </div>

      {k && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="Ingresos del periodo"
              value={formatMoney({ pen: k.total_revenue_pen, usd: k.total_revenue_usd }, currency)}
              hint={`Alojamiento ${formatMoney({ pen: k.lodging_revenue_pen, usd: k.lodging_revenue_usd }, currency)} · Extras ${formatMoney({ pen: k.extras_revenue_pen, usd: k.extras_revenue_usd }, currency)}`}
            />
            <Kpi
              label="Ocupación"
              value={`${(k.occupancy_rate * 100).toFixed(1)}%`}
              hint={`${k.nights_sold} de ${k.available_room_nights} noches-cuarto`}
            />
            <Kpi
              label="ADR"
              value={formatMoney({ pen: k.adr_pen, usd: k.adr_usd }, currency)}
              hint="Promedio por noche vendida"
            />
            <Kpi
              label="RevPAR"
              value={formatMoney({ pen: k.revpar_pen, usd: k.revpar_usd }, currency)}
              hint="Ingreso por noche disponible"
            />
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            <Kpi label="Llegadas" value={String(k.arrivals)} hint="Estadías iniciadas" />
            <Kpi label="Huéspedes" value={String(k.guests)} />
            <Kpi label="Estadía promedio" value={`${k.avg_nights} noches`} />
          </div>
        </>
      )}

      {stats && (
        <div className="space-y-6">
          <Section title="Ingresos por día">
            <DailyRevenueChart daily={stats.daily} />
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Ingresos por tipo de cuarto">
              <BreakdownBars items={stats.by_room_type} />
            </Section>
            <Section title="Profesional vs promocional">
              <BreakdownBars items={stats.by_rate_plan} />
            </Section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Noches vendidas por cuarto">
              <BreakdownBars items={stats.by_room} metric="nights" />
            </Section>
            <Section title="Origen de la reserva">
              <BreakdownBars items={stats.by_source} />
            </Section>
          </div>

          <Section title="Cargos extra del periodo">
            <div className="space-y-2">
              {stats.extras_by_type.map((item) => (
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
              {stats.extras_by_type.length === 0 && (
                <p className="text-sm text-parchment-dim">Sin cargos extra en este periodo.</p>
              )}
            </div>
          </Section>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Estas dos NO dependen del rango: son la foto operativa de ahora. */}
        <Section
          title="Estado de los cuartos ahora"
          aside={occupancy ? `${Math.round(occupancy.occupancy_rate * 100)}%` : undefined}
        >
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
        </Section>

        <Section
          title="Frigobar (histórico)"
          aside={
            minibar
              ? formatMoney({ pen: minibar.total_revenue_pen, usd: minibar.total_revenue_usd }, currency)
              : undefined
          }
        >
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
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(item.total_quantity / maxQuantity) * 100}%`,
                      background: "var(--color-chart-extras)",
                    }}
                  />
                </div>
              </div>
            ))}
            {minibar?.items.length === 0 && (
              <p className="text-sm text-parchment-dim">Sin consumo registrado todavía.</p>
            )}
          </div>
        </Section>
      </div>
    </DashboardShell>
  );
}
