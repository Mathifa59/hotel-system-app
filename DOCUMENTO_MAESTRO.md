# Apu Garden Lodge — Documento Maestro

> Documento único de referencia. Reúne **qué tenemos, cómo está armado, cómo se
> conecta cada pieza, cómo se despliega y qué queda pendiente.** Si solo vas a
> leer un archivo, lee este.
>
> Documentos complementarios (más detalle en su tema):
> - [`RESUMEN_IMPLEMENTACION.md`](RESUMEN_IMPLEMENTACION.md) — lista exhaustiva de funcionalidades.
> - [`DEPLOY.md`](DEPLOY.md) — guía original de despliegue (ver aquí la versión corregida).
>
> Última actualización: 2026-06-27.

---

## 1. Qué es esto

Dos proyectos que funcionan juntos para el hotel **Apu Garden Lodge** (Urubamba, Valle Sagrado, Cusco):

| Proyecto | Carpeta | Repo GitHub | Qué es | URL en vivo |
|---|---|---|---|---|
| **Sitio público** | `Apu Garden Lodge Web` | `Mathifa59/apu-garden-lodge-web` | Web de marketing + reservas para huéspedes | https://apu-garden-lodge.com |
| **Sistema de gestión** | `Apu Gestion System` | `Mathifa59/hotel-system-app` | App interna (admin / recepción / limpieza) | https://gestion.apu-garden-lodge.com |

Los dos comparten la misma base de datos a través de la **API del sistema de gestión**: el sitio público no tiene su propia base de datos, le pregunta al backend de gestión por disponibilidad, precios y crea las solicitudes de reserva.

---

## 2. Stack tecnológico

**Sitio público (`apu-garden-lodge-web`)**
- Next.js 16 (App Router) — renderizado en servidor.
- next-intl — bilingüe español (por defecto, sin prefijo en la URL) e inglés (`/en`).
- Tailwind CSS v4.
- motion/react — animaciones de entrada.
- Imágenes reales del hotel en `public/rooms/` (servidas y optimizadas por `next/image`).

**Sistema de gestión (`hotel-system-app`)**
- **Backend**: FastAPI (Python) + SQLAlchemy + Alembic (migraciones).
- **Base de datos**: PostgreSQL 16.
- **Tiempo real**: Redis (pub/sub) + WebSocket — notificaciones instantáneas entre paneles.
- **Frontend de gestión**: Next.js (paneles de admin/recepción/limpieza).
- **Reverse proxy**: nginx.
- Todo orquestado con **Docker Compose**.

---

## 3. Cómo se conecta todo (arquitectura)

```
                         Internet (huésped / staff)
                                   │
                                   ▼
                         ┌───────────────────┐
                         │    Cloudflare     │  DNS + HTTPS (modo SSL: Flexible)
                         │  (proxy naranja)  │  Cloudflare cifra hacia el visitante;
                         └─────────┬─────────┘  hacia el origen va HTTP puro (puerto 80).
                                   │ HTTP
                                   ▼
        ┌──────────────────────── VPS Hetzner (Ubuntu) ────────────────────────┐
        │                          nginx (puerto 80)                            │
        │            enruta por nombre de dominio (subdominios):                │
        │                                                                       │
        │   apu-garden-lodge.com ─────────────► contenedor "web" (Next.js)      │
        │                                          (sitio público)              │
        │                                              │ llama a /api          │
        │   gestion.apu-garden-lodge.com ──┬─► /api  ─► contenedor "backend"    │
        │                                  │             (FastAPI)              │
        │                                  ├─► /ws   ─► backend (WebSocket)      │
        │                                  └─► /    ──► contenedor "frontend"    │
        │                                              (paneles de gestión)     │
        │                                                                       │
        │   backend ─► PostgreSQL ("db")   ◄── datos (cuartos, reservas, ...)   │
        │   backend ─► Redis ("redis")     ◄── pub/sub para WebSocket           │
        └───────────────────────────────────────────────────────────────────────┘
```

**El flujo de una reserva desde la web** (la pieza que une los dos proyectos):
1. El huésped entra a `apu-garden-lodge.com/reservas`, elige fechas.
2. El sitio público llama a `gestion.apu-garden-lodge.com/api/public/availability` → el backend consulta Postgres y responde qué tipos de cuarto hay libres y a qué precio.
3. El huésped envía la solicitud → `POST /api/public/booking-requests` → el backend crea una reserva **pendiente** y notifica a recepción **en tiempo real** (WebSocket) en el panel de gestión.
4. Recepción confirma/rechaza desde su panel.

