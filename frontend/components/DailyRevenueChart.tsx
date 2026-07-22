"use client";

import { useState } from "react";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/labels";
import type { StatsDailyPoint } from "@/lib/types";

// Geometría del SVG. Se dibuja en coordenadas fijas y se escala con viewBox,
// así el gráfico es responsivo sin recalcular nada en JS al redimensionar.
const W = 720;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 24, left: 46 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const GAP = 2; // separación entre segmentos apilados y entre barras

// Camino de una barra con las esquinas superiores redondeadas: el extremo del
// dato se redondea, la base queda anclada al eje.
function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, h, w / 2));
  return [
    `M${x},${y + h}`,
    `L${x},${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `L${x + w - radius},${y}`,
    `Q${x + w},${y} ${x + w},${y + radius}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ");
}

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

export function DailyRevenueChart({ daily }: { daily: StatsDailyPoint[] }) {
  const { currency } = useCurrency();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const value = (point: StatsDailyPoint, series: "lodging" | "extras") =>
    Number(currency === "PEN" ? point[`${series}_pen`] : point[`${series}_usd`]);

  const totals = daily.map((d) => value(d, "lodging") + value(d, "extras"));
  const max = niceCeil(Math.max(...totals, 0));
  const hasData = totals.some((t) => t > 0);

  if (daily.length === 0) {
    return <p className="text-sm text-parchment-dim">Sin datos para este periodo.</p>;
  }

  const bandWidth = PLOT_W / daily.length;
  const barWidth = Math.max(2, bandWidth - GAP);
  const yOf = (v: number) => PAD.top + PLOT_H - (v / max) * PLOT_H;

  // Se etiquetan pocas fechas para que no se pisen entre sí: el primer día,
  // el último, y los múltiplos de 5 según cuántos días haya.
  const step = daily.length > 20 ? 5 : daily.length > 10 ? 3 : 1;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const hovered = hover !== null ? daily[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          {/* Leyenda: siempre presente con 2 series, para que la identidad no
              dependa solo del color. */}
          <span className="flex items-center gap-1.5 text-[11px] text-parchment-dim">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-chart-lodging)" }} />
            Alojamiento
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-parchment-dim">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--color-chart-extras)" }} />
            Extras
          </span>
        </div>
        <button
          onClick={() => setAsTable((v) => !v)}
          className="rounded-lg border border-border-warm px-2.5 py-1 text-[11px] font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass"
        >
          {asTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-y-auto themed-scroll">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-[11px] uppercase tracking-wide text-parchment-dim">
                <th className="py-1.5 font-medium">Día</th>
                <th className="py-1.5 text-right font-medium">Alojamiento</th>
                <th className="py-1.5 text-right font-medium">Extras</th>
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="font-data text-xs">
              {daily.map((d, i) => (
                <tr key={d.day} className="border-t border-border-warm/40">
                  <td className="py-1.5 text-parchment-dim">{d.day.slice(8)}/{d.day.slice(5, 7)}</td>
                  <td className="py-1.5 text-right text-parchment">
                    {formatMoney({ pen: d.lodging_pen, usd: d.lodging_usd }, currency)}
                  </td>
                  <td className="py-1.5 text-right text-parchment">
                    {formatMoney({ pen: d.extras_pen, usd: d.extras_usd }, currency)}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-parchment">
                    {currency === "PEN" ? "S/" : "$"} {totals[i].toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ingresos por día">
            {gridLines.map((g) => (
              <g key={g}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={yOf(max * g)}
                  y2={yOf(max * g)}
                  stroke="currentColor"
                  strokeWidth={1}
                  className="text-border-warm/50"
                />
                <text
                  x={PAD.left - 8}
                  y={yOf(max * g) + 3.5}
                  textAnchor="end"
                  className="fill-current text-[9px] text-parchment-dim"
                >
                  {Math.round(max * g)}
                </text>
              </g>
            ))}

            {daily.map((d, i) => {
              const lodging = value(d, "lodging");
              const extras = value(d, "extras");
              const x = PAD.left + i * bandWidth + GAP / 2;
              const base = PAD.top + PLOT_H;
              const lodgingH = (lodging / max) * PLOT_H;
              const extrasH = (extras / max) * PLOT_H;
              const hasExtras = extras > 0;
              // El segmento de arriba lleva el extremo redondeado; si hay dos,
              // se separan 2px para que se lean como piezas distintas.
              const lodgingTop = base - lodgingH;
              const extrasTop = lodgingTop - GAP - extrasH;

              return (
                <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {lodging > 0 && (
                    <path
                      d={
                        hasExtras
                          ? `M${x},${base} L${x},${lodgingTop} L${x + barWidth},${lodgingTop} L${x + barWidth},${base} Z`
                          : topRoundedBar(x, lodgingTop, barWidth, lodgingH, 4)
                      }
                      fill="var(--color-chart-lodging)"
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  )}
                  {hasExtras && (
                    <path
                      d={topRoundedBar(x, extrasTop, barWidth, extrasH, 4)}
                      fill="var(--color-chart-extras)"
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  )}
                  {/* Zona de contacto de alto completo: el objetivo del mouse
                      es más grande que la barra, para que días de poco monto
                      igual se puedan consultar. */}
                  <rect x={PAD.left + i * bandWidth} y={PAD.top} width={bandWidth} height={PLOT_H} fill="transparent" />
                </g>
              );
            })}

            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + PLOT_H}
              y2={PAD.top + PLOT_H}
              stroke="currentColor"
              strokeWidth={1}
              className="text-border-warm"
            />

            {daily.map((d, i) =>
              i % step === 0 || i === daily.length - 1 ? (
                <text
                  key={d.day}
                  x={PAD.left + i * bandWidth + bandWidth / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-current text-[9px] text-parchment-dim"
                >
                  {Number(d.day.slice(8))}
                </text>
              ) : null
            )}
          </svg>

          {hovered && (
            <div
              className="menu-panel pointer-events-none absolute top-2 rounded-lg px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${((PAD.left + (hover! + 0.5) * bandWidth) / W) * 100}%`,
                transform: "translateX(-50%)",
              }}
            >
              <p className="mb-1 font-semibold text-parchment">
                {hovered.day.slice(8)}/{hovered.day.slice(5, 7)}
              </p>
              <p className="flex items-center gap-1.5 text-parchment-dim">
                <span className="h-2 w-2 rounded-sm" style={{ background: "var(--color-chart-lodging)" }} />
                Alojamiento {formatMoney({ pen: hovered.lodging_pen, usd: hovered.lodging_usd }, currency)}
              </p>
              <p className="flex items-center gap-1.5 text-parchment-dim">
                <span className="h-2 w-2 rounded-sm" style={{ background: "var(--color-chart-extras)" }} />
                Extras {formatMoney({ pen: hovered.extras_pen, usd: hovered.extras_usd }, currency)}
              </p>
            </div>
          )}

          {!hasData && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-parchment-dim">
              Sin ingresos en este periodo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
