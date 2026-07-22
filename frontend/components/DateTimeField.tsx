"use client";

import { useEffect, useRef, useState } from "react";

// Reemplaza <input type="datetime-local"> — su selector nativo (calendario +
// lista de horas en dos paneles blancos) rompe por completo el tema oscuro
// latón/pergamino de la app. Mismo contrato externo (value/onChange con el
// formato nativo "YYYY-MM-DDTHH:mm") para no tocar la lógica de los
// formularios que ya lo usan — solo se cambia el input por este componente.
const WEEKDAYS = ["DO", "LU", "MA", "MI", "JU", "VI", "SA"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function parseValue(value: string): { date: Date | null; hh: string; mm: string } {
  if (!value) return { date: null, hh: "", mm: "" };
  const [datePart, timePart] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = (timePart ?? "00:00").split(":");
  return { date: new Date(y, m - 1, d), hh, mm };
}

function formatValue(date: Date, hh: string, mm: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateTimeField({
  value,
  onChange,
  className = "",
  presetTimes,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  // Cuando se da, reemplaza el input de hora libre por botones de horarios
  // fijos (ej. check-out siempre a las 10:00, 12:00 o 15:00) — evita que
  // recepción escriba una hora rara que no corresponde a la política del
  // hotel. Formato "HH:mm".
  presetTimes?: { label: string; time: string }[];
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { date: selected, hh, mm } = parseValue(value);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickDay(day: Date) {
    onChange(formatValue(day, hh || "00", mm || "00"));
  }

  function setTime(newTime: string) {
    const [newHh, newMm] = newTime.split(":");
    onChange(formatValue(selected ?? new Date(), newHh, newMm));
  }

  const display = selected
    ? `${String(selected.getDate()).padStart(2, "0")}/${String(selected.getMonth() + 1).padStart(2, "0")}/${selected.getFullYear()}${hh ? ` ${hh}:${mm}` : ""}`
    : "dd/mm/aaaa --:--";

  const startWeekday = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1).getDay();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i - startWeekday + 1);
    return { date, inMonth: date.getMonth() === viewMonth.getMonth() };
  });
  const today = new Date();

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-left text-sm outline-none transition focus:border-brass focus:ring-2 focus:ring-brass/30 ${
          selected ? "text-parchment" : "text-parchment-dim/50"
        } ${className}`}
      >
        <span>{display}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 text-parchment-dim">
          <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="glass-panel absolute z-50 mt-2 w-72 rounded-xl bg-surface-raised p-4 shadow-[0_20px_45px_-15px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
              className="rounded-md p-1 text-parchment-dim transition hover:bg-ink/40 hover:text-brass"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <span className="font-display text-sm capitalize text-parchment">
              {MONTHS[viewMonth.getMonth()]} de {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
              className="rounded-md p-1 text-parchment-dim transition hover:bg-ink/40 hover:text-brass"
              aria-label="Mes siguiente"
            >
              ›
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-parchment-dim">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map(({ date, inMonth }, i) => {
              const isSelected = selected !== null && isSameDay(date, selected);
              const isToday = isSameDay(date, today);
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => pickDay(date)}
                  className={`rounded-md py-1 text-xs transition ${
                    !inMonth
                      ? "text-parchment-dim/30 hover:text-parchment-dim/60"
                      : isSelected
                        ? "bg-brass font-semibold text-ink"
                        : isToday
                          ? "border border-brass/50 text-parchment"
                          : "text-parchment hover:bg-ink/40"
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          {presetTimes ? (
            <div className="mt-4 border-t border-border-warm pt-3">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-parchment-dim">Hora</p>
              <div className="flex flex-wrap gap-1.5">
                {presetTimes.map(({ label, time }) => {
                  const isActive = hh && mm && `${hh}:${mm}` === time;
                  return (
                    <button
                      key={time}
                      type="button"
                      onClick={() => setTime(time)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                        isActive
                          ? "border-brass/50 bg-brass/15 text-brass"
                          : "border-border-warm text-parchment-dim hover:border-brass/40 hover:text-parchment"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => onChange("")}
                className="mt-2 text-xs font-medium text-parchment-dim transition hover:text-brass"
              >
                Borrar
              </button>
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-warm pt-3">
              <button
                type="button"
                onClick={() => onChange("")}
                className="text-xs font-medium text-parchment-dim transition hover:text-brass"
              >
                Borrar
              </button>
              <input
                type="time"
                value={hh && mm ? `${hh}:${mm}` : ""}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-md border border-border-warm bg-ink/60 px-2 py-1 text-xs text-parchment outline-none focus:border-brass"
              />
              <button
                type="button"
                onClick={() => {
                  setViewMonth(today);
                  pickDay(today);
                }}
                className="text-xs font-medium text-brass transition hover:text-brass-bright"
              >
                Hoy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
