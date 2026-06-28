"use client";

import { useEffect, type ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Modales con varias secciones en paralelo (ej. detalle de cuarto, con
  // frigobar + limpieza + historial) usan más ancho en vez de obligar a
  // todo a apilarse en una sola columna angosta.
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`glass-panel animate-rise flex max-h-[85vh] w-full flex-col rounded-2xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] ${
          wide ? "max-w-3xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="font-display text-xl italic text-parchment">{title}</h2>
          <button onClick={onClose} className="text-parchment-dim transition hover:text-brass">
            ✕
          </button>
        </div>
        {/* Un solo scroll para todo el contenido — las secciones internas
            (ej. historial) NO deben tener su propio overflow-y-auto, o
            aparecen dos barras de scroll superpuestas. */}
        <div className="overflow-y-auto px-6 pb-6 pt-5">{children}</div>
      </div>
    </div>
  );
}
