"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Currency = "PEN" | "USD";

const STORAGE_KEY = "apu_gestion_currency";

const CurrencyContext = createContext<{
  currency: Currency;
  toggle: () => void;
}>({ currency: "PEN", toggle: () => {} });

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState<Currency>("PEN");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "PEN" || stored === "USD") setCurrency(stored);
  }, []);

  function toggle() {
    setCurrency((prev) => {
      const next = prev === "PEN" ? "USD" : "PEN";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return <CurrencyContext.Provider value={{ currency, toggle }}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
