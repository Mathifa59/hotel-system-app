"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useCurrency } from "@/lib/currency";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
import type { CleaningRequest, MinibarProduct, RealtimeEvent, Reservation, Room, StockItem } from "@/lib/types";
import { cleaningTypeLabel, formatMoney } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";

const NAV = [
  { href: "/cleaning", label: "Mis tareas" },
  { href: "/cleaning/cuartos", label: "Cuartos" },
];

export default function CleaningPage() {
  const { token } = useAuth();
  const toast = useToast();
  const [rooms, setRooms] = useState<Record<string, Room>>({});
  const [available, setAvailable] = useState<CleaningRequest[]>([]);
  const [mine, setMine] = useState<CleaningRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<Room[]>("/rooms", token)
      .then((list) => {
        setRooms(Object.fromEntries(list.map((r) => [r.id, r])));
      })
      .catch(() => toast.error("No se pudieron cargar los cuartos."));
    api
      .get<CleaningRequest[]>("/housekeeping/requests?status=pending", token)
      .then(setAvailable)
      .catch(() => toast.error("No se pudieron cargar las tareas disponibles."));
    api
      .get<CleaningRequest[]>("/housekeeping/requests?assigned_to=me&status=in_progress", token)
      .then(setMine)
      .catch(() => toast.error("No se pudieron cargar tus tareas."));
  }, [token, toast]);

  useEffect(load, [load]);

  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "cleaning_request_created") load();
  });

  useEffect(() => {
    if (connected) load();
  }, [connected, load]);

  async function start(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/housekeeping/requests/${id}/start`, undefined, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function complete(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/housekeeping/requests/${id}/complete`, undefined, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  async function skip(id: string) {
    if (!token) return;
    setBusy(id);
    try {
      await api.patch(`/housekeeping/requests/${id}/skip`, {}, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell title="Limpieza" nav={NAV} connected={connected}>
      <section className="mb-8">
        <h1 className="mb-4 font-display text-2xl italic text-parchment">Mis tareas</h1>
        {mine.length === 0 && <p className="text-sm text-parchment-dim">No tienes tareas en curso.</p>}
        <div className="space-y-3">
          {mine.map((req) => (
            <TaskCard
              key={req.id}
              request={req}
              room={rooms[req.room_id]}
              token={token!}
              busy={busy === req.id}
              onComplete={() => complete(req.id)}
              onSkip={() => skip(req.id)}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-parchment-dim">Disponibles</h2>
        {available.length === 0 && <p className="text-sm text-parchment-dim">No hay solicitudes pendientes.</p>}
        <div className="space-y-3">
          {available.map((req) => (
            <div key={req.id} className="flex items-center justify-between rounded-xl border border-border-warm bg-surface p-4">
              <div>
                <p className="font-data text-xl font-semibold text-parchment">{rooms[req.room_id]?.number ?? "—"}</p>
                <p className="text-xs text-parchment-dim">{cleaningTypeLabel[req.request_type]}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => skip(req.id)}
                  disabled={busy === req.id}
                  className="rounded-lg border border-border-warm px-3 py-2 text-sm font-medium text-parchment-dim transition hover:border-room-maintenance/40 hover:text-room-maintenance disabled:opacity-50"
                >
                  Omitir
                </button>
                <button
                  onClick={() => start(req.id)}
                  disabled={busy === req.id}
                  className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
                >
                  Tomar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}

function TaskCard({
  request,
  room,
  token,
  busy,
  onComplete,
  onSkip,
}: {
  request: CleaningRequest;
  room: Room | undefined;
  token: string;
  busy: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const [showMinibar, setShowMinibar] = useState(false);

  return (
    <div className="rounded-xl border border-border-warm bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-data text-xl font-semibold text-parchment">{room?.number ?? "—"}</p>
          <p className="text-xs text-parchment-dim">{cleaningTypeLabel[request.request_type]}</p>
        </div>
        <div className="flex gap-2">
          {room?.has_minibar && (
            <button
              onClick={() => setShowMinibar((v) => !v)}
              className="rounded-lg border border-border-warm px-3 py-2 text-sm font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass"
            >
              Frigobar
            </button>
          )}
          <button
            onClick={onSkip}
            disabled={busy}
            className="rounded-lg border border-border-warm px-3 py-2 text-sm font-medium text-parchment-dim transition hover:border-room-maintenance/40 hover:text-room-maintenance disabled:opacity-50"
          >
            Omitir
          </button>
          <button
            onClick={onComplete}
            disabled={busy}
            className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
          >
            Completar
          </button>
        </div>
      </div>

      {showMinibar && room && (
        <MinibarPanel room={room} token={token} reservationId={request.reservation_id ?? undefined} />
      )}
    </div>
  );
}

function MinibarPanel({ room, token, reservationId: fixedReservationId }: { room: Room; token: string; reservationId?: string }) {
  const { currency } = useCurrency();
  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [reservationId, setReservationId] = useState<string | null>(fixedReservationId ?? null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toast = useToast();

  useEffect(() => {
    api
      .get<MinibarProduct[]>("/minibar/products", token)
      .then(setProducts)
      .catch(() => toast.error("No se pudo cargar el catálogo de frigobar."));
    api
      .get<StockItem[]>(`/minibar/stock?room_id=${room.id}`, token)
      .then(setStock)
      .catch(() => toast.error("No se pudo cargar el stock del frigobar."));
    if (fixedReservationId) return;
    api
      .get<Reservation[]>(`/reservations?room_id=${room.id}`, token)
      .then((list) => {
        setReservationId(list[0]?.id ?? null);
      })
      .catch(() => toast.error("No se pudo encontrar la reserva de este cuarto."));
  }, [room.id, token, fixedReservationId, toast]);

  function setQuantity(productId: string, value: number, max: number) {
    setQty((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, value)) }));
  }

  async function submit() {
    if (!reservationId) return;
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (items.length === 0) return;

    setSubmitting(true);
    setMessage(null);
    try {
      await api.post("/minibar/consumptions", { room_id: room.id, reservation_id: reservationId, items }, token);
      setMessage("Consumo registrado.");
      setQty({});
      api.get<StockItem[]>(`/minibar/stock?room_id=${room.id}`, token).then(setStock);
    } catch {
      setMessage("No se pudo registrar el consumo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border-warm/50 pt-4">
      {!reservationId && (
        <p className="mb-3 text-sm text-room-maintenance">No se encontró una reserva reciente para este cuarto.</p>
      )}
      <div className="space-y-2">
        {products.map((p) => {
          const current = stock.find((s) => s.product_id === p.id);
          const max = current?.quantity ?? 0;
          return (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-parchment">{p.name}</p>
                <p className="text-[11px] text-parchment-dim">
                  {formatMoney({ pen: p.price_pen, usd: p.price_usd }, currency)} · stock {max}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setQuantity(p.id, (qty[p.id] ?? 0) - 1, max)}
                  className="h-8 w-8 rounded-lg border border-border-warm text-parchment-dim transition hover:border-brass/40 hover:text-brass"
                >
                  −
                </button>
                <span className="w-6 text-center font-data text-parchment">{qty[p.id] ?? 0}</span>
                <button
                  onClick={() => setQuantity(p.id, (qty[p.id] ?? 0) + 1, max)}
                  disabled={max === 0}
                  className="h-8 w-8 rounded-lg border border-border-warm text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {message && <p className="mt-3 text-sm text-room-available">{message}</p>}

      <button
        onClick={submit}
        disabled={!reservationId || submitting}
        className="mt-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Registrando…" : "Registrar consumo"}
      </button>
    </div>
  );
}
