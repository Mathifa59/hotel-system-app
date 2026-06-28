"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const role = await login(email, password);
      router.replace(`/${role}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");
      // Limpiar la contraseña tras un intento fallido — que no quede ahí
      // como si fuera válida, y que sea obvio que hay que escribirla de nuevo.
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[780px] -translate-x-1/2 rounded-full bg-brass/10 blur-3xl"
      />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <div className="mb-10 flex animate-rise flex-col items-center text-center" style={{ animationDelay: "0ms" }}>
          <Logo className="h-14 w-auto" />
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-parchment-dim">
            Sistema operativo del hotel
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-panel animate-rise w-full rounded-2xl p-7 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)]"
          style={{ animationDelay: "90ms" }}
        >
          <div className="mb-6 h-[3px] w-12 rounded-full bg-gradient-to-r from-brass to-brass-bright" />

          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
            Correo
          </label>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="admin@hotel.com"
            className={`mb-4 w-full rounded-lg border bg-ink/60 px-3.5 py-2.5 text-parchment placeholder:text-parchment-dim/50 outline-none transition focus:ring-2 ${
              error
                ? "border-room-maintenance/60 focus:border-room-maintenance focus:ring-room-maintenance/25"
                : "border-border-warm focus:border-brass focus:ring-brass/30"
            }`}
          />

          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-parchment-dim">
            Contraseña
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="••••••••"
            className={`mb-5 w-full rounded-lg border bg-ink/60 px-3.5 py-2.5 text-parchment placeholder:text-parchment-dim/50 outline-none transition focus:ring-2 ${
              error
                ? "border-room-maintenance/60 focus:border-room-maintenance focus:ring-room-maintenance/25"
                : "border-border-warm focus:border-brass focus:ring-brass/30"
            }`}
          />

          {error && (
            <p className="mb-4 flex items-start gap-2 rounded-lg border border-room-maintenance/30 bg-room-maintenance/10 px-3 py-2.5 text-sm text-room-maintenance">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-4 w-4 shrink-0">
                <circle cx="12" cy="12" r="9.5" />
                <path d="M12 7.5v5.5M12 16.5h.01" strokeLinecap="round" />
              </svg>
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brass py-2.5 font-semibold text-ink transition active:scale-[0.98] hover:bg-brass-bright disabled:opacity-50"
          >
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div
          className="mt-7 flex animate-rise items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-parchment-dim/70"
          style={{ animationDelay: "160ms" }}
        >
          <span>Admin</span>
          <span className="h-1 w-1 rounded-full bg-parchment-dim/40" />
          <span>Recepción</span>
          <span className="h-1 w-1 rounded-full bg-parchment-dim/40" />
          <span>Limpieza</span>
        </div>
      </div>
    </div>
  );
}
