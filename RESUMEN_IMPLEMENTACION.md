# Apu Garden Lodge — Resumen de implementación

Este documento resume todo lo construido hasta ahora en los dos proyectos:

- **Apu Garden Lodge Web** — sitio público (marketing + reservas)
- **Apu Gestion System** — sistema interno de gestión del hotel (admin / recepción / limpieza)

---

## 1. Apu Garden Lodge Web (sitio público)

**Stack:** Next.js 16 (App Router) + next-intl (es/en) + Tailwind CSS v4.

### Marca y diseño
- Logo, paleta de colores (verde oliva, terracota/arcilla, miel) y tipografía aplicados en todo el sitio — posicionamiento boutique/premium, no de hotel económico.
- Favicon real generado desde el ícono del logo (no un genérico).
- Todas las fotos de stock que no pertenecían al hotel fueron eliminadas — solo se conservan fotos reales de las habitaciones y las del cielo estrellado/observatorio.

### Habitaciones
- **5 tipos reales**: Individual, Doble, Doble Deluxe, Doble Deluxe (2 camas), Deluxe con cama extragrande.
- Fotos reales organizadas por tipo, con galería tipo carrusel (flechas + miniaturas).
- Modal de detalle por habitación (al estilo Booking.com) con: tamaño (m²), configuración de cama, vista, descripción, checklist de baño privado, checklist de equipamiento, y política de no fumar.
- Precios visibles en soles (S/) por noche, traídos en vivo desde el backend de gestión.

### Reservas
- Buscador de disponibilidad real (consulta al backend) por fechas.
- Formulario de solicitud de reserva (nombre, correo, teléfono, notas) que crea una reserva pendiente en el sistema de gestión.
- Sección de preguntas frecuentes (FAQ).

### Otras secciones
- "Hasta el último detalle": 8 categorías de amenities del hotel completo (habitación, baño, comida, bienestar, actividades, recepción, seguridad, políticas).
- Página Nosotros, Novedad (observación astronómica), Contacto.
- Todo en español e inglés.

### SEO
- Metadata por página y por idioma (título, descripción), canonical y hreflang (es/en) en las 6 páginas.
- Sitemap.xml y robots.txt generados automáticamente.
- Datos estructurados (JSON-LD, `LodgingBusiness`): nombre, dirección, teléfono, amenities, rango de precio.
- Open Graph y Twitter Card con imagen propia (no genérica) en todas las páginas.
- Manifest web (PWA) con íconos reales.
- **Pendiente, depende del dueño**: coordenadas GPS exactas para el dato estructurado (hoy solo hay dirección en texto) — necesita un link de Google Maps con el pin correcto.

---

## 2. Apu Gestion System (sistema interno)

**Stack:** FastAPI + PostgreSQL + Redis + Next.js (admin/recepción/limpieza) + nginx, todo en Docker Compose.

### Roles
Tres roles de usuario: **admin**, **recepción**, **limpieza** (housekeeper). Cada uno tiene su propio panel y permisos.

### Cuartos
- **14 cuartos reales** cargados: piso 1 (101-104, 4 cuartos), piso 2 (201-205, 5 cuartos), piso 3 (301-305, 5 cuartos) — repartidos entre los 5 tipos reales, todos con frigobar activado.
- Edición de número, piso, tipo y si tiene frigobar — disponible para admin y housekeeper.
- Mapa de cuartos con estado en vivo (Disponible / Ocupado / En limpieza / Limpio / Mantenimiento / No molestar).
- Botón **"Marcar disponible para nuevo huésped"** cuando un cuarto queda "Limpio", para no olvidar liberarlo.
- Historial por cuarto ("Ver historial") que muestra **quién hizo qué y cuándo**: creación, ediciones, cambios de estado, solicitudes de limpieza, registros de frigobar — con el nombre real de la persona, no solo la acción.

