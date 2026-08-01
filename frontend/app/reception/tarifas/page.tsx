"use client";

import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { DashboardShell } from "@/components/DashboardShell";
import { RatesEditor } from "@/components/RatesEditor";

const NAV = [
  { href: "/reception", label: "Cuartos" },
  { href: "/reception/reservas", label: "Reservas" },
  { href: "/reception/tarifas", label: "Tarifas" },
  { href: "/reception/cargos", label: "Cargos" },
  { href: "/reception/reportes", label: "Reportes" },
];

export default function TarifasPage() {
  const { token } = useAuth();
  const connected = useRealtime(token, () => {});

  return (
    <DashboardShell title="Recepción" nav={NAV} connected={connected}>
      <RatesEditor />
    </DashboardShell>
  );
}
