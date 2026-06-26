"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Charge } from "@/lib/types";
import { Modal } from "./Modal";

export function EditChargeModal({
  charge,
  token,
  onClose,
  onUpdated,
}: {
  charge: Charge;
  token: string;
  onClose: () => void;
  onUpdated: (charge: Charge) => void;
}) {
  const [description, setDescription] = useState(charge.description);
  const [amountPen, setAmountPen] = useState(charge.amount_pen);
  const [amountUsd, setAmountUsd] = useState(charge.amount_usd);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.patch<Charge>(
        `/charges/${charge.id}`,
        { description, amount_pen: amountPen, amount_usd: amountUsd },
        token
      );
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo corregir el cargo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Corregir cargo" onClose={onClose}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Descripción</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Monto</label>
      <div className="mb-3 flex gap-2">
        <input
          value={amountPen}
          onChange={(e) => setAmountPen(e.target.value)}
          placeholder="S/ 0.00"
          inputMode="decimal"
          className="w-1/2 rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
        <input
          value={amountUsd}
          onChange={(e) => setAmountUsd(e.target.value)}
          placeholder="$ 0.00"
          inputMode="decimal"
          className="w-1/2 rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
      </div>

      {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || !description || !amountPen || !amountUsd}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Guardando…" : "Guardar corrección"}
      </button>
    </Modal>
  );
}
