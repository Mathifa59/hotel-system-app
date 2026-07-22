"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/ws";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import type { Role, User } from "@/lib/types";
import { roleLabel } from "@/lib/labels";
import { DashboardShell } from "@/components/DashboardShell";
import { Modal } from "@/components/Modal";

const NAV = [
  { href: "/admin", label: "Cuartos" },
  { href: "/admin/frigobar", label: "Frigobar" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/reportes", label: "Reportes" },
  { href: "/admin/solicitudes", label: "Solicitudes" },
  { href: "/admin/usuarios", label: "Usuarios" },
];

const ROLES: Role[] = ["admin", "reception", "cleaning"];

export default function UsersPage() {
  const { token, user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api
      .get<User[]>("/users", token)
      .then(setUsers)
      .catch(() => toast.error("No se pudieron cargar los usuarios."));
  }, [token, toast]);

  useEffect(load, [load]);
  const connected = useRealtime(token, () => {});

  async function toggleActive(u: User) {
    if (!token) return;
    setBusy(u.id);
    try {
      await api.patch(`/users/${u.id}`, { is_active: !u.is_active }, token);
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardShell title="Admin" nav={NAV} connected={connected}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl italic text-parchment">Usuarios</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright"
        >
          + Nuevo empleado
        </button>
      </div>

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-warm bg-surface p-4">
            <div>
              <p className="text-sm text-parchment">
                {u.name} <span className="text-parchment-dim">· {u.email}</span>
              </p>
              <p className="text-[11px] text-parchment-dim">{roleLabel[u.role]}</p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                  u.is_active ? "bg-room-available/15 text-room-available" : "bg-room-maintenance/15 text-room-maintenance"
                }`}
              >
                {u.is_active ? "Activo" : "Inactivo"}
              </span>
              <button
                onClick={() => setResetting(u)}
                className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass"
              >
                Restablecer contraseña
              </button>
              {u.id !== me?.id && (
                <button
                  onClick={() => toggleActive(u)}
                  disabled={busy === u.id}
                  className="rounded-lg border border-border-warm px-3 py-1.5 text-xs font-medium text-parchment-dim transition hover:border-brass/40 hover:text-brass disabled:opacity-50"
                >
                  {u.is_active ? "Desactivar" : "Reactivar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {creating && token && (
        <CreateUserModal token={token} onClose={() => setCreating(false)} onCreated={(u) => setUsers((prev) => [...prev, u])} />
      )}

      {resetting && token && (
        <ResetPasswordModal user={resetting} token={token} onClose={() => setResetting(null)} />
      )}
    </DashboardShell>
  );
}

function ResetPasswordModal({
  user,
  token,
  onClose,
}: {
  user: User;
  token: string;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/users/${user.id}`, { password }, token);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo restablecer la contraseña");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Contraseña de ${user.name}`} onClose={onClose}>
      {done ? (
        <p className="text-sm text-room-available">Contraseña actualizada. Avísale a {user.name} la nueva contraseña.</p>
      ) : (
        <>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
            Nueva contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
          />
          {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting || password.length < 4}
            className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
          >
            {submitting ? "Guardando…" : "Guardar contraseña nueva"}
          </button>
        </>
      )}
    </Modal>
  );
}

function CreateUserModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (u: User) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("cleaning");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.post<User>("/users", { name, email, password, role }, token);
      onCreated(user);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el usuario");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nuevo empleado" onClose={onClose}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Nombre</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre completo"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Correo</label>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="empleado@hotel.com"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Contraseña inicial</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        className="mb-3 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment placeholder:text-parchment-dim/50 outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      />

      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">Rol</label>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="mb-4 w-full rounded-lg border border-border-warm bg-ink/60 px-3 py-2 text-sm text-parchment outline-none focus:border-brass focus:ring-2 focus:ring-brass/30"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {roleLabel[r]}
          </option>
        ))}
      </select>

      {error && <p className="mb-3 text-sm text-room-maintenance">{error}</p>}

      <button
        onClick={submit}
        disabled={submitting || !name || !email || !password}
        className="w-full rounded-lg bg-brass py-2 text-sm font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
      >
        {submitting ? "Creando…" : "Crear empleado"}
      </button>
    </Modal>
  );
}
