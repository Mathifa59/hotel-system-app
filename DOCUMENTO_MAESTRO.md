# Apu Garden Lodge — Documento Maestro

> Documento único de referencia. Reúne **qué tenemos, cómo está armado, cómo se
> conecta cada pieza, cómo se despliega y qué queda pendiente.** Si solo vas a
> leer un archivo, lee este.
>
> Documentos complementarios (más detalle en su tema):
> - [`RESUMEN_IMPLEMENTACION.md`](RESUMEN_IMPLEMENTACION.md) — lista exhaustiva de funcionalidades, feature por feature.
> - [`DEPLOY.md`](DEPLOY.md) — guía de despliegue.
>
> Última actualización: 2026-07-24.

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
- **Frontend de gestión**: Next.js 16 (App Router) + Tailwind CSS v4, paneles de admin/recepción/limpieza.
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

Config nginx real: [`nginx/nginx.conf`](nginx/nginx.conf) (local, un solo dominio) vs [`nginx/nginx.prod.conf`](nginx/nginx.prod.conf) (producción, dos `server{}` por subdominio — ver sección 6).

**El flujo de una reserva desde la web** (la pieza que une los dos proyectos):
1. El huésped entra a `apu-garden-lodge.com/reservas`, elige fechas.
2. El sitio público llama a `gestion.apu-garden-lodge.com/api/public/availability` → el backend consulta Postgres y responde qué tipos de cuarto hay libres y a qué precio.
3. El huésped envía la solicitud → `POST /api/public/booking-requests` → el backend crea una reserva **pendiente** y notifica a recepción **en tiempo real** (WebSocket) en el panel de gestión.
4. Recepción confirma/rechaza desde su panel (o la edita para asignar cuarto si quedó en lista de espera).

---

## 4. Dónde vive el código

Hay **tres copias** de cada proyecto. Entender esto evita el problema de "pusheo pero no veo cambios":

```
   TU MÁQUINA                      GITHUB                      EL SERVIDOR (VPS)
   ───────────                     ──────                      ─────────────────
   Desktop/Apu Garden Lodge/  ──►  Mathifa59/             ──►  ~/apu-garden-lodge-web
     Apu Garden Lodge Web/         apu-garden-lodge-web        ~/apu-gestion-system
     Apu Gestion System/           Mathifa59/
                                   hotel-system-app
        (git push)                                              (git pull + rebuild automático)
```

- **Tu máquina** → editas y haces `git commit` + `git push` a GitHub.
- **GitHub** → punto central. Un workflow de **GitHub Actions** (`.github/workflows/deploy.yml`, vive en el repo de gestión) se dispara con cada push a `main` y entra por SSH al VPS a correr `deploy.sh`.
- **El servidor** → el despliegue **ya es automático** (dejó de ser manual desde que se agregó el workflow). `deploy.sh` hace `git pull` de ambos repos, reconstruye contenedores y aplica migraciones — ver sección 5.

---

## 5. Cómo desplegar

**Flujo normal (automático):**

```bash
git add -A && git commit -m "descripción" && git push
```

Eso solo. GitHub Actions dispara el deploy por SSH automáticamente. Puedes ver el progreso en la pestaña **Actions** del repo en GitHub.

**Si necesitas dispararlo a mano** (o el workflow falló):

```bash
ssh apu-garden-lodge "cd apu-gestion-system && ./deploy.sh"
```

El script [`deploy.sh`](deploy.sh) hace, en el servidor: toma un candado `flock` (evita que dos deploys corran a la vez si pusheas a ambos repos casi junto) → `git pull` de ambos repos → reconstruye los contenedores → aplica migraciones de base de datos (`alembic upgrade head`) → muestra el estado. Es idempotente y seguro de correr cuantas veces quieras.

**Si después no ves los cambios en el navegador:**
1. Ventana de incógnito o **Ctrl+Shift+R** (caché del navegador).
2. Si aún así no aparece: purgar caché de Cloudflare (panel → Caching → Configuration → **Purge Everything**).

---

## 6. Servidor y servicios externos

