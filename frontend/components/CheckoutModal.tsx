"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import { useToast } from "@/lib/toast";
import { chargeStatusLabel, chargeTypeLabel, formatMoney, paymentMethodLabel, ratePlanLabel } from "@/lib/labels";
import type { PaymentMethod, Reservation, ReservationFolio } from "@/lib/types";
import { DateTimeField } from "./DateTimeField";
import { Modal } from "./Modal";

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

function nowForInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

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
  const toast = useToast();
  const [folio, setFolio] = useState<ReservationFolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"folio" | "payment">("folio");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amountPen, setAmountPen] = useState("0");
  const [amountUsd, setAmountUsd] = useState("0");
  const [paidAt, setPaidAt] = useState(nowForInput);

  useEffect(() => {
    api
      .get<ReservationFolio>(`/reservations/${reservation.id}/folio`, token)
      .then(setFolio)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo calcular la cuenta"));
  }, [reservation.id, token]);

  const approvedTotal = folio
    ? Number(folio.room_charge_pen) +
      folio.charges.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.amount_pen), 0)
    : 0;
  const approvedTotalUsd = folio
    ? Number(folio.room_charge_usd) +
      folio.charges.filter((c) => c.status === "approved").reduce((sum, c) => sum + Number(c.amount_usd), 0)
    : 0;
  const pendingCharges = folio?.charges.filter((c) => c.status === "pending") ?? [];

  function goToPayment() {
    setAmountPen(approvedTotal.toFixed(2));
    setAmountUsd(approvedTotalUsd.toFixed(2));
    setStep("payment");
  }

  async function confirmCheckout() {
    setConfirming(true);
    setError(null);
    try {
      const updated = await api.patch<Reservation>(
        `/reservations/${reservation.id}/checkout`,
        {
          method,
          amount_pen: amountPen,
          amount_usd: amountUsd,
          paid_at: new Date(paidAt).toISOString(),
        },
        token
      );
      onConfirmed(updated);
      toast.success(`Check-out de ${reservation.guest_name} completado.`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el check-out");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <Modal title={`Check-out — ${reservation.guest_name}`} onClose={onClose}>
      {!folio && !error && <p className="text-sm text-parchment-dim">Calculando cuenta…</p>}
      {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

      {folio && step === "folio" && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border-warm/60 px-3 py-2 text-sm">
            <span className="text-parchment">
              Alojamiento — {folio.nights} noche(s)
              <span className="ml-1.5 text-[11px] text-parchment-dim">({ratePlanLabel[folio.rate_plan]})</span>
            </span>
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
            onClick={goToPayment}
            className="mt-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright"
          >
            Continuar a registrar el pago
          </button>
        </>
      )}

      {folio && step === "payment" && (
        <>
          <p className="mb-4 text-sm text-parchment-dim">
            Registra cómo y cuánto pagó {reservation.guest_name} antes de cerrar el check-out.
          </p>

          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
            Método de pago
          </label>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  method === m
                    ? "border-brass/50 bg-brass/15 text-brass"
                    : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
                }`}
              >
                {paymentMethodLabel[m]}
              </button>
            ))}
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
                Monto S/
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amountPen}
                onChange={(e) => setAmountPen(e.target.value)}
                className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
                Monto $
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
              />
            </div>
          </div>

          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
            Fecha y hora del pago
          </label>
          <DateTimeField value={paidAt} onChange={setPaidAt} className="mb-4" />

          {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => setStep("folio")}
              disabled={confirming}
              className="flex-1 rounded-lg border border-border-warm py-2 text-sm font-medium text-parchment-dim transition hover:text-parchment disabled:opacity-50"
            >
              Atrás
            </button>
            <button
              onClick={confirmCheckout}
              disabled={confirming}
              className="flex-1 rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
            >
              {confirming ? "Confirmando…" : "Confirmar pago y check-out"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
