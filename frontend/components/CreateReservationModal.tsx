"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import type { PaymentMethod, RatePlan, Reservation, Room, RoomTypeRate } from "@/lib/types";
import { paymentMethodLabel, ratePlanLabel } from "@/lib/labels";
import { DateTimeField } from "@/components/DateTimeField";
import { Modal } from "@/components/Modal";

// Horarios de salida estándar del hotel — evita que recepción escriba una
// hora de check-out arbitraria que no corresponde a ninguna política real.
export const CHECKOUT_TIMES = [
  { label: "10:00 am", time: "10:00" },
  { label: "12:00 md", time: "12:00" },
  { label: "3:00 pm", time: "15:00" },
];

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

const FIELD_CLASS =
  "w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30";
const LABEL_CLASS = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim";

// "nueva" = reserva por venir, entra como pendiente y sigue el flujo normal.
// "pasada" = estadía que YA terminó y se está cargando después (ver
// create_historical_reservation en el backend): entra directo como cerrada,
// sin tocar el estado del cuarto ni generar tarea de limpieza.
type Mode = "nueva" | "pasada";

// Noches de calendario, igual que las cuenta el backend (_nights): diferencia
// de días entre las dos fechas, mínimo 1.
function countNights(checkIn: string, checkOut: string): number {
  if (!checkIn || !checkOut) return 0;
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

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
  const [mode, setMode] = useState<Mode>("nueva");
  const [roomId, setRoomId] = useState(initialRoomId ?? rooms[0]?.id ?? "");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestIdDocument, setGuestIdDocument] = useState("");
  const [guests, setGuests] = useState(1);
  const [ratePlan, setRatePlan] = useState<RatePlan>("professional");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Solo para modo "pasada": el pago que ya se cobró en su momento.
  const [registerPayment, setRegisterPayment] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPen, setAmountPen] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [paymentTouched, setPaymentTouched] = useState(false);

  // Tarifas por tipo de cuarto — permiten mostrar el total estimado mientras
  // se llena el formulario y prellenar el monto del pago en modo "pasada",
  // en vez de obligar a recepción a sacar la cuenta a mano.
  const [rates, setRates] = useState<RoomTypeRate[]>([]);
  useEffect(() => {
    api
      .get<RoomTypeRate[]>("/rooms/rates", token)
      .then(setRates)
      // No es crítico: sin tarifas el formulario sigue funcionando, solo que
      // sin el estimado. El backend calcula el cargo real de todas formas.
      .catch(() => setRates([]));
  }, [token]);

  const nights = countNights(checkIn, checkOut);
  const selectedRoom = rooms.find((r) => r.id === roomId);
  const rate = selectedRoom ? rates.find((r) => r.type === selectedRoom.type) : undefined;
  const perNightPen =
    rate && ratePlan === "promotional" && rate.price_pen_promo !== null ? rate.price_pen_promo : rate?.price_pen;
  const perNightUsd =
    rate && ratePlan === "promotional" && rate.price_usd_promo !== null ? rate.price_usd_promo : rate?.price_usd;
  const estimatePen = perNightPen !== undefined && nights > 0 ? perNightPen * nights : null;
  const estimateUsd = perNightUsd !== undefined && nights > 0 ? perNightUsd * nights : null;

  // Prellena el pago con el total calculado, salvo que ya lo hayan editado a
  // mano (un huésped pudo pagar un monto distinto al de lista).
  useEffect(() => {
    if (paymentTouched || estimatePen === null || estimateUsd === null) return;
    setAmountPen(estimatePen.toFixed(2));
    setAmountUsd(estimateUsd.toFixed(2));
  }, [estimatePen, estimateUsd, paymentTouched]);

  // Devuelve el primer campo faltante para avisar exactamente qué llenar, en
  // vez de dejar el botón deshabilitado sin explicación.
  function missingField(): string | null {
    if (!roomId) return "Elige un cuarto.";
    if (!guestName.trim()) return "Escribe el nombre del huésped.";
    if (!checkIn) return "Falta la fecha de check-in.";
    if (!checkOut) return "Falta la fecha de check-out.";
    if (new Date(checkOut) <= new Date(checkIn)) return "El check-out debe ser posterior al check-in.";
    if (mode === "pasada") {
      if (new Date(checkOut) > new Date())
        return "Una estadía pasada debe tener el check-out en el pasado. Para una reserva futura usa “Reserva nueva”.";
      if (registerPayment && (!amountPen || !amountUsd))
        return "Completa el monto del pago o desmarca “Registrar el pago”.";
    }
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
      const base = {
        room_id: roomId,
        guest_name: guestName,
        guest_phone: guestPhone || undefined,
        guest_id_document: guestIdDocument || undefined,
        guests,
        rate_plan: ratePlan,
        check_in: new Date(checkIn).toISOString(),
        check_out: new Date(checkOut).toISOString(),
      };

      const reservation =
        mode === "pasada"
          ? await api.post<Reservation>(
              "/reservations/historical",
              {
                ...base,
                payment: registerPayment
                  ? {
                      method: paymentMethod,
                      amount_pen: amountPen,
                      amount_usd: amountUsd,
                      // El pago se registra con la fecha de salida: es cuando
                      // el huésped pagó, no cuando se está cargando el dato.
                      paid_at: new Date(checkOut).toISOString(),
                    }
                  : undefined,
              },
              token
            )
          : await api.post<Reservation>("/reservations", base, token);

      onCreated(reservation);
      toast.success(
        mode === "pasada"
          ? `Estadía de ${reservation.guest_name} registrada en el historial.`
          : `Reserva de ${reservation.guest_name} creada correctamente.`
      );
      onClose();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : mode === "pasada"
            ? "No se pudo registrar la estadía."
            : "No se pudo crear la reserva."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={mode === "pasada" ? "Registrar estadía pasada" : "Nueva reserva"} onClose={onClose} wide>
      <div className="mb-4 flex gap-2">
        {(["nueva", "pasada"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              mode === m
                ? "border-brass/50 bg-brass/15 text-brass"
                : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
            }`}
          >
            {m === "nueva" ? "Reserva nueva" : "Estadía pasada"}
          </button>
        ))}
      </div>

      {mode === "pasada" && (
        <p className="mb-4 rounded-lg border border-border-warm/60 bg-ink/40 px-3 py-2.5 text-xs leading-relaxed text-parchment-dim">
          Para estadías que <strong className="text-parchment">ya terminaron</strong> y no se alcanzaron a registrar.
          Se guarda como cerrada, con su cobro, y suma a los reportes del mes en que ocurrió — no cambia el estado
          actual del cuarto ni genera tarea de limpieza.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>Cuarto</label>
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={FIELD_CLASS}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Cuarto {r.number}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS}>Huéspedes</label>
          <input
            type="number"
            min={1}
            value={guests}
            onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
            className={FIELD_CLASS}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>Huésped</label>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Nombre completo"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Identificación (INE, pasaporte, etc.) — opcional</label>
          <input
            value={guestIdDocument}
            onChange={(e) => setGuestIdDocument(e.target.value)}
            placeholder="Número de documento"
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS}>Teléfono (opcional)</label>
          <input
            value={guestPhone}
            onChange={(e) => setGuestPhone(e.target.value)}
            placeholder="+51 900 000 000"
            className={FIELD_CLASS}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS}>Tarifa</label>
          <RatePlanToggle value={ratePlan} onChange={setRatePlan} />
        </div>

        <div>
          <label className={LABEL_CLASS}>Check-in</label>
          <DateTimeField value={checkIn} onChange={setCheckIn} />
        </div>
        <div>
          <label className={LABEL_CLASS}>Check-out</label>
          <DateTimeField value={checkOut} onChange={setCheckOut} presetTimes={CHECKOUT_TIMES} />
        </div>
      </div>

      {estimatePen !== null && (
        <p className="mt-3 flex items-baseline justify-between rounded-lg border border-brass/25 bg-brass/[0.07] px-3 py-2.5 text-sm">
          <span className="text-parchment-dim">
            {nights} noche(s) × S/ {perNightPen?.toFixed(2)}
          </span>
          <span className="font-data font-semibold text-brass">
            S/ {estimatePen.toFixed(2)} · $ {estimateUsd?.toFixed(2)}
          </span>
        </p>
      )}

      {mode === "pasada" && (
        <div className="mt-4 rounded-xl border border-border-warm/60 p-3.5">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={registerPayment}
              onChange={(e) => setRegisterPayment(e.target.checked)}
              className="h-4 w-4 accent-brass"
            />
            <span className="text-sm font-medium text-parchment">Registrar el pago de esta estadía</span>
          </label>

          {registerPayment && (
            <div className="mt-3.5">
              <label className={LABEL_CLASS}>Método de pago</label>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                      paymentMethod === m
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
                  <label className={LABEL_CLASS}>Monto S/</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amountPen}
                    onChange={(e) => {
                      setPaymentTouched(true);
                      setAmountPen(e.target.value);
                    }}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Monto $</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amountUsd}
                    onChange={(e) => {
                      setPaymentTouched(true);
                      setAmountUsd(e.target.value);
                    }}
                    className={FIELD_CLASS}
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] text-parchment-dim">
                Se registra con la fecha de salida. Si no recuerdas el monto exacto, desmarca la casilla — la estadía
                igual queda en el historial y en la ocupación.
              </p>
            </div>
          )}
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-onbrass transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting
          ? mode === "pasada"
            ? "Registrando…"
            : "Creando…"
          : mode === "pasada"
            ? "Registrar estadía"
            : "Crear reserva"}
      </button>
    </Modal>
  );
}
