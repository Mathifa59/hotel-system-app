"use client";

import { ReportsView } from "@/components/ReportsView";

const NAV = [
  { href: "/reception", label: "Cuartos" },
  { href: "/reception/reservas", label: "Reservas" },
  { href: "/reception/cargos", label: "Cargos" },
  { href: "/reception/reportes", label: "Reportes" },
];

export default function ReceptionReportsPage() {
  return <ReportsView title="Recepción" nav={NAV} />;
}