### Notificaciones en tiempo real
- WebSocket + Redis pub/sub: los cambios de estado de un cuarto, nuevas solicitudes de limpieza, cargos nuevos, etc. se reflejan al instante en las pantallas de todos los roles conectados, sin recargar.
- Indicador "En vivo" / "Reconectando" en cada panel.

### Tarifas y moneda
- Tarifa fija por noche para cada uno de los 5 tipos de habitación, en soles **y** dólares (carga manual, no hay conversión automática por tipo de cambio).
- Botón de moneda (S/ PEN ⇄ $ USD) en el header, visible en toda la app, que cambia qué cifra se muestra en frigobar, cargos y reportes. Se recuerda la preferencia.

### Frigobar
- Catálogo de productos (bebidas/snacks) con precio en soles y dólares.
- Stock por cuarto.
- El housekeeper puede **agregar productos y cantidades directamente** desde el detalle del cuarto (no solo el admin) — escribe el nombre, la cantidad y el precio, y si el producto ya existe solo actualiza la cantidad.
- Registro de consumo: al limpiar un cuarto, el housekeeper marca lo que el huésped consumió, lo que genera automáticamente un cargo.
- El registro de consumo funciona aunque el huésped ya haya hecho check-out (antes esto se bloqueaba justo cuando el housekeeper lo necesitaba).

### Reservas
- Crear reserva (cuarto, huésped, documento, teléfono, número de huéspedes, fechas).
- **Editar una reserva existente**: cambiar fechas (extender o acortar estadía), cuarto, número de huéspedes, o corregir el nombre — sin tener que cancelar y volver a crear. Si se cambia de cuarto en una reserva activa, el cuarto viejo pasa a "en limpieza" y el nuevo a "ocupado" automáticamente.
- Check-in (valida que el cuarto esté disponible y la reserva confirmada).
- Check-out → genera automáticamente:
  - Un cargo de "Alojamiento" (noches × tarifa, en soles y dólares).
  - Una tarea de limpieza para el housekeeper, ya vinculada a esa reserva (para que el frigobar funcione correctamente, ver arriba).
- **Cancelar** una reserva pendiente (libera el cuarto inmediatamente para otras fechas).
- **Liberar no-shows**: botón que cancela en bloque todas las reservas pendientes cuya fecha de llegada ya pasó.
- Señales visuales: "Salida vencida" (huésped activo que debió irse) y "No llegó" (reserva pendiente cuya llegada ya pasó) — tanto en la lista de reservas como en el mapa de cuartos.
- Validación de aforo: cada tipo de cuarto tiene un máximo de huéspedes (Individual = 1, el resto = 2), y no se puede reservar por encima de eso.
- Solicitudes del sitio web: panel separado para confirmar o rechazar (llamando al huésped) antes de que ocupen el cuarto en firme.
- Un cuarto en mantenimiento no se ofrece en la disponibilidad del sitio web.

### Cuenta del huésped (folio) al check-out
- Antes de confirmar el check-out, se muestra un resumen con: noches de alojamiento, todos los cargos de esa reserva (frigobar, daños, extras) con su estado, y el total a cobrar — siempre informativo, el cobro es en persona.
- Solo se facturan automáticamente el cargo de alojamiento y los cargos ya **aprobados**; los pendientes de revisión no bloquean la salida del huésped y se cobran después.

### Cargos
- Crear cargos manuales (daño, limpieza extra, otro) en soles y dólares.
- Flujo: pendiente → aprobado (admin) → cobrado (recepción).
- **Corregir** un cargo pendiente (monto o descripción, por si alguien se equivocó).
- **Anular** cualquier cargo no anulado — queda excluido de la cuenta del huésped y de los reportes.

### Reportes
- Ocupación (cuartos por estado, % de ocupación).
- Consumo de frigobar (por producto, cantidad y revenue).
- **Ingresos por periodo**: suma de todos los cargos no anulados (alojamiento + frigobar + daños + extras) agrupados por tipo, con selector de fechas — el reporte de gestión más completo.

