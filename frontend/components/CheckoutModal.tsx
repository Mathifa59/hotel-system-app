"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import { chargeStatusLabel, chargeTypeLabel, formatMoney } from "@/lib/labels";
import type { Reservation, ReservationFolio } from "@/lib/types";
import { Modal } from "./Modal";

export function CheckoutModal({
  reservation,
  token,
  onClose,
  onConfirmed,
}: {
  reservation: Reservation;
  token: string;
  onClose: () => void;
  onConfirmed: (updated: Reservation) => void;
}) {
  const { currency } = useCurrency();
  const [folio, setFolio] = useState<ReservationFolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api
      .get<ReservationFolio>(`/reservations/${reservation.id}/folio`, token)
      .then(setFolio)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo calcular la cuenta"));
  }, [reservation.id, token]);

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      const updated = await api.patch<Reservation>(`/reservations/${reservation.id}/checkout`, undefined, token);
      onConfirmed(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el check-out");
    } finally {
      setConfirming(false);
    }
  }

  const approvedTotal = folio
    ? Number(folio.room_charge_pen) +
      folio.charges.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.amount_pen), 0)
    : 0;
  const approvedTotalUsd = folio
    ? Number(folio.room_charge_usd) +
      folio.charges.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.amount_usd), 0)
    : 0;
  const pendingCharges = folio?.charges.filter((c) => c.status === "pending") ?? [];

  return (
    <Modal title={`Check-out — ${reservation.guest_name}`} onClose={onClose}>
      {!folio && !error && <p className="text-sm text-parchment-dim">Calculando cuenta…</p>}
      {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

      {folio && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border-warm/60 px-3 py-2 text-sm">
            <span className="text-parchment">Alojamiento — {folio.nights} noche(s)</span>
            <span className="font-data text-brass">
              {formatMoney({ pen: folio.room_charge_pen, usd: folio.room_charge_usd }, currency)}
            </span>
          </div>

          {folio.charges.map((c) => (
            <div key={c.id} className="mb-2 flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="truncate text-parchment">{c.description}</p>
                <p className="text-[11px] text-parchment-dim">
                  {chargeTypeLabel[c.type]} · {chargeStatusLabel[c.status]}
                </p>
              </div>
              <span className="font-data text-parchment-dim">
                {formatMoney({ pen: c.amount_pen, usd: c.amount_usd }, currency)}
              </span>
            </div>
          ))}

          <div className="mt-4 flex items-center justify-between border-t border-border-warm/50 pt-3">
            <span className="text-sm font-medium text-parchment">Total a cobrar ahora</span>
            <span className="font-data text-lg text-brass">
              {formatMoney({ pen: approvedTotal, usd: approvedTotalUsd }, currency)}
            </span>
          </div>

          {pendingCharges.length > 0 && (
            <p className="mt-2 text-[11px] text-parchment-dim">
              Hay {pendingCharges.length} cargo(s) pendiente(s) de aprobación que no están incluidos — se cobran
              después desde Cargos.
            </p>
          )}

          <button
            onClick={confirm}
            disabled={confirming}
            className="mt-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
          >
            {confirming ? "Confirmando…" : "Confirmar check-out"}
          </button>
        </>
      )}
    </Modal>
  );
}