---

## 4. Dónde vive el código (IMPORTANTE — esto causó confusión)

Hay **tres copias** de cada proyecto. Entender esto evita el problema de "pusheo pero no veo cambios":

```
   TU MÁQUINA                      GITHUB                      EL SERVIDOR (VPS)
   ───────────                     ──────                      ─────────────────
   Desktop/Apu Garden Lodge/  ──►  Mathifa59/             ──►  ~/apu-garden-lodge-web
     Apu Garden Lodge Web/         apu-garden-lodge-web        ~/apu-gestion-system
     Apu Gestion System/           Mathifa59/
                                   hotel-system-app
        (git push)                                              (git pull + rebuild)
```

- **Tu máquina** → editas y haces `git commit` + `git push` a GitHub. ✅ Esto ya funciona.
- **GitHub** → es el punto central, la "fuente de verdad". Tiene todo.
- **El servidor** → tiene que hacer `git pull` para bajar lo nuevo, y **reconstruir los contenedores Docker** para que la app corra el código nuevo.

> ⚠️ **La causa del problema "pusheo pero no veo cambios"**: el último eslabón
> (servidor: pull + rebuild) **no es automático**. Pushear a GitHub NO actualiza
> el servidor por sí solo (esto no es Vercel/Netlify). Hay que ejecutar el
> despliegue en el servidor. Ver sección 5.

---

## 5. Cómo desplegar (el flujo correcto)

**Cada vez que quieras que tus cambios salgan en vivo:**

```bash
# 1. En tu máquina — sube los cambios a GitHub (en CADA repo que tocaste):
git add -A && git commit -m "descripción" && git push

# 2. Dispara el despliegue en el servidor (un solo comando):
ssh apu-garden-lodge "cd apu-gestion-system && ./deploy.sh"
```

El script [`deploy.sh`](deploy.sh) hace, en el servidor: `git pull` de ambos repos → reconstruye los contenedores → aplica migraciones de base de datos → muestra el estado. Es idempotente y seguro de correr cuantas veces quieras.

**Si después no ves los cambios en el navegador:**
1. Abre el sitio en **ventana de incógnito**, o haz **Ctrl+Shift+R** (recarga forzada) — es caché del navegador.
2. Si aún así no aparece, purga la caché de Cloudflare (panel → Caching → Configuration → **Purge Everything**). *Nota: hoy Cloudflare está en modo `DYNAMIC` y no cachea el HTML, así que normalmente basta con el incógnito.*

**Detalle técnico del despliegue** (lo que hace `docker compose` en producción):
- Usa `docker-compose.yml` (base) + `docker-compose.prod.yml` (override de producción).
- El override quita el hot-reload, construye los frontends en modo producción (`next build`) y monta `nginx/nginx.prod.conf` (que agrega el server block del sitio público y enruta por subdominio).
- El contexto de build del sitio público es `../apu-garden-lodge-web` (repo hermano, clonado al lado).

---

## 6. Servidor y servicios externos

| Cosa | Detalle |
|---|---|
| **VPS** | Hetzner CX23, Nuremberg, Ubuntu. IP: `188.34.202.143`. |
| **Acceso SSH** | Alias `apu-garden-lodge` (configurado en `~/.ssh/config`). Usuario `deploy`. |
| **DNS + HTTPS** | Cloudflare. Proxy activado (nube naranja). Modo SSL: **Flexible**. |
| **Dominios** | `apu-garden-lodge.com` (+ `www`) → sitio público. `gestion.apu-garden-lodge.com` → gestión. |
| **Firewall del sistema** | `ufw` activo en el VPS (puertos 80, 443, SSH). |
| **GitHub** | Dos repos bajo la cuenta `Mathifa59` (ver tabla sección 1). |

**Contenedores en producción** (6): `db` (Postgres), `redis`, `backend` (FastAPI), `frontend` (paneles de gestión), `web` (sitio público), `nginx`.

---

## 7. Configuración y secretos

- Cada repo de gestión tiene un archivo **`.env`** en el servidor (NO está en git) con: contraseña de Postgres, `JWT_SECRET`, y credenciales del admin inicial (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).
- Plantilla de referencia: `backend/../.env.example`.
- Los secretos de producción son distintos de los de desarrollo local.
- **El usuario admin NO se crea solo** al iniciar: la primera vez se corre `docker compose ... exec backend python -m app.seed` (ya hecho en producción). Si recreas la base de datos desde cero, hay que repetirlo.

