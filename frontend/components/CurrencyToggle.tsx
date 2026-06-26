"use client";

import { useCurrency } from "@/lib/currency";

export function CurrencyToggle() {
  const { currency, toggle } = useCurrency();

  return (
    <button
      onClick={toggle}
      title="Cambiar moneda"
      className="rounded-lg border border-border-warm px-2.5 py-1.5 text-xs font-semibold text-parchment-dim transition hover:border-brass/40 hover:text-brass"
    >
      {currency === "PEN" ? "S/ PEN" : "$ USD"}
    </button>
  );
}
