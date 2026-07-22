import { formatDateTime, paymentMethodLabel, ratePlanLabel, reservationStatusLabel } from "@/lib/labels";
import type { Reservation } from "@/lib/types";

// Historial de reservas de un cuarto — antes mezclaba reservas, limpiezas,
// cargos y cada entrada cruda del log de actividad en una sola línea de
// tiempo; demasiado ruido para ser útil. Ahora es solo la lista de reservas,
// que es lo que realmente se necesita consultar ("¿quién se ha alojado
// aquí?"). Se usa tanto en el detalle del cuarto como en la pestaña de
// Reservas.
export function RoomReservationHistory({ reservations }: { reservations: Reservation[] }) {
  if (reservations.length === 0) {
    return <p className="text-sm text-parchment-dim">Sin reservas registradas para este cuarto.</p>;
  }

  return (
    <div className="space-y-2.5">
      {reservations.map((r) => (
        <div key={r.id} className="rounded-lg border border-border-warm/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm text-parchment">{r.guest_name}</p>
            <span className="shrink-0 rounded-full bg-ink/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-parchment-dim">
              {reservationStatusLabel[r.status]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-parchment-dim">
            {formatDateTime(r.check_in)} → {formatDateTime(r.check_out)} · {ratePlanLabel[r.rate_plan]}
          </p>
          {r.paid_at && r.payment_method && (
            <p className="mt-0.5 text-[11px] text-parchment-dim">
              Pagó {paymentMethodLabel[r.payment_method]} — S/ {r.payment_amount_pen} · $ {r.payment_amount_usd}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
