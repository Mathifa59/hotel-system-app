"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { api } from "@/lib/api";
import type { Charge, ChargeStatus, RealtimeEvent } from "@/lib/types";
import { chargeStatusLabel, formatDateTime, formatMoney } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";
import { CreateChargeModal } from "@/components/CreateChargeModal";

const NAV = [
  { href: "/reception", label: "Cuartos" },
  { href: "/reception/reservas", label: "Reservas" },
  { href: "/reception/cargos", label: "Cargos" },
];

const FILTERS: { value: ChargeStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pendientes" },
  { value: "approved", label: "Aprobados" },
  { value: "billed", label: "Cobrados" },
  { value: "all", label: "Todos" },
];

export default function ReceptionChargesPage() {
  const { token } = useAuth();
  const [charges, setCharges] = useState<Charge[]>([]);
  const [filter, setFilter] = useState<ChargeStatus | "all">("approved");
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    const query = filter === "all" ? "" : `?status=${filter}`;
    api.get<Charge[]>(`/charges${query}`, token).then(setCharges);
  }, [token, filter]);

  useEffect(load, [load]);

  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "charge_approved") load();
  });

  async function bill(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/charges/${id}/bill`, undefined, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell title="Recepción" nav={NAV} connected={connected}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl italic text-parchment">Cargos</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright"
        >
          + Nuevo cargo
        </button>
      </div>

      <div className="mb-5 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === f.value ? "bg-brass/15 text-brass" : "text-parchment-dim hover:text-parchment"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {charges.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-warm bg-surface p-4">
            <div className="min-w-0">
              <p className="text-sm text-parchment">{c.description}</p>
              <p className="text-[11px] text-parchment-dim">{formatDateTime(c.created_at)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-data text-lg text-brass">{formatMoney(c.amount)}</span>
              <span className="rounded-full bg-ink/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-parchment-dim">
                {chargeStatusLabel[c.status]}
              </span>
              {c.status === "approved" && (
                <button
                  onClick={() => bill(c.id)}
                  disabled={busy === c.id}
                  className="rounded-lg bg-brass px-3 py-1.5 text-xs font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
                >
                  Cobrar
                </button>
              )}
            </div>
          </div>
        ))}
        {charges.length === 0 && <p className="text-sm text-parchment-dim">No hay cargos en este filtro.</p>}
      </div>

      {creating && token && (
        <CreateChargeModal token={token} onClose={() => setCreating(false)} onCreated={() => load()} />
      )}
    </DashboardShell>
  );
}
