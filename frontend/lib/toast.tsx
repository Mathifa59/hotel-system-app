"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: string; type: ToastType; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

const ACCENT: Record<ToastType, string> = {
  success: "border-room-available/50 text-room-available",
  error: "border-room-maintenance/50 text-room-maintenance",
  info: "border-brass/50 text-brass",
};

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "success") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0">
        <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "error") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0">
        <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.5" strokeLinecap="round" />
    </svg>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback((type: ToastType, message: string) => {
    const id = `t${counter.current++}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    // Errores se quedan un poco más (el usuario necesita leer qué falló);
    // los éxitos son confirmación rápida.
    const ttl = type === "error" ? 6000 : 3500;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  const api: ToastApi = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Pila fija centrada-abajo en móvil, abajo-derecha en desktop — lejos
          del header (donde está la campanita) y del pulgar sin tapar la
          acción principal. */}
      <div className="pointer-events-none fixed inset-x-4 bottom-6 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass-panel animate-rise pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border px-4 py-3 text-sm text-parchment shadow-[0_20px_50px_-10px_rgba(0,0,0,0.6)] sm:w-80 ${ACCENT[t.type]}`}
          >
            <span className="mt-0.5">
              <ToastIcon type={t.type} />
            </span>
            <span className="text-parchment">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