---

## 8. Base de datos

- PostgreSQL 16, datos en un volumen Docker (`pg_data`) que sobrevive reinicios/actualizaciones — **pero no a un disco dañado ni a un borrado.**
- Migraciones con Alembic (`backend/alembic/versions/`). Se aplican con `alembic upgrade head` (el `deploy.sh` ya lo hace).
- **Cargar los 42 cuartos**: ya hechos en producción (3 pisos × 14, con la distribución de tipos y frigobar). Si recreas la base, hay que recargarlos.

---

## 9. Funcionalidades (resumen)

Detalle completo en [`RESUMEN_IMPLEMENTACION.md`](RESUMEN_IMPLEMENTACION.md). En una línea cada bloque:

- **Sitio público**: 5 tipos de cuarto con galería y modal de detalle, buscador de disponibilidad real, formulario de reserva, servicios/amenities, FAQ, páginas Nosotros/Novedad/Contacto con mapa, bilingüe, SEO técnico completo (metadata, sitemap, JSON-LD con coordenadas GPS, Open Graph, manifest PWA), enlaces a Booking.com.
- **Gestión**: 3 roles (admin/recepción/limpieza), mapa de cuartos en vivo, notificaciones en tiempo real (WebSocket), tarifas y moneda PEN/USD, frigobar configurable por cuarto, ciclo completo de reserva (crear/editar/confirmar/check-in/folio/check-out/cancelar), cargos con flujo de aprobación, reportes (ocupación, frigobar, ingresos por periodo), historial por cuarto.

---

## 10. Seguridad

**Aplicado:**
- Auth por JWT (Bearer), expiración 12 h. Contraseñas con hash (bcrypt).
- Rate limit por IP real (lee `CF-Connecting-IP` detrás de Cloudflare) en endpoints públicos y en `/auth/login` (anti fuerza bruta).
- Validación de email (`EmailStr`) + honeypot anti-bot en el formulario público de reserva.
- `ufw` en el VPS; queries vía ORM (sin inyección SQL).

**Diferido a propósito** (ver sección 11, técnico):
- Posible doble reserva por condición de carrera (sin constraint de exclusión en BD).
- Zona horaria: servidor en UTC vs hotel en Perú (UTC-5) — desvíos de horas en bordes de día.
- Cloudflare "Flexible" deja el tramo Cloudflare↔origen sin cifrar.

---

## 11. Pendientes

**Operativo (lo hace el dueño/staff, sin código):**
1. Crear cuentas reales de recepción y de cada housekeeper (hoy solo existe el admin).
2. Cargar el catálogo real de frigobar.
3. Cambiar la contraseña del admin.
4. Definir un correo de contacto real.
5. Crear/completar el **Google Business Profile** (lo más importante para aparecer en búsquedas).
6. Reconciliación manual con Booking.com (no hay sincronización automática — requiere un Channel Manager de pago).

**Técnico:**
1. **Respaldos automáticos de la BD — no configurados aún.** El script existe (`scripts/backup.sh`), falta agregarlo al cron del servidor. Es lo más urgente.
2. Confirmar el Cloud Firewall de Hetzner (capa de red separada de `ufw`).
3. Doble reserva por carrera (constraint de exclusión en Postgres). Diferido.
4. Zona horaria a `America/Lima`. Diferido.
5. (Opcional) Pasar Cloudflare a "Full (strict)" con certificado de origen.

---

## 12. Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| **"Pusheo pero no veo cambios"** | El servidor no hizo pull+rebuild | Correr `ssh apu-garden-lodge "cd apu-gestion-system && ./deploy.sh"` (sección 5) |
| Veo cambios viejos tras desplegar | Caché del navegador | Ventana de incógnito o Ctrl+Shift+R |
| Error 521 en el sitio | Modo SSL de Cloudflare mal | Debe estar en **Flexible** (el origen sirve HTTP, no HTTPS) |
| El admin no puede entrar tras recrear la BD | Falta el seed | `docker compose ... exec backend python -m app.seed` |
| Una petición da 403 desde un script | Cloudflare bloquea user-agents "de bot" | Usar un User-Agent de navegador normal |
