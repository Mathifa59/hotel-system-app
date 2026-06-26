"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useCurrency } from "@/lib/currency";
import { api, ApiError } from "@/lib/api";
import type { MinibarProduct, Room, StockItem } from "@/lib/types";
import { formatMoney } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default function FrigobarPage() {
  const { token } = useAuth();
  const connected = useRealtime(token, () => {});
  const { currency } = useCurrency();

  const [products, setProducts] = useState<MinibarProduct[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const [name, setName] = useState("");
  const [pricePen, setPricePen] = useState("");
  const [priceUsd, setPriceUsd] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.get<MinibarProduct[]>("/minibar/products", token).then(setProducts);
    api.get<Room[]>("/rooms", token).then((all) => {
      const withMinibar = all.filter((r) => r.has_minibar);
      setRooms(withMinibar);
      if (withMinibar.length > 0) setRoomId(withMinibar[0].id);
    });
  }, [token]);

  useEffect(() => {
    if (!token || !roomId) return;
    api.get<StockItem[]>(`/minibar/stock?room_id=${roomId}`, token).then((items) => {
      setStock(items);
      setQuantities(Object.fromEntries(items.map((i) => [i.product_id, i.quantity])));
    });
  }, [token, roomId]);

  async function addProduct() {
    if (!token) return;
    setError(null);
    try {
      const product = await api.post<MinibarProduct>(
        "/minibar/products",
        { name, price_pen: pricePen, price_usd: priceUsd, cost },
        token
      );
      setProducts((prev) => [...prev, product]);
      setName("");
      setPricePen("");
      setPriceUsd("");
      setCost("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el producto");
    }
  }

  async function saveStock(productId: string) {
    if (!token || !roomId) return;
    const quantity = quantities[productId] ?? 0;
    const updated = await api.put<StockItem>("/minibar/stock", { room_id: roomId, product_id: productId, quantity }, token);
    setStock((prev) => {
      const exists = prev.some((s) => s.product_id === productId);
      return exists ? prev.map((s) => (s.product_id === productId ? updated : s)) : [...prev, updated];
    });
  }

  return (
    <DashboardShell title="Admin" nav={NAV} connected={connected}>
      <h1 className="mb-6 font-display text-2xl italic text-parchment">Frigobar</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-warm bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-parchment-dim">Productos</h2>

          <div className="mb-5 space-y-2">
            {products.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border-warm/60 px-3 py-2 text-sm">
                <span className="text-parchment">{p.name}</span>
                <span className="font-data text-brass">{formatMoney({ pen: p.price_pen, usd: p.price_usd }, currency)}</span>
              </div>
            ))}
            {products.length === 0 && <p className="text-sm text-parchment-dim">Sin productos todavía.</p>}
          </div>

          <div className="border-t border-border-warm/50 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-dim">Nuevo producto</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className="mb-2 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
            />
            <div className="mb-3 flex gap-2">
              <input
                value={pricePen}
                onChange={(e) => setPricePen(e.target.value)}
                placeholder="Precio S/"
                inputMode="decimal"
                className="w-1/3 rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
              />
              <input
                value={priceUsd}
                onChange={(e) => setPriceUsd(e.target.value)}
                placeholder="Precio $"
                inputMode="decimal"
                className="w-1/3 rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
              />
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="Costo"
                inputMode="decimal"
                className="w-1/3 rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
              />
            </div>
            {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}
            <button
              onClick={addProduct}
              disabled={!name || !pricePen || !priceUsd || !cost}
              className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
            >
              Agregar
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-border-warm bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-parchment-dim">Stock por cuarto</h2>

          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="mb-4 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                Cuarto {r.number}
              </option>
            ))}
          </select>

          {rooms.length === 0 ? (
            <p className="text-sm text-parchment-dim">Ningún cuarto tiene frigobar configurado.</p>
          ) : (
            <div className="space-y-2">
              {products.map((p) => {
                const current = stock.find((s) => s.product_id === p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-warm/60 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-parchment">{p.name}</p>
                      {current && <p className="text-[11px] text-parchment-dim">inicial: {current.initial_quantity}</p>}
                    </div>
                    <input
                      type="number"
                      min={0}
                      value={quantities[p.id] ?? 0}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                      className="w-16 rounded-lg border border-border-warm bg-ink/60 px-2 py-1 text-center font-data text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
                    />
                    <button
                      onClick={() => saveStock(p.id)}
                      className="rounded-lg border border-border-warm px-2.5 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass"
                    >
                      Guardar
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
