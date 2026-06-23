"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { NotificationBell } from "./NotificationBell";

type NavItem = { href: string; label: string };

export function DashboardShell({
  title,
  nav,
  connected,
  children,
}: {
  title: string;
  nav: NavItem[];
  connected: boolean;
  children: ReactNode;
}) {
  const { user, token, logout } = useAuth();
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <header className="glass-panel sticky top-0 z-20 border-b border-border-warm/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3.5 sm:gap-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="whitespace-nowrap font-display text-lg italic text-parchment sm:text-xl">
              Apu Gestión<span className="text-brass">.</span>
            </span>
            <span className="hidden text-[11px] uppercase tracking-[0.2em] text-parchment-dim sm:inline">
              {title}
            </span>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    active ? "bg-brass/15 text-brass" : "text-parchment-dim hover:text-parchment"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className="flex items-center gap-1.5 text-[11px] text-parchment-dim"
              title={connected ? "Conectado en tiempo real" : "Reconectando…"}
            >
              <span
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                  connected ? "bg-room-available" : "animate-pulse bg-room-maintenance"
                }`}
              />
              <span className="hidden sm:inline">{connected ? "En vivo" : "Reconectando"}</span>
            </span>
            <span className="hidden text-sm text-parchment-dim sm:inline">{user?.name}</span>
            {token && <NotificationBell token={token} />}
            <button
              onClick={logout}
              className="whitespace-nowrap rounded-lg border border-border-warm px-2.5 py-1.5 text-sm text-parchment-dim transition hover:border-brass/40 hover:text-brass sm:px-3"
            >
              Salir
            </button>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto border-t border-border-warm/40 px-3 py-2 sm:px-5 md:hidden">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? "bg-brass/15 text-brass" : "text-parchment-dim"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-5">{children}</main>
    </div>
  );
}
