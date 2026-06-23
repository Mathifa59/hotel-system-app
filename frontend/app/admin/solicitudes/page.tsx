"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import type { RealtimeEvent } from "@/lib/types";
import { DashboardShell } from "@/components/DashboardShell";
import { SiteRequestsPanel } from "@/components/SiteRequestsPanel";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default function SiteRequestsPage() {
  const { token } = useAuth();
  const [refresh, setRefresh] = useState(0);

  const connected = useRealtime(token, (event: RealtimeEvent) => {
    if (event.event === "booking_request_created") setRefresh((n) => n + 1);
  });

  return (
    <DashboardShell title="Admin" nav={NAV} connected={connected}>
      <div className="mb-6">
        <h1 className="font-display text-2xl italic text-parchment">Solicitudes del sitio web</h1>
      </div>

      {token && (
        <SiteRequestsPanel
          token={token}
          refreshSignal={refresh}
          emptyMessage="No hay solicitudes pendientes del sitio web por ahora."
        />
      )}
    </DashboardShell>
  );
}