| Cosa | Detalle |
|---|---|
| **VPS** | Hetzner CX23, Nuremberg, Ubuntu. IP: `188.34.202.143`. |
| **Acceso SSH** | Alias `apu-garden-lodge` (configurado en `~/.ssh/config`, llave `apu_garden_lodge_hetzner`). Usuario `deploy`. |
| **DNS + HTTPS** | Cloudflare. Proxy activado (nube naranja). Modo SSL: **Flexible** (diferido pasar a Full-strict, ver sección 11). |
| **Dominios** | `apu-garden-lodge.com` (+ `www`) → sitio público. `gestion.apu-garden-lodge.com` → gestión. |
| **Firewall del sistema** | `ufw` activo en el VPS (puertos 80, 443, SSH). Cloud Firewall de Hetzner (capa de red aparte) — **nunca confirmado si está adjuntado**, revisar en el panel. |
| **GitHub** | Dos repos bajo la cuenta `Mathifa59` (ver tabla sección 1). |
| **Respaldos de BD** | **Configurados** — cron corriendo `scripts/backup.sh` en el servidor (agregado directamente por SSH, fuera del flujo normal de deploy). |

**Contenedores en producción** (6): `db` (Postgres), `redis`, `backend` (FastAPI), `frontend` (paneles de gestión), `web` (sitio público), `nginx`.

---

## 7. Configuración y secretos

- Cada repo de gestión tiene un archivo **`.env`** en el servidor (NO está en git) con: contraseña de Postgres, `JWT_SECRET`, y credenciales del admin inicial.
- Variables que lee el backend (`backend/app/core/config.py`): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_ALGORITHM` (default `HS256`), `JWT_EXPIRE_MINUTES` (default `720` = 12h), `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
- Los secretos de producción son distintos de los de desarrollo local.
- El usuario admin **no se crea solo** al iniciar: se corre `docker compose ... exec backend python -m app.seed` (ya hecho en producción). Si se recrea la base desde cero, hay que repetirlo.

---

## 8. Base de datos

- PostgreSQL 16, datos en un volumen Docker (`pg_data`) que sobrevive reinicios/actualizaciones — pero no a un disco dañado ni a un borrado.
- Migraciones con Alembic (`backend/alembic/versions/`), cadena de 15 migraciones a la fecha (revisión actual: `d9a1c5e7b3f8`). Se aplican con `alembic upgrade head` (el `deploy.sh` ya lo hace en cada deploy).
- **14 cuartos reales** cargados en producción: piso 1 (101-104), piso 2 (201-205), piso 3 (301-305), repartidos entre los 6 tipos reales (ver sección 9). Para confirmar la asignación exacta de cada número de cuarto, consultar `GET /api/rooms` directamente — no está hardcodeada en ningún doc porque cambia si el admin la edita.
- **Hay datos de prueba mezclados con reservas reales en producción** (creados por el dueño mientras probaba el sistema, antes de que empezara a operar en serio). Pendiente de identificar y limpiar — ver sección 11.

---

## 9. Funcionalidades (resumen)

Detalle completo en [`RESUMEN_IMPLEMENTACION.md`](RESUMEN_IMPLEMENTACION.md). En una línea cada bloque:

- **Sitio público**: 5 tipos de cuarto con galería y modal de detalle, buscador de disponibilidad real, formulario de reserva, servicios/amenities, FAQ, páginas Nosotros/Novedad/Contacto con mapa, bilingüe, SEO técnico completo.
- **Gestión**: 3 roles (admin/recepción/limpieza), mapa de cuartos en vivo, notificaciones en tiempo real, 6 tipos de cuarto con tarifa profesional/promocional elegible por reserva, frigobar configurable, ciclo completo de reserva (crear/editar/confirmar/check-in/folio/check-out/cancelar), **registro de estadías pasadas** (walk-ins no cargados a tiempo), **reportes con KPIs** (ocupación, ADR, RevPAR, ingresos por día/tipo/tarifa/origen) accesibles para admin y recepción, modo claro/oscuro, notificaciones tipo toast, historial simplificado por cuarto.

---

## 10. Modelo de datos — piezas clave para razonar sobre el sistema

