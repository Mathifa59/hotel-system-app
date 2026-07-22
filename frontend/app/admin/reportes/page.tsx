"use client";

import { ReportsView } from "@/components/ReportsView";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

export default function AdminReportsPage() {
  return <ReportsView title="Admin" nav={NAV} />;
}
