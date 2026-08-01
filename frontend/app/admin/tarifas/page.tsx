"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import type { RoomType, RoomTypeRate } from "@/lib/types";
import { roomTypeLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/tarifas", label: "Tarifas" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30";
const LABEL_CLASS = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-parchment-dim";

// Los cuatro precios de una fila, siempre como texto mientras se edita (el
// input numérico maneja su propio string) — se convierten a número solo al
// guardar. La promocional puede quedar vacía: significa "no tiene, cae a la
// profesional" (así lo interpreta el backend en el cobro real).
type RateForm = { pricePen: string; priceUsd: string; pricePenPromo: string; priceUsdPromo: string };

function toForm(r: RoomTypeRate): RateForm {
  return {
    pricePen: String(r.price_pen),
    priceUsd: String(r.price_usd),
    pricePenPromo: r.price_pen_promo === null ? "" : String(r.price_pen_promo),
    priceUsdPromo: r.price_usd_promo === null ? "" : String(r.price_usd_promo),
  };
}

export default function TarifasPage() {
  const { token } = useAuth();
  const connected = useRealtime(token, () => {});
  const toast = useToast();

  const [rates, setRates] = useState<RoomTypeRate[]>([]);
  const [forms, setForms] = useState<Record<string, RateForm>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .get<RoomTypeRate[]>("/rooms/rates", token)
      .then((list) => {
        setRates(list);
        setForms(Object.fromEntries(list.map((r) => [r.type, toForm(r)])));
      })
      .catch(() => toast.error("No se pudieron cargar las tarifas."));
  }, [token, toast]);

  function updateField(type: RoomType, field: keyof RateForm, value: string) {
    setForms((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  }

  async function save(type: RoomType) {
    if (!token) return;
    const form = forms[type];
    if (!form.pricePen || !form.priceUsd) {
      toast.error("La tarifa profesional (S/ y $) es obligatoria.");
      return;
    }
    // La promocional es todo o nada: si se llenó una moneda hay que llenar
    // la otra, si no el backend se queda con una tarifa a medio definir.
    if ((form.pricePenPromo === "") !== (form.priceUsdPromo === "")) {
      toast.error("Completa la tarifa promocional en ambas monedas, o deja las dos vacías.");
      return;
    }

    setSaving(type);
    try {
      const updated = await api.put<RoomTypeRate>(
        `/rooms/rates/${type}`,
        {
          price_pen: form.pricePen,
          price_usd: form.priceUsd,
          price_pen_promo: form.pricePenPromo === "" ? null : form.pricePenPromo,
          price_usd_promo: form.priceUsdPromo === "" ? null : form.priceUsdPromo,
        },
        token
      );
      setRates((prev) => prev.map((r) => (r.type === type ? updated : r)));
      setForms((prev) => ({ ...prev, [type]: toForm(updated) }));
      toast.success(`Tarifa de ${roomTypeLabel[type]} actualizada.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar la tarifa.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <DashboardShell title="Admin" nav={NAV} connected={connected}>
      <h1 className="mb-2 font-display text-2xl italic text-parchment">Tarifas</h1>
      <p className="mb-6 text-sm text-parchment-dim">
        Precio por noche, por tipo de cuarto. La promocional es opcional — si se deja vacía, ese tipo siempre cobra la
        profesional aunque recepción elija &ldquo;Promocional&rdquo; al crear la reserva.
      </p>

      <div className="space-y-3">
        {rates.map((r) => {
          const form = forms[r.type];
          if (!form) return null;
          return (
            <div key={r.type} className="rounded-2xl border border-border-warm bg-surface p-4">
              <p className="mb-3 text-sm font-semibold text-parchment">{roomTypeLabel[r.type]}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label className={LABEL_CLASS}>Profesional S/</label>
                  <input
                    inputMode="decimal"
                    value={form.pricePen}
                    onChange={(e) => updateField(r.type, "pricePen", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Profesional $</label>
                  <input
                    inputMode="decimal"
                    value={form.priceUsd}
                    onChange={(e) => updateField(r.type, "priceUsd", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Promocional S/</label>
                  <input
                    inputMode="decimal"
                    placeholder="—"
                    value={form.pricePenPromo}
                    onChange={(e) => updateField(r.type, "pricePenPromo", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLASS}>Promocional $</label>
                  <input
                    inputMode="decimal"
                    placeholder="—"
                    value={form.priceUsdPromo}
                    onChange={(e) => updateField(r.type, "priceUsdPromo", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => save(r.type)}
                    disabled={saving === r.type}
                    className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-onbrass transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
                  >
                    {saving === r.type ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {rates.length === 0 && <p className="text-sm text-parchment-dim">Cargando tarifas…</p>}
      </div>
    </DashboardShell>
  );
}
