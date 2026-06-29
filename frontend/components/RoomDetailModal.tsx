"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useCurrency } from "@/lib/currency";
import {
  chargeStatusLabel,
  chargeTypeLabel,
  cleaningStatusLabel,
  cleaningTypeLabel,
  formatDateTime,
  formatMoney,
  paymentMethodLabel,
  reservationStatusLabel,
  roomStatusLabel,
  roomTypeLabel,
} from "@/lib/labels";
import type {
  ActivityLogEntry,
  CleaningRequest,
  CleaningRequestType,
  MinibarProduct,
  Reservation,
  Room,
  RoomHistory,
  RoomStatus,
  RoomType,
  StockItem,
} from "@/lib/types";
import { Modal } from "./Modal";
import { RoomBadge } from "./RoomBadge";

const STATUSES: RoomStatus[] = ["available", "occupied", "cleaning", "clean", "maintenance", "do_not_disturb"];
const REQUEST_TYPES: CleaningRequestType[] = ["full", "sheets_only", "towels_only", "partial", "do_not_enter"];
const ROOM_TYPES: RoomType[] = ["individual", "doble", "doble_deluxe", "doble_deluxe_twin", "deluxe_extragrande"];

type TimelineItem = { date: string; label: string; detail?: string };

// El backend registra acciones internas como "room.status_changed" — aquí se
// traducen a algo que un recepcionista o camarista realmente entienda.
function activityLabel(a: ActivityLogEntry): string {
  switch (a.action) {
    case "room.created":
      return "Cuarto creado";
    case "room.updated":
      return "Editó número, piso o tipo del cuarto";
    case "room.status_changed": {
      const status = a.meta?.status as RoomStatus | undefined;
      return status ? `Cuarto cambió a ${roomStatusLabel[status]}` : "Cambió el estado del cuarto";
    }
    case "reservation.updated":
      return "Editó una reserva";
    case "cleaning.requested": {
      const requestType = a.meta?.request_type as CleaningRequestType | undefined;
      return requestType ? `Solicitó limpieza (${cleaningTypeLabel[requestType]})` : "Solicitó limpieza";
    }
    case "cleaning.started":
      return "Tomó la limpieza";
    case "cleaning.completed":
      return "Completó la limpieza";
    case "cleaning.skipped":
      return "Omitió la limpieza";
    case "minibar.registered":
      return "Registró consumo de frigobar";
    case "minibar_stock.updated": {
      const product = a.meta?.product as string | undefined;
      const quantity = a.meta?.quantity as number | undefined;
      return product ? `Cargó frigobar: ${product} (${quantity ?? "?"} u.)` : "Actualizó el stock de frigobar";
    }
    case "checkout.billed": {
      const nights = a.meta?.nights as number | undefined;
      return nights ? `Check-out facturado — ${nights} noche(s)` : "Check-out facturado";
    }
    case "reservation.paid": {
      const method = a.meta?.method as string | undefined;
      const amountPen = a.meta?.amount_pen as string | undefined;
      return method
        ? `Pago registrado (${paymentMethodLabel[method as keyof typeof paymentMethodLabel]}) — S/ ${amountPen}`
        : "Pago registrado";
    }
    default:
      return "Actualización del cuarto";
  }
}

