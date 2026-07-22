"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/lib/ws";
import { useToast } from "@/lib/toast";
import type { AppNotification } from "@/lib/types";
import { formatDateTime } from "@/lib/labels";

// ponytail: abre su propia conexión WS (independiente de la de cada página)
// solo para saber cuándo refrescar notificaciones. A esta escala (un puñado
// de usuarios a la vez) duplicar la conexión es más simple que compartirla
// vía contexto; si el número de paneles abiertos crece, compartir una sola.
export function NotificationBell({ token }: { token: string }) {
  const toast = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.get<AppNotification[]>("/notifications", token).then((list) => {
      if (knownIds.current) {
        // Notificaciones nuevas del servidor (cambios de estado, solicitudes,
        // etc.) se muestran como toast en la misma pila que el feedback de
        // acciones — una sola posición consistente abajo (ver ToastProvider).
        const fresh = list.filter((n) => !knownIds.current!.has(n.id) && !n.read);
        for (const n of fresh) toast.info(n.message);
      }
      knownIds.current = new Set(list.map((n) => n.id));
      setNotifications(list);
    });
  }, [token, toast]);

  useEffect(load, [load]);
  useRealtime(token, load);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await api.patch(`/notifications/${id}/read`, {}, token);
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await api.patch("/notifications/read-all", {}, token);
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <>
      <div ref={panelRef} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-border-warm text-parchment-dim transition hover:border-brass/40 hover:text-brass"
          aria-label="Notificaciones"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M12 2a6 6 0 0 0-6 6v3.1c0 .9-.36 1.77-1 2.4L4 14.5V16h16v-1.5l-1-1c-.64-.63-1-1.5-1-2.4V8a6 6 0 0 0-6-6Zm0 20a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-room-maintenance px-1 text-[10px] font-bold text-ink">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          // top-28 (no top-10) en móvil: el header tiene una segunda fila de
          // navegación debajo de la principal (ver DashboardShell, md:hidden).
          // Con top-10 el panel —semitransparente— caía encima de esa fila y
          // se veía "mezclado"/cortado con el texto de la nav. md:top-10
          // porque en desktop esa segunda fila no existe.
          <div className="menu-panel themed-scroll animate-rise absolute right-0 top-28 z-30 max-h-96 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl shadow-[0_20px_50px_-10px_rgba(0,0,0,0.6)] md:top-10">
            <div className="flex items-center justify-between border-b border-border-warm/50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-parchment-dim">Notificaciones</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-brass transition hover:text-brass-bright">
                  Marcar todo leído
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-parchment-dim">Sin notificaciones todavía.</p>
            ) : (
              <div className="divide-y divide-border-warm/30">
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className={`block w-full px-4 py-2.5 text-left transition hover:bg-surface-raised/60 ${
                      n.read ? "opacity-60" : ""
                    }`}
                  >
                    <p className="flex items-start gap-2 text-sm text-parchment">
                      {!n.read && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brass" />}
                      <span>{n.message}</span>
                    </p>
                    <p className="mt-0.5 pl-3.5 text-[11px] text-parchment-dim">{formatDateTime(n.created_at)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