Estas son las decisiones de diseño que no son obvias con solo mirar el código, y que conviene tener en la cabeza antes de tocar reservas/cargos/reportes:

### Reserva (`Reservation`)
- `status`: `pending` (por confirmar/llegar) → `active` (con check-in) → `checked_out` (cerrada, con cobro) → o `cancelled` en cualquier punto antes de `active`.
- `room_id` puede ser `NULL` — es una reserva en **lista de espera** (pedida desde la web sin cupo). `requested_room_type` guarda qué tipo pidió mientras no tenga cuarto asignado.
- `rate_plan`: `professional` (tarifa estándar) o `promotional` (rebajada) — se elige **por reserva**, no por tipo de cuarto. El mismo cuarto puede venderse a cualquiera de las dos según el caso.
- `source`: `staff` (creada por recepción) o `website` (solicitud del sitio público, requiere `confirmed=true` antes de contar como reserva firme).
- Constraint `EXCLUDE USING gist` en Postgres (migración `c7d2f4a8e1b6`) impide dos reservas `pending`/`active` en el mismo cuarto con fechas que se crucen — **a nivel de base de datos**, no solo con un `SELECT` en Python. Esto es lo que de verdad blinda contra dos requests concurrentes por el último cuarto libre.

### Estadías pasadas (`POST /reservations/historical`)
Camino **separado** del flujo en vivo (crear → check-in → check-out), para cargar una estadía que **ya terminó** y no se registró a tiempo (walk-in olvidado, backlog previo al sistema). Entra directo como `checked_out`, con su cargo de alojamiento ya `billed`, **sin** tocar el estado del cuarto ni crear tarea de limpieza ni disparar notificaciones — todo eso solo tiene sentido para algo que está pasando *ahora*. Valida que las fechas sean pasadas y que no se crucen con otra estadía ya registrada en ese cuarto (activa, pendiente o cerrada).

### Cargo (`Charge`) — `occurred_at` vs `created_at`
- `created_at`: cuándo se **registró** el cargo (auditoría).
- `occurred_at`: cuándo **ocurrió de verdad** el consumo/alojamiento (económico). Para un cargo normal ambos coinciden; para una estadía pasada cargada hoy, `occurred_at` es la fecha real de la estadía.
- **Los reportes filtran por `occurred_at`, nunca por `created_at`** — así una estadía de marzo cargada en julio suma a los ingresos de marzo, no a los de julio. Si se agrega cualquier reporte nuevo que sume dinero, tiene que usar `occurred_at`.
- El folio (`GET /reservations/{id}/folio`) excluye del listado de "cargos extra" los de tipo `room` — ya se muestran aparte como `room_charge_pen/usd` calculado al vuelo; sumarlos también duplicaría el alojamiento.

### Reportes (`GET /reports/stats`) — prorrateo por noche
El indicador central no es "reservas del mes" sino **noches**. Una estadía del 28 de julio al 3 de agosto aporta 4 noches (28,29,30,31) a julio y 3 (1,2,3) a agosto, cada una con su ingreso — así ocupación/ADR/RevPAR son comparables entre periodos sin que una estadía larga distorsione el mes en que empieza o termina. Cuenta reservas `active` (para reflejar huéspedes alojados ahora mismo) y `checked_out`, nunca `pending` ni `cancelled`. Ver `app/routers/reports.py::stats_report` para la implementación completa (`_stay_nights`, prorrateo, cortes por tipo/tarifa/cuarto/origen).

**Por qué el reporte puede mostrar más actividad de la que ves en "Reservas"**: la pestaña Reservas oculta a propósito las `checked_out`/`cancelled` (para no acumular filas muertas), pero **sí** cuentan en Reportes. Si el número de "Llegadas" o "Ingresos" del mes no cuadra con lo que ves en la lista de Reservas, casi seguro hay estadías ya cerradas ese mismo mes que ya no se muestran ahí.

