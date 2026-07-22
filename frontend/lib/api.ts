// Ruta relativa: el navegador la resuelve contra el dominio donde corre la
// página, sea localhost en dev o el dominio real en producción — sin
// variables de entorno que configurar al desplegar.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

// Clave compartida con auth.tsx (que la importa desde acá) — antes estaba
// duplicada como string literal en los dos archivos, con riesgo de que
// alguien cambie uno y no el otro.
export const TOKEN_STORAGE_KEY = "apu_token";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    // El JWT expira a las 12h — sin esto, cuando muere a mitad de turno cada
    // llamada al API tira 401 y la app se queda "logueada" con un token
    // muerto, mostrando errores por todos lados sin explicar por qué. Se
    // limpia la sesión y se manda a login, salvo que el 401 venga del login
    // mismo (credenciales incorrectas) — ahí no hay sesión que cerrar.
    if (res.status === 401 && path !== "/auth/login" && typeof window !== "undefined") {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.detail ?? `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T,>(path: string, token?: string | null) => request<T>(path, { method: "GET" }, token),
  post: <T,>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, token),
  patch: <T,>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, token),
  put: <T,>(path: string, body?: unknown, token?: string | null) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }, token),
};
