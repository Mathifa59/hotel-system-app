"use client";

import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/labels";
import type { StatsBucket } from "@/lib/types";

// Corte del periodo como barras horizontales. Una sola serie, así que no
// lleva leyenda (el título de la sección la nombra) y cada barra va con su
// valor escrito al lado — la longitud da la comparación de un vistazo y el
// número da la precisión, sin necesidad de tooltip.
export function BreakdownBars({
  items,
  metric = "revenue",
  emptyLabel = "Sin datos en este periodo.",
}: {
  items: StatsBucket[];
  // "revenue" compara dinero; "nights" compara ocupación (noches vendidas).
  metric?: "revenue" | "nights";
  emptyLabel?: string;
}) {
  const { currency } = useCurrency();

  if (items.length === 0) {
    return <p className="text-sm text-parchment-dim">{emptyLabel}</p>;
  }

  const valueOf = (item: StatsBucket) =>
    metric === "nights" ? item.nights : Number(currency === "PEN" ? item.revenue_pen : item.revenue_usd);
  const max = Math.max(1, ...items.map(valueOf));

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const value = valueOf(item);
        return (
          <div key={item.key}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-parchment">{item.label}</span>
              <span className="shrink-0 font-data text-parchment-dim">
                {metric === "nights"
                  ? `${item.nights} noche(s)`
                  : formatMoney({ pen: item.revenue_pen, usd: item.revenue_usd }, currency)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-ink/60">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(value / max) * 100}%`,
                  background: "var(--color-chart-lodging)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