### Roles y permisos (backend, `require_role`)
- **Reportes** (`/reports/*`): `admin` + `reception`.
- **Registrar consumo de frigobar** (`POST /minibar/consumptions`): `admin` + `reception` + `cleaning` (los tres — corregido esta sesión, antes excluía a recepción sin que se notara en el frontend, que sí mostraba el botón).
- **Registrar estadía pasada** (`POST /reservations/historical`): `admin` + `reception`.

---

## 11. Pendientes

**Operativo (lo hace el dueño/staff, sin código):**
1. **Limpiar datos de prueba de producción** — el dueño confirmó que hay reservas/registros que él mismo creó probando el sistema, mezclados con reservas reales. Identificarlos y borrarlos requiere una consulta SQL de solo lectura contra producción primero (para confirmar cuáles son cuáles antes de borrar nada) — bloqueado por el clasificador automático de permisos de esta sesión al intentar correr el comando SSH; pendiente que el usuario apruebe el permiso o corra la consulta él mismo (ver mensaje de la sesión donde se ofrecieron ambas rutas).
2. Crear cuentas reales de recepción y de cada housekeeper si aún no existen todas.
3. Cargar/completar el catálogo real de frigobar.
4. Cambiar la contraseña del admin si sigue siendo la generada al inicio.
5. Definir un correo de contacto real.
6. Google Business Profile, backlinks (TripAdvisor, Booking.com, etc.) — ver `RESUMEN_IMPLEMENTACION.md` para el detalle de SEO.
7. **Monitoreo de uptime** (ej. UptimeRobot) — no configurado, es tarea del dueño (no requiere código).

**Técnico:**
1. Confirmar el Cloud Firewall de Hetzner (capa de red separada de `ufw`) — nunca verificado.
2. Zona horaria: servidor en UTC vs hotel en Perú (UTC-5) — desvíos posibles en cálculo de noches y señales de fecha en los bordes del día. Diferido a propósito, sigue sin resolver.
3. (Opcional) Cloudflare "Flexible" → "Full (strict)" con certificado de origen — requiere acceso al dashboard de Cloudflare del dueño.
4. Registrar consumo de frigobar en una **estadía pasada**: hoy el cargo de esa estadía nace con `occurred_at` = fecha de la estadía, pero si alguien le agrega frigobar *después*, ese cargo nuevo tomaría la fecha de hoy (no la de la estadía) — no se implementó porque no hacía falta para el alcance acordado ("solo alojamiento + pago"), pero es un cambio chico si se necesita (el campo `occurred_at` ya existe en `Charge`).

**Ya resuelto — corregir en futuras lecturas de este doc si aparece como pendiente en otro lado:**
- ~~Posible doble reserva por condición de carrera~~ → resuelto con constraint `EXCLUDE` en Postgres (migración `c7d2f4a8e1b6`), probado con 8 requests concurrentes reales.
- ~~Respaldos automáticos de la BD~~ → configurados vía cron.
- ~~Reportes solo para admin~~ → recepción también tiene acceso desde esta sesión.

---

## 12. Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| "Pusheo pero no veo cambios" | El workflow de deploy falló o no corrió | Revisar la pestaña Actions en GitHub; si hace falta, disparar a mano: `ssh apu-garden-lodge "cd apu-gestion-system && ./deploy.sh"` |
| Veo cambios viejos tras desplegar | Caché del navegador | Ventana de incógnito o Ctrl+Shift+R |
| Error 521 en el sitio | Modo SSL de Cloudflare mal | Debe estar en **Flexible** (el origen sirve HTTP, no HTTPS) |
| El admin no puede entrar tras recrear la BD | Falta el seed | `docker compose ... exec backend python -m app.seed` |
| Una petición da 403 desde un script | Cloudflare bloquea user-agents "de bot" | Usar un User-Agent de navegador normal |
| Un reporte no cuadra con lo que se ve en "Reservas" | Reportes cuenta `checked_out` que Reservas ya oculta | Ver sección 10, "Reportes — prorrateo por noche" |
| El botón de frigobar parece no hacer nada para recepción | Ya corregido — antes el backend bloqueaba a `reception` en `/minibar/consumptions` sin que el frontend avisara | Confirmar que el deploy con el fix ya salió (commit de esta sesión) |
