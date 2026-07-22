"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useToast } from "@/lib/toast";
import type { Charge, ChargeType, Reservation } from "@/lib/types";
import { chargeTypeLabel } from "@/lib/labels";
import { Modal } from "./Modal";

const TYPES: ChargeType[] = ["damage", "extra_cleaning", "other"];

export function CreateChargeModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (charge: Charge) => void;
}) {
  const toast = useToast();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationId, setReservationId] = useState("");
  const [type, setType] = useState<ChargeType>("damage");
  const [description, setDescription] = useState("");
  const [amountPen, setAmountPen] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<Reservation[]>("/reservations?status=active", token)
      .then((list) => {
        setReservations(list);
        setReservationId(list[0]?.id ?? "");
      })
      .catch(() => toast.error("No se pudieron cargar las reservas activas."));
  }, [token, toast]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const charge = await api.post<Charge>(
        "/charges",
        { reservation_id: reservationId, type, description, amount_pen: amountPen, amount_usd: amountUsd },
        token
      );
      onCreated(charge);
      toast.success("Cargo creado correctamente.");
      onClose();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo crear el cargo";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nuevo cargo" onClose={onClose}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Reserva activa</label>
      {reservations.length === 0 ? (
        <p className="mb-3 text-sm text-room-maintenance">No hay reservas activas en este momento.</p>
      ) : (
        <select
          value={reservationId}
          onChange={(e) => setReservationId(e.target.value)}
          className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        >
          {reservations.map((r) => (
            <option key={r.id} value={r.id}>
              {r.guest_name}
            </option>
          ))}
        </select>
      )}

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Tipo</label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as ChargeType)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {chargeTypeLabel[t]}
          </option>
        ))}
      </select>

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Descripción</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Ej. Toalla manchada en cuarto 101"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
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
        disabled={submitting || !reservationId || !description || !amountPen || !amountUsd}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-onbrass transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Creando…" : "Crear cargo"}
      </button>
    </Modal>
  );
}
