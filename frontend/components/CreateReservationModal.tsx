"use client";

import { useState } from "react";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import type { RatePlan, Reservation, Room } from "@/lib/types";
import { ratePlanLabel } from "@/lib/labels";
import { DateTimeField } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";

// Horarios de salida estándar del hotel — evita que recepción escriba una
// hora de check-out arbitraria que no corresponde a ninguna política real.
export const CHECKOUT_TIMES = [
  { label: "10:00 am", time: "10:00" },
  { label: "12:00 md", time: "12:00" },
  { label: "3:00 pm", time: "15:00" },
];

// Selector de qué lista de precios se cobra para esta reserva — recepción
// elige entre la tarifa profesional (estándar) y la promocional (rebajada)
// por reserva, no por tipo de cuarto (ver RATES en el backend).
export function RatePlanToggle({ value, onChange }: { value: RatePlan; onChange: (plan: RatePlan) => void }) {
  return (
    <div className="flex gap-2">
      {(["professional", "promotional"] as RatePlan[]).map((plan) => (
        <button
          key={plan}
          type="button"
          onClick={() => onChange(plan)}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
            value === plan
              ? "border-brass/50 bg-brass/15 text-brass"
              : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
          }`}
        >
          {ratePlanLabel[plan]}
        </button>
      ))}
    </div>
  );
}

export function CreateReservationModal({
  token,
  rooms,
  initialRoomId,
  onClose,
  onCreated,
}: {
  token: string;
  rooms: Room[];
  // Viene precargado cuando recepción llega desde "marcar Ocupado → sí,
  // crear reserva" en el mapa de cuartos, o desde el botón "+ Nueva reserva"
  // de esa misma vista con un cuarto ya seleccionado.
  initialRoomId?: string;
  onClose: () => void;
  onCreated: (r: Reservation) => void;
}) {
  const toast = useToast();
  const [roomId, setRoomId] = useState(initialRoomId ?? rooms[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestIdDocument, setGuestIdDocument] = useState("");
  const [guests, setGuests] = useState(1);
  const [ratePlan, setRatePlan] = useState<RatePlan>("professional");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Devuelve el primer campo faltante para avisar exactamente qué llenar, en
  // vez de dejar el botón deshabilitado sin explicación.
  function missingField(): string | null {
    if (!roomId) return "Elige un cuarto.";
    if (!guestName.trim()) return "Escribe el nombre del huésped.";
    if (!checkIn) return "Falta la fecha de check-in.";
    if (!checkOut) return "Falta la fecha de check-out.";
    if (new Date(checkOut) <= new Date(checkIn)) return "El check-out debe ser posterior al check-in.";
    return null;
  }

  async function submit() {
    const missing = missingField();
    if (missing) {
      toast.error(missing);
      return;
    }
    setSubmitting(true);
    try {
      const reservation = await api.post<Reservation>(
        "/reservations",
        {
          room_id: roomId,
          guest_name: guestName,
          guest_phone: guestPhone || undefined,
          guest_id_document: guestIdDocument || undefined,
          guests,
          rate_plan: ratePlan,
          check_in: new Date(checkIn).toISOString(),
          check_out: new Date(checkOut).toISOString(),
        },
        token
      );
      onCreated(reservation);
      toast.success(`Reserva de ${reservation.guest_name} creada correctamente.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nueva reserva" onClose={onClose} wide>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Cuarto</label>
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Cuarto {r.number}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huéspedes</label>
          <input
            type="number"
            min={1}
            value={guests}
            onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Huésped</label>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Nombre completo"
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
            Identificación (INE, pasaporte, etc.) — opcional
          </label>
          <input
            value={guestIdDocument}
            onChange={(e) => setGuestIdDocument(e.target.value)}
            placeholder="Número de documento"
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Teléfono (opcional)</label>
          <input
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="+52 55 0000 0000"
            className="w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Tarifa</label>
          <RatePlanToggle value={ratePlan} onChange={setRatePlan} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-in</label>
          <DateTimeField value={checkIn} onChange={setCheckIn} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Check-out</label>
          <DateTimeField value={checkOut} onChange={setCheckOut} presetTimes={CHECKOUT_TIMES} />
        </div>
      </div>

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Creando…" : "Crear reserva"}
      </button>
    </Modal>
  );
}