### Marca en la app de gestión
- Logo real (no un texto genérico) en el header, login y pantallas de carga.
- Favicon e íconos de instalación (PWA) generados desde el logo real.

### Enlaces a Booking.com
- El sitio público (footer) y la página de links del QR de la tarjeta tienen ahora un link directo a la ficha real del hotel en Booking.com.
- **No existe sincronización automática de disponibilidad** entre Booking.com y este sistema — Booking.com no abre su API de conectividad a sistemas hechos a medida, solo a Channel Managers certificados (SiteMinder, Cloudbeds, Hotelrunner, etc.). Hoy la única forma de evitar dobles reservas entre canales es reconciliar a mano: cuando entra una reserva por Booking.com, registrarla también en este sistema (y viceversa).

### Seguridad (auditoría y fixes aplicados)
Tras una revisión crítica del código encontrada con un análisis "abogado del diablo", se corrigieron 3 huecos reales:
- **Límite de tasa (rate limit) llaveado a la IP equivocada**: detrás de Cloudflare + nginx, el límite por IP usaba la IP interna de nginx (la misma para todos los visitantes), volviéndose un balde compartido en vez de un límite por persona. Ahora lee `CF-Connecting-IP` / `X-Forwarded-For` para identificar al visitante real.
- **Login sin límite de intentos**: se agregó un tope de 10 intentos/minuto por IP en `/auth/login` para frenar fuerza bruta.
- **Formulario público de reserva sin validar el correo y sin protección anti-bot**: el correo ahora se valida con formato real (`EmailStr`), y se agregó un campo honeypot oculto — si un bot lo llena (los humanos nunca lo ven), la solicitud se descarta en silencio sin crear una reserva ni notificar a recepción.

**Quedan pendientes, identificados pero diferidos a propósito** (ver sección 5, técnico):
- Posible doble reserva por condición de carrera (sin lock ni constraint de base de datos a nivel `(cuarto, rango de fechas)`).
- Cálculo de noches y señales de fecha (no-show, salida vencida) comparando fechas sin normalizar correctamente a la zona horaria de Perú (servidor corre en UTC, en un VPS en Alemania).

---

## 3. Decisiones de negocio confirmadas

- **Tarifas fijas** por tipo de habitación, manuales, en soles y dólares — sin pasarela de pago, todo se cobra en persona.
- **Todo el sistema de cargos/folio es informativo y señalativo**: el valor está en que el staff sepa qué se debe y a quién, no en procesar pagos dentro de la app.
- **Política de cancelación con cargo (24h)** queda pendiente para una fase futura — hoy se puede cancelar una reserva pendiente sin penalidad.
- **Aforo por tipo de habitación**: Individual = 1 huésped; Doble, Doble Deluxe, Doble Deluxe (2 camas) y Deluxe con cama extragrande = 2 huéspedes. (Ajustable si la realidad del hotel es distinta.)

---

## 4. Estado técnico actual — EN PRODUCCIÓN

El sistema está desplegado y en vivo, no solo en desarrollo local:

- **Sitio público**: https://apu-garden-lodge.com — en vivo.
- **Sistema de gestión**: https://gestion.apu-garden-lodge.com — en vivo.
- **Infraestructura**: VPS Hetzner (CX23, Nuremberg) corriendo Docker Compose (Postgres, Redis, backend, frontend de gestión, sitio público, nginx). DNS y HTTPS gestionados por Cloudflare (proxy activado, modo SSL Flexible). Detalle completo del despliegue y de los problemas ya resueltos en el camino: ver [DEPLOY.md](DEPLOY.md).
- Secretos de producción (contraseña de DB, JWT, admin) ya reemplazados — distintos de los de desarrollo local.
- Migraciones de base de datos aplicadas en producción (Alembic) — base de datos arrancó vacía y limpia.
- Existe la cuenta de admin (creada manualmente con `python -m app.seed`, ver DEPLOY.md — este paso no es automático).
- **14 cuartos reales cargados** en producción (piso 1: 101-104, piso 2: 201-205, piso 3: 301-305), con frigobar activado en todos.
- El catálogo de frigobar está vacío — listo para cargarse desde la app misma.
- El sitio público apunta a la API real de producción (`gestion.apu-garden-lodge.com/api`).
- WebSocket de notificaciones en tiempo real verificado funcionando a través de Cloudflare en producción.
- **Ciclo completo verificado en vivo contra producción** (no solo en desarrollo): reserva desde el sitio web → confirmar → check-in → cargo → folio (matemática de noches × tarifa + cargos confirmada exacta) → check-out (genera cargo de alojamiento, factura cargos aprobados, crea tarea de limpieza) → WebSocket recibiendo los eventos en tiempo real durante todo el proceso. Se usó una reserva claramente marcada como prueba y se limpió después (cargos anulados, cuarto repuesto a "disponible"); ver nota en sección 5 sobre el registro histórico que queda.

## 5. Lo que queda pendiente

### Operativo (lo hace el dueño/staff, sin tocar código)
1. Crear las cuentas reales de recepción y de cada housekeeper (admin → Usuarios) — hoy solo existe el admin.
2. Cargar el catálogo real de frigobar (productos y precios).
3. Cambiar la contraseña del admin (la actual es una generada al azar para el primer acceso).
4. Confirmar un correo de contacto real — todavía no existe uno; se quitó del sitio hasta que lo haya.
5. Coordenadas GPS exactas del lodge (hoy el mapa usa la dirección en texto).
6. Crear/completar el perfil de **Google Business Profile** — el paso más importante para aparecer en búsquedas de "hotel Urubamba" / "hotel Cusco", y es 100% gestión del dueño, no código.
7. Reconciliación manual con Booking.com (ver sección de Booking.com arriba) — no hay forma de automatizarla sin contratar un Channel Manager de pago.

### Técnico
1. **Respaldos automáticos de la base de datos — no configurados aún.** Hoy si el VPS falla, se pierde todo. El script ya existe (`scripts/backup.sh`), solo falta agregarlo al cron del servidor. Ver DEPLOY.md, sección "Respaldo de la base de datos". Es la tarea técnica más urgente.
2. **Confirmar el Cloud Firewall de Hetzner** — nunca se confirmó si está creado y adjuntado al servidor (es una capa de red separada del firewall ufw del sistema, que sí está activo).
3. El modo SSL "Flexible" de Cloudflare deja el tramo Cloudflare↔servidor sin cifrar (aceptable para este tamaño de proyecto). Si más adelante se quiere cerrar del todo, hay que instalar un certificado de origen y pasar a "Full (strict)".
4. **Posible doble reserva por condición de carrera**: dos solicitudes simultáneas por el último cuarto de un tipo podrían, en teoría, crear dos reservas que se cruzan — no hay un `EXCLUDE` constraint de Postgres protegiendo esto a nivel de base de datos. Probabilidad baja al volumen actual, impacto alto si pasa. Diferido a propósito.
5. **Zona horaria**: el servidor corre en UTC (VPS en Alemania) pero el hotel opera en hora de Perú (UTC-5); el cálculo de noches y las señales de "no-show"/"salida vencida" pueden desviarse unas horas en los bordes del día. Diferido a propósito.
6. Queda un registro de prueba en el sistema por la verificación end-to-end de hoy: una reserva "PRUEBA SISTEMA (borrar)" marcada como `checked_out` (no se puede borrar reservas, solo cancelar las pendientes) y una tarea de limpieza pendiente sin cerrar para el cuarto 106 (se necesita una cuenta con rol "limpieza", que todavía no existe, para completarla formalmente). Ninguno de los dos afecta reportes ni disponibilidad.
7. Mejoras visuales/contenido adicionales al sitio público (pendiente de indicaciones específicas del dueño).