function buildTimeline(history: RoomHistory): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const r of history.reservations) {
    items.push({
      date: r.created_at,
      label: `Reserva — ${r.guest_name}${r.guest_id_document ? ` (ID ${r.guest_id_document})` : ""}`,
      detail: `${reservationStatusLabel[r.status]} · ${formatDateTime(r.check_in)} → ${formatDateTime(r.check_out)}`,
    });
    if (r.paid_at && r.payment_method) {
      items.push({
        date: r.paid_at,
        label: `Pago de ${r.guest_name} — ${paymentMethodLabel[r.payment_method]}`,
        detail: `S/ ${r.payment_amount_pen} · $ ${r.payment_amount_usd}`,
      });
    }
  }
  for (const c of history.cleaning_requests) {
    items.push({
      date: c.created_at,
      label: `Limpieza — ${cleaningTypeLabel[c.request_type]}`,
      detail: cleaningStatusLabel[c.status],
    });
  }
  for (const c of history.charges) {
    items.push({
      date: c.created_at,
      label: `Cargo — ${c.description}`,
      detail: `${chargeTypeLabel[c.type]} · ${chargeStatusLabel[c.status]} · S/ ${c.amount_pen}`,
    });
  }
  for (const a of history.activity) {
    items.push({
      date: a.created_at,
      label: activityLabel(a),
      detail: a.actor_name ? `por ${a.actor_name}` : undefined,
    });
  }

  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function RoomDetailModal({
  room,
  token,
  canEditStatus,
  canEditInfo = false,
  canManageMinibar = false,
  onClose,
  onUpdated,
}: {
  room: Room;
  token: string;
  canEditStatus: boolean;
  canEditInfo?: boolean;
  canManageMinibar?: boolean;
  onClose: () => void;
  onUpdated: (room: Room) => void;
}) {
  const [requestType, setRequestType] = useState<CleaningRequestType>("full");
  const [requestTypeTouched, setRequestTypeTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<RoomHistory | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [number, setNumber] = useState(room.number);
  const [floor, setFloor] = useState(room.floor);
  const [type, setType] = useState(room.type);
  const [hasMinibar, setHasMinibar] = useState(room.has_minibar);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // El selector arrancaba siempre en "Completa", aunque la última solicitud
  // para este cuarto haya sido "No ingresar" — eso confunde a recepción
  // (parece que nunca se hubiera elegido nada). Se precarga con el tipo más
  // reciente de ESTE cuarto, y solo si recepción no tocó el selector a mano.
  useEffect(() => {
    api
      .get<CleaningRequest[]>(`/housekeeping/requests?room_id=${room.id}`, token)
      .then((list) => {
        if (!requestTypeTouched && list.length > 0) setRequestType(list[0].request_type);
      })
      .catch(() => {});
  }, [room.id, token, requestTypeTouched]);

  async function saveInfo() {
    setSavingInfo(true);
    setInfoError(null);
    try {
      const updated = await api.patch<Room>(
        `/rooms/${room.id}`,
        { number, floor, type, has_minibar: hasMinibar },
        token
      );
      onUpdated(updated);
      setEditingInfo(false);
    } catch (err) {
      setInfoError(err instanceof ApiError ? err.message : "No se pudo guardar el cuarto");
    } finally {
      setSavingInfo(false);
    }
  }

  async function toggleHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (!history) {
      setLoadingHistory(true);
      try {
        setHistory(await api.get<RoomHistory>(`/rooms/${room.id}/history`, token));
      } finally {
        setLoadingHistory(false);
      }
    }
  }

  async function changeStatus(status: RoomStatus) {
    setError(null);
    try {
      const updated = await api.patch<Room>(`/rooms/${room.id}/status`, { status }, token);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado");
    }
  }

  async function createRequest() {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await api.post(
        "/housekeeping/requests",
        { room_id: room.id, request_type: requestType, notes: notes || undefined },
        token
      );
      setMessage("Solicitud de limpieza creada.");
      setNotes("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la solicitud");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Cuarto ${room.number}`} onClose={onClose} wide>
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm text-parchment-dim">{roomTypeLabel[room.type]}</p>
        <RoomBadge status={room.status} />
      </div>

      {/* Un cuarto recién limpiado queda en "Limpio" — recepción lo libera a
          "Disponible" para que pueda recibir un nuevo check-in. Se resalta para
          que no se olvide ese paso (el check-in exige el estado Disponible). */}
      {canEditStatus && room.status === "clean" && (
        <button
          onClick={() => changeStatus("available")}
          className="mb-5 w-full rounded-lg border border-room-available/40 bg-room-available/15 py-2.5 text-sm font-semibold text-room-available transition hover:bg-room-available/25"
        >
          Marcar disponible para nuevo huésped
        </button>
      )}

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {/* ───── Columna izquierda: identidad y estado del cuarto ───── */}
        <div className="space-y-5">
          {canEditInfo && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wide text-parchment-dim">Número, piso y tipo</p>
                {!editingInfo && (
                  <button
                    onClick={() => setEditingInfo(true)}
                    className="text-xs font-medium text-brass transition hover:text-brass-bright"
                  >
                    Editar
                  </button>
                )}
              </div>

              {editingInfo ? (
                <div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="Número"
                      className="rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
                    />
                    <input
                      type="number"
                      value={floor}
                      onChange={(e) => setFloor(Number(e.target.value))}
                      placeholder="Piso"
                      className="rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
                    />
                  </div>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as RoomType)}
                    className="mt-2 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
                  >
                    {ROOM_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {roomTypeLabel[t]}
                      </option>
                    ))}
                  </select>
                  <label className="mt-2 flex items-center gap-2 text-sm text-parchment-dim">
                    <input
                      type="checkbox"
                      checked={hasMinibar}
                      onChange={(e) => setHasMinibar(e.target.checked)}
                      className="accent-brass"
                    />
                    Tiene frigobar
                  </label>
                  {infoError && <p className="mt-2 text-sm text-room-maintenance">{infoError}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        setEditingInfo(false);
                        setNumber(room.number);
                        setFloor(room.floor);
                        setType(room.type);
                        setHasMinibar(room.has_minibar);
                        setInfoError(null);
                      }}
                      className="flex-1 rounded-lg border border-border-warm py-2 text-sm font-medium text-parchment-dim transition hover:text-parchment"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={saveInfo}
                      disabled={savingInfo || !number}
                      className="flex-1 rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
                    >
                      {savingInfo ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-parchment">
                  Cuarto {room.number} · Piso {room.floor}
                  {room.has_minibar ? " · Con frigobar" : ""}
                </p>
              )}
            </div>
          )}

          {canEditStatus && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-dim">Cambiar estado</p>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    disabled={s === room.status}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                      s === room.status
                        ? "border-brass/50 bg-brass/15 text-brass"
                        : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
                    }`}
                  >
                    {roomStatusLabel[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ───── Columna derecha: frigobar + solicitar limpieza ───── */}
        <div className="space-y-5 sm:border-l sm:border-border-warm/50 sm:pl-8">
          {canManageMinibar && room.has_minibar && <MinibarManager room={room} token={token} />}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-dim">Solicitar limpieza</p>
            <select
              value={requestType}
              onChange={(e) => {
                setRequestType(e.target.value as CleaningRequestType);
                setRequestTypeTouched(true);
              }}
              className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {cleaningTypeLabel[t]}
                </option>
              ))}
            </select>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas (opcional)"
              className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
            />
            {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}
            {message && <p className="mb-3 text-sm text-room-available">{message}</p>}
            <button
              onClick={createRequest}
              disabled={submitting}
              className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
            >
              {submitting ? "Creando…" : "Crear solicitud"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border-warm/50 pt-4">
        <button
          onClick={toggleHistory}
          className="text-xs font-medium uppercase tracking-wide text-parchment-dim transition hover:text-brass"
        >
          {showHistory ? "Ocultar historial completo ↑" : "Ver historial completo ↓"}
        </button>

        {/* Sin overflow/max-h propio a propósito: este historial es parte del
            mismo scroll del modal (ver Modal.tsx) — tener un segundo
            contenedor con su propia barra de scroll se veía como "doble
            scroll" superpuesto y confundía. */}
        {showHistory && (
          <div className="mt-3 space-y-2.5">
            {loadingHistory && <p className="text-sm text-parchment-dim">Cargando…</p>}
            {history &&
              buildTimeline(history).map((item, i) => (
                <div key={i} className="border-l border-border-warm pl-3">
                  <p className="text-xs text-parchment">{item.label}</p>
                  <p className="text-[11px] text-parchment-dim">
                    {formatDateTime(item.date)}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </p>
                </div>
              ))}
            {history && buildTimeline(history).length === 0 && (
              <p className="text-sm text-parchment-dim">Sin historial todavía.</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function MinibarManager({ room, token }: { room: Room; token: string }) {
  const { currency } = useCurrency();
  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pricePen, setPricePen] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Para registrar consumo (no solo cargar stock nuevo) hace falta saber a
  // qué reserva cargarlo — se toma la más reciente de este cuarto, igual que
  // en el flujo de "Mis tareas".
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [consumeQty, setConsumeQty] = useState<Record<string, number>>({});
  const [consumeMessage, setConsumeMessage] = useState<string | null>(null);
  const [consumingNow, setConsumingNow] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<MinibarProduct[]>("/minibar/products", token),
      api.get<StockItem[]>(`/minibar/stock?room_id=${room.id}`, token),
      api.get<Reservation[]>(`/reservations?room_id=${room.id}`, token),
    ])
      .then(([p, s, reservations]) => {
        setProducts(p);
        setStock(s);
        setReservationId(reservations[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [room.id, token]);

  function setConsumeQuantity(productId: string, value: number, max: number) {
    setConsumeQty((prev) => ({ ...prev, [productId]: Math.max(0, Math.min(max, value)) }));
  }

  async function registerConsumption() {
    if (!reservationId) return;
    const items = Object.entries(consumeQty)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id, quantity }));
    if (items.length === 0) return;
    setConsumingNow(true);
    setConsumeMessage(null);
    try {
      await api.post("/minibar/consumptions", { room_id: room.id, reservation_id: reservationId, items }, token);
      setConsumeMessage("Consumo registrado.");
      setConsumeQty({});
      setStock(await api.get<StockItem[]>(`/minibar/stock?room_id=${room.id}`, token));
    } catch {
      setConsumeMessage("No se pudo registrar el consumo.");
    } finally {
      setConsumingNow(false);
    }
  }

  async function addOrRestock() {
    const trimmedName = name.trim();
    if (!trimmedName || !pricePen || !priceUsd || !quantity) return;
    setSaving(true);
    setError(null);
    try {
      let product = products.find((p) => p.name.toLowerCase() === trimmedName.toLowerCase());
      if (!product) {
        product = await api.post<MinibarProduct>(
          "/minibar/products",
          { name: trimmedName, price_pen: pricePen, price_usd: priceUsd, cost: pricePen },
          token
        );
        setProducts((prev) => [...prev, product as MinibarProduct]);
      }
      const updatedStock = await api.put<StockItem>(
        "/minibar/stock",
        { room_id: room.id, product_id: product.id, quantity: Number(quantity) },
        token
      );
      setStock((prev) => {
        const exists = prev.some((s) => s.product_id === product!.id);
        return exists ? prev.map((s) => (s.product_id === product!.id ? updatedStock : s)) : [...prev, updatedStock];
      });
      setName("");
      setPricePen("");
      setPriceUsd("");
      setQuantity("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el producto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-dim">Frigobar</p>

      {loading ? (
        <p className="text-sm text-parchment-dim">Cargando…</p>
      ) : (
        <div className="mb-2 space-y-1.5">
          {stock.length === 0 && <p className="text-sm text-parchment-dim">Sin productos cargados todavía.</p>}
          {stock.map((s) => {
            const product = products.find((p) => p.id === s.product_id);
            if (!product) return null;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-parchment">{product.name}</p>
                  <p className="text-[11px] text-parchment-dim">
                    {s.quantity} u. · {formatMoney({ pen: product.price_pen, usd: product.price_usd }, currency)}
                  </p>
                </div>
                {/* Contador para marcar cuánto consumió el huésped — antes
                    solo se podía agregar stock nuevo, no registrar consumo,
                    desde el mapa de cuartos. */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConsumeQuantity(s.product_id, (consumeQty[s.product_id] ?? 0) - 1, s.quantity)}
                    className="h-7 w-7 rounded-lg border border-border-warm text-parchment-dim transition hover:border-brass/40 hover:text-brass"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-data text-xs text-parchment">
                    {consumeQty[s.product_id] ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConsumeQuantity(s.product_id, (consumeQty[s.product_id] ?? 0) + 1, s.quantity)}
                    disabled={s.quantity === 0}
                    className="h-7 w-7 rounded-lg border border-border-warm text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stock.length > 0 && (
        <>
          {!reservationId && (
            <p className="mb-2 text-[11px] text-room-maintenance">
              Este cuarto no tiene una reserva real asociada (cambiar el estado a mano no cuenta como una) — crea
              la reserva y haz check-in para poder registrar consumo.
            </p>
          )}
          {consumeMessage && <p className="mb-2 text-[11px] text-room-available">{consumeMessage}</p>}
          <button
            onClick={registerConsumption}
            disabled={!reservationId || consumingNow || Object.values(consumeQty).every((q) => !q)}
            className="mb-4 w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
          >
            {consumingNow ? "Registrando…" : "Registrar consumo"}
          </button>
        </>
      )}

      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-parchment-dim/70">
        Agregar producto / reabastecer
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Bebida (ej. Coca-Cola)"
        className="mb-2 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Cantidad"
          inputMode="numeric"
          className="rounded-lg border border-border-warm bg-ink/60 px-2 py-2 text-center text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
        <input
          value={pricePen}
          onChange={(e) => setPricePen(e.target.value)}
          placeholder="Precio S/"
          inputMode="decimal"
          className="rounded-lg border border-border-warm bg-ink/60 px-2 py-2 text-center text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
        <input
          value={priceUsd}
          onChange={(e) => setPriceUsd(e.target.value)}
          placeholder="Precio $"
          inputMode="decimal"
          className="rounded-lg border border-border-warm bg-ink/60 px-2 py-2 text-center text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-parchment-dim">
        Si el nombre ya existe, se actualiza la cantidad de ese producto en este cuarto.
      </p>
      {error && <p className="mt-2 text-sm text-room-maintenance">{error}</p>}
      <button
        onClick={addOrRestock}
        disabled={saving || !name.trim() || !pricePen || !priceUsd || !quantity}
        className="mt-2 w-full rounded-lg border border-border-warm py-2 text-sm font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Agregar / actualizar"}
      </button>
    </div>
  );
}
