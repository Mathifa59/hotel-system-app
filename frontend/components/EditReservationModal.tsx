"use client";

import { useState } from "react";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import type { PaymentMethod, RatePlan, Reservation, Room } from "@/lib/types";
import { paymentMethodLabel, roomTypeLabel } from "@/lib/labels";
import { DateTimeField } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";
import { CHECKOUT_TIMES, RatePlanToggle } from "@/components/CreateReservationModal";

const DEPOSIT_METHODS: PaymentMethod[] = ["cash", "card", "transfer", "yape"];

// Convierte un ISO en UTC al formato local que espera un <input datetime-local>.
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// Editable para pending/active (el flujo normal) Y para checked_out (una
// estadía ya cerrada puede tener un dato mal: nombre, fechas, adelanto,
// precio). Solo cancelled queda bloqueada — nunca ocupó el cuarto, no hay
// nada que corregir. El backend aplica la misma regla; este componente no
// decide quién puede editar qué, solo la usa (ver reservas/page.tsx y
// RoomReservationHistory.tsx para dónde se dispara).
export function EditReservationModal({
  token,
  reservation,
  rooms,
  onClose,
  onUpdated,
}: {
  token: string;
  reservation: Reservation;
  rooms: Room[];
  onClose: () => void;
  onUpdated: (r: Reservation) => void;
}) {
  const [roomId, setRoomId] = useState(reservation.room_id ?? "");
  const [guestName, setGuestName] = useState(reservation.guest_name);
  const [guestPhone, setGuestPhone] = useState(reservation.guest_phone ?? "");
  const [guestIdDocument, setGuestIdDocument] = useState(reservation.guest_id_document ?? "");
  const [guests, setGuests] = useState(reservation.guests);
  const [ratePlan, setRatePlan] = useState<RatePlan>(reservation.rate_plan);
  const [checkIn, setCheckIn] = useState(toLocalInput(reservation.check_in));
  const [checkOut, setCheckOut] = useState(toLocalInput(reservation.check_out));
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  // El adelanto solo se podía registrar al crear la reserva — si el huésped
  // pagó después (lo normal: reserva primero, transferencia unos minutos u
  // horas más tarde), no había forma de anotarlo. Precargado si ya existía,
  // para poder corregirlo sin perder el dato.
  const [registerDeposit, setRegisterDeposit] = useState(reservation.deposit_amount_pen !== null);
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>(reservation.deposit_method ?? "cash");
  const [depositAmountPen, setDepositAmountPen] = useState(reservation.deposit_amount_pen ?? "");
  const [depositAmountUsd, setDepositAmountUsd] = useState(reservation.deposit_amount_usd ?? "");

  // Precio por noche fijado a mano para esta reserva — antes solo se podía
  // dar un precio distinto cambiando la tarifa del tipo de cuarto entero.
  const [customRatePen, setCustomRatePen] = useState(reservation.custom_rate_pen ?? "");
  const [customRateUsd, setCustomRateUsd] = useState(reservation.custom_rate_usd ?? "");
  const hasCustomRate = customRatePen !== "" && customRateUsd !== "";

  async function submit() {
    if (!guestName.trim()) return toast.error("Escribe el nombre del huésped.");
    if (!checkIn) return toast.error("Falta la fecha de check-in.");
    if (!checkOut) return toast.error("Falta la fecha de check-out.");
    if (new Date(checkOut) <= new Date(checkIn)) return toast.error("El check-out debe ser posterior al check-in.");
    if (registerDeposit && (!depositAmountPen || !depositAmountUsd)) {
      return toast.error("Completa el monto del adelanto o desmarca “Registrar adelanto”.");
    }
    if ((customRatePen === "") !== (customRateUsd === "")) {
      return toast.error("Completa el precio personalizado en ambas monedas, o deja las dos vacías.");
    }

    setSubmitting(true);
    try {
      const updated = await api.patch<Reservation>(
        `/reservations/${reservation.id}`,
        {
          room_id: roomId || null,
          guest_name: guestName,
          guest_phone: guestPhone || undefined,
          guest_id_document: guestIdDocument || undefined,
          guests,
          rate_plan: ratePlan,
          custom_rate_pen: hasCustomRate ? customRatePen : null,
          custom_rate_usd: hasCustomRate ? customRateUsd : null,
          check_in: new Date(checkIn).toISOString(),
          check_out: new Date(checkOut).toISOString(),
          deposit: registerDeposit
            ? {
                method: depositMethod,
                amount_pen: depositAmountPen,
                amount_usd: depositAmountUsd,
                // Si ya tenía adelanto, se respeta la fecha original — no es
                // que se haya vuelto a pagar solo porque se corrigió el
                // monto. Si es la primera vez que se marca, es "ahora".
                paid_at: reservation.deposit_paid_at ?? new Date().toISOString(),
              }
            : null,
        },
        token
      );
      onUpdated(updated);
      toast.success("Reserva actualizada.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Editar reserva — ${reservation.guest_name}`} onClose={onClose}>
      {reservation.status === "checked_out" && (
        <p className="mb-4 rounded-lg border border-border-warm/60 bg-ink/40 px-3 py-2.5 text-xs leading-relaxed text-parchment-dim">
          Esta estadía ya está cerrada. Corregir el precio o las fechas acá también actualiza el cargo de alojamiento
          ya cobrado, para que el folio y los reportes queden consistentes.
        </p>
      )}

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Cuarto</label>
      <select
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        className="mb-1.5 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      >
        <option value="">
          Sin asignar (lista de espera{reservation.requested_room_type ? ` — ${roomTypeLabel[reservation.requested_room_type]}` : ""})
        </option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            Cuarto {r.number}
          </option>
        ))}
      </select>
      {!roomId && (
        <p className="mb-3 text-[11px] text-room-maintenance">
          Sin cuarto asignado no se puede hacer check-in — asigna uno cuando haya disponible.
        </p>
      )}

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huésped</label>
      <input
        value={guestName}
        onChange={(e) => setGuestName(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
        Identificación (INE, pasaporte, etc.) — opcional
      </label>
      <input
        value={guestIdDocument}
        onChange={(e) => setGuestIdDocument(e.target.value)}
        placeholder="Número de documento"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Teléfono (opcional)</label>
      <input
        value={guestPhone}
        onChange={(e) => setGuestPhone(e.target.value)}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huéspedes</label>
      <input
        type="number"
        min={1}
        value={guests}
        onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Tarifa</label>
      <div className="mb-3">
        <RatePlanToggle value={ratePlan} onChange={setRatePlan} />
      </div>

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
        Precio por noche personalizado (opcional)
      </label>
      <div className="mb-1 grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="decimal"
          placeholder="S/ (usa la tarifa)"
          value={customRatePen}
          onChange={(e) => setCustomRatePen(e.target.value)}
          className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
        <input
          type="number"
          inputMode="decimal"
          placeholder="$ (usa la tarifa)"
          value={customRateUsd}
          onChange={(e) => setCustomRateUsd(e.target.value)}
          className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
      </div>
      <p className="mb-3 text-[11px] text-parchment-dim">
        Reemplaza la tarifa {ratePlan === "promotional" ? "promocional" : "profesional"} solo para esta reserva.
        Vacío en ambas = usa la tarifa del tipo de cuarto.
      </p>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:gap-2">
        <div className="w-full sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-in</label>
          <DateTimeField value={checkIn} onChange={setCheckIn} />
        </div>
        <div className="w-full sm:w-1/2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-out</label>
          <DateTimeField value={checkOut} onChange={setCheckOut} presetTimes={CHECKOUT_TIMES} />
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border-warm/60 p-3.5">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={registerDeposit}
            onChange={(e) => setRegisterDeposit(e.target.checked)}
            className="h-4 w-4 accent-brass"
          />
          <span className="text-sm font-medium text-parchment">Adelanto pagado</span>
        </label>

        {registerDeposit && (
          <div className="mt-3.5">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
              Método de pago
            </label>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {DEPOSIT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDepositMethod(m)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                    depositMethod === m
                      ? "border-brass/50 bg-brass/15 text-brass"
                      : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
                  }`}
                >
                  {paymentMethodLabel[m]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
                  Monto S/
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={depositAmountPen}
                  onChange={(e) => setDepositAmountPen(e.target.value)}
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
                  value={depositAmountUsd}
                  onChange={(e) => setDepositAmountUsd(e.target.value)}
                  className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={submitting}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-onbrass transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Guardando…" : "Guardar cambios"}
      </button>
    </Modal>
  );
}
