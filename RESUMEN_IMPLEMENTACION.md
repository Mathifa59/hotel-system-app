# Apu Garden Lodge — Resumen de implementación

Este documento resume todo lo construido hasta ahora en los dos proyectos:

- **Apu Garden Lodge Web** — sitio público (marketing + reservas)
- **Apu Gestion System** — sistema interno de gestión del hotel (admin / recepción / limpieza)

> Última actualización: 2026-07-31. Para arquitectura/deploy/pendientes, ver [`DOCUMENTO_MAESTRO.md`](DOCUMENTO_MAESTRO.md).

---

## 1. Apu Garden Lodge Web (sitio público)

**Stack:** Next.js 16 (App Router) + next-intl (es/en) + Tailwind CSS v4.

### Marca y diseño
- Logo, paleta de colores (verde oliva, terracota/arcilla, miel) y tipografía aplicados en todo el sitio — posicionamiento boutique/premium, no de hotel económico.
- Favicon real generado desde el ícono del logo.
- Todas las fotos de stock que no pertenecían al hotel fueron eliminadas — solo se conservan fotos reales de las habitaciones y las del cielo estrellado/observatorio.

### Habitaciones
- **5 tipos reales**: Individual, Doble, Doble Deluxe, Doble Deluxe (2 camas), Deluxe con cama extragrande. (El sistema de gestión maneja un 6º tipo, **Triple**, agregado esta sesión — pendiente reflejarlo también en el sitio público si el dueño quiere venderlo ahí.)
- Fotos reales organizadas por tipo, con galería tipo carrusel (flechas + miniaturas).
- Modal de detalle por habitación (al estilo Booking.com) con: tamaño (m²), configuración de cama, vista, descripción, checklist de baño privado, checklist de equipamiento, y política de no fumar.
- Precios visibles en soles (S/) por noche, traídos en vivo desde el backend de gestión.

### Reservas
- Buscador de disponibilidad real (consulta al backend) por fechas.
- Formulario de solicitud de reserva (nombre, correo, teléfono, notas) que crea una reserva pendiente en el sistema de gestión.
- Lista de espera cuando un tipo de cuarto no tiene cupo, en vez de rechazar la solicitud de plano.
- Sección de preguntas frecuentes (FAQ).

### Otras secciones
- "Hasta el último detalle": 8 categorías de amenities del hotel completo.
- Página Nosotros, Novedad (observación astronómica), Contacto.
- Todo en español e inglés.

### SEO
- Metadata por página y por idioma, canonical y hreflang (es/en) en las 6 páginas.
- Sitemap.xml (con `lastModified`/`changeFrequency`/`priority`) y robots.txt generados automáticamente.
- Datos estructurados (JSON-LD, schema `Hotel` completo): nombre, dirección, teléfono, amenities, pool, spa, mascotas, monedas, horario 24/7, coordenadas GPS, rango de precio.
- FAQPage schema en `/reservas` para rich snippets en Google.
- Open Graph y Twitter Card con imagen propia en todas las páginas.
- Manifest web (PWA) con íconos reales.
- Google Search Console configurado (verificación + sitemap enviado + solicitudes de indexación).
- **Pendiente, depende del dueño**: Google Business Profile, backlinks (TripAdvisor, Booking.com, Facebook, VisitPeru.travel, Hostelworld/Expedia) — ver sección 5.

---

## 2. Apu Gestion System (sistema interno)

**Stack:** FastAPI + PostgreSQL + Redis + Next.js 16 (admin/recepción/limpieza) + nginx, todo en Docker Compose.

### Roles
Tres roles de usuario: **admin**, **recepción**, **limpieza** (housekeeper). Cada uno tiene su propio panel y permisos.

### Cuartos
- **14 cuartos reales** cargados: piso 1 (101-104), piso 2 (201-205), piso 3 (301-305) — repartidos entre los tipos reales, con frigobar activado.
- Edición de número, piso, tipo y si tiene frigobar — disponible para admin y housekeeper.
- Mapa de cuartos con estado en vivo (Disponible / Ocupado / En limpieza / Limpio / Mantenimiento / No molestar).
- Botón **"Marcar disponible para nuevo huésped"** cuando un cuarto queda "Limpio".
- **Botón "+ Nueva reserva" directamente en el mapa de cuartos** (Cuartos), no solo en la pestaña Reservas — recepción puede crear una reserva sin pasar por "Ocupado" ni cambiar de pestaña.
- Al marcar un cuarto "Ocupado" a mano, se pregunta si en realidad se quiere **crear la reserva real** (con huésped, fechas, folio) en vez de solo cambiar el estado sin nada detrás.
- **Historial por cuarto simplificado**: antes mezclaba reservas, limpiezas, cargos y actividad genérica en una sola línea de tiempo ruidosa; ahora es una lista limpia de solo reservas (huésped, fechas, estado, tarifa, pago si hubo check-out). Accesible desde el detalle del cuarto **y** directamente desde la pestaña Reservas (botón "Historial del cuarto" por fila).

### Tipos de cuarto y tarifas
- **6 tipos**: Individual, Doble, Doble Deluxe, Doble Deluxe (2 camas), Deluxe con cama extragrande, **Triple** (agregado esta sesión).
- **Dos tarifas por tipo — profesional (estándar) y promocional (rebajada)** — soles y dólares cada una. Se elige **por reserva**, no por tipo de cuarto: el mismo cuarto puede venderse a cualquiera de las dos según el caso. (Doble Deluxe 2 camas no tiene tarifa promocional cargada — cae a la profesional automáticamente si se intenta.)
- Aforo por tipo: Individual = 1 huésped, el resto = 2 (Triple no cambia el aforo salvo que se ajuste a propósito).
- Botón de moneda (S/ PEN ⇄ $ USD) en el header, recuerda la preferencia.

### Frigobar
- Catálogo de productos con precio en soles y dólares, stock por cuarto.
- El housekeeper y recepción pueden agregar productos/cantidades directamente desde el detalle del cuarto.
- Registro de consumo genera un cargo automático, detallado por producto.
- Funciona aunque el huésped ya haya hecho check-out.
- **Recepción ahora también puede registrar consumo** — antes el backend lo bloqueaba silenciosamente (403) aunque el botón se viera habilitado en su panel; solo `admin`/`cleaning` estaban permitidos. Corregido esta sesión.
- **Selección de la reserva correcta al registrar consumo**: antes se tomaba "la reserva creada más recientemente" para ese cuarto, sin mirar su estado — si había una reserva activa (huésped alojado) y además una futura ya cargada para cuando se vaya, el consumo de ahora podía cobrarse a la reserva equivocada. Ahora prioriza la reserva **activa**; si no hay, la **pendiente más próxima a llegar** (permite registrar consumo incluso antes del check-in).

### Reservas
- Crear reserva (cuarto, huésped, documento, teléfono, número de huéspedes, fechas, tarifa profesional/promocional).
- Editar una reserva existente (fechas, cuarto, huéspedes, nombre) sin cancelar y recrear. Cambiar de cuarto en una reserva activa mueve los estados automáticamente (el viejo a limpieza, el nuevo a ocupado).
- Check-in (valida cuarto disponible y reserva confirmada).
- Check-out → genera automáticamente: cargo de "Alojamiento" (noches × tarifa según el plan elegido) y una tarea de limpieza vinculada a esa reserva.
- Cancelar una reserva pendiente (libera el cuarto de inmediato).
- Liberar no-shows en bloque (reservas pendientes cuya llegada ya pasó).
- Señales visuales: "Salida vencida" y "No llegó".
- Solicitudes del sitio web: panel para confirmar/rechazar antes de ocupar el cuarto en firme.
- Un cuarto en mantenimiento no se ofrece en la disponibilidad del sitio web.
- **Registro de estadías pasadas** (nuevo, esta sesión): modo separado dentro del mismo modal "Nueva reserva" (toggle "Reserva nueva" / "Estadía pasada"), para cargar una estadía que **ya terminó** y no se registró a tiempo. Calcula el total solo (noches × tarifa), permite registrar el pago (opcional), y entra directo como cerrada **sin** tocar el estado del cuarto, sin crear tarea de limpieza, sin notificaciones en vivo. Valida que las fechas sean pasadas y que no se crucen con otra estadía ya cargada en ese cuarto.
- Selectores de check-out con horarios fijos del hotel (10:00 am / 12:00 md / 3:00 pm) en vez de que recepción escriba una hora libre.
- Campo de identificación (INE/pasaporte) marcado explícitamente como opcional.

### Adelanto y voucher de reserva (nuevo, esta sesión)
- **Adelanto al reservar**: al crear una reserva nueva, recepción puede registrar opcionalmente el monto que el huésped pagó de adelanto (método, soles y dólares). Antes el sistema solo registraba el pago final en el check-out — no había forma de anotar un adelanto al momento de reservar.
- **Voucher de reserva**: botón "Voucher" en cada reserva → página bilingüe (ES/EN) lista para imprimir o guardar como PDF (`window.print()` del navegador), con logo, dirección, teléfono y RUC del hotel, número correlativo (`RES-0001`, `RES-0002`...), datos de la estadía, tarifa, adelanto pagado y saldo pendiente al llegar. Incluye la nota explícita "no es un comprobante de pago" en ambos idiomas — es una constancia de reserva, no una boleta/factura (eso quedó fuera de alcance a propósito).
- El número de voucher se asigna la **primera vez** que alguien lo pide (no al crear la reserva), así el correlativo sigue el orden real de entrega, no el de captura en el sistema.
- Funciona igual desde el celular: el panel ya es una PWA instalable, así que recepción puede generar el voucher estando fuera del hotel.
- **Accesible desde dos lugares**: la lista de "Reservas" (para reservas activas/pendientes) y el **historial del cuarto** (para reservas que ya hicieron check-out o se cancelaron, que la lista principal oculta a propósito). El botón del historial solo se muestra a recepción — ese mismo componente también lo usan admin y limpieza, pero la página del voucher vive bajo `/reception` y redirige a cualquier otro rol.
- De paso, se corrigió el horario oficial de check-in/check-out (11:00 am / 10:00 am, con nota de flexibilidad) que estaba contradicho en tres lugares distintos del sitio público y del sistema.

### Cuenta del huésped (folio) al check-out
- Resumen antes de confirmar: noches de alojamiento, todos los cargos de esa reserva con su estado, total a cobrar.
- Solo se facturan automáticamente el alojamiento y los cargos ya aprobados.
- **Bug corregido esta sesión**: el folio duplicaba el alojamiento en cualquier reserva ya cerrada (lo calculaba al vuelo *y además* sumaba el cargo `room` ya guardado). Ahora excluye ese tipo de cargo del listado de "extras".

### Cargos
- Crear cargos manuales (daño, limpieza extra, otro) en soles y dólares.
- Flujo: pendiente → aprobado (admin) → cobrado (recepción).
- Corregir un cargo pendiente. Anular cualquier cargo no anulado.
- Cada cargo tiene ahora **`occurred_at`** (fecha económica) además de `created_at` (fecha de registro) — ver sección "Reportes" abajo.

### Reportes — reconstruidos esta sesión
Antes: solo ocupación (foto del momento), consumo de frigobar histórico, e ingresos por tipo de cargo por rango (con el bug de sumar por `created_at` en vez de la fecha real del consumo).

Ahora, panel completo en `/admin/reportes` **y** `/reception/reportes` (antes solo admin):
- **Filtros**: rango de fechas + atajos (Este mes, Mes pasado, Últimos 30 días, Este año).
- **KPIs**: ingresos del periodo (desglose alojamiento/extras), **ocupación** (noches vendidas ÷ noches disponibles del periodo, no una foto del momento), **ADR** (tarifa promedio por noche vendida), **RevPAR** (ingreso por noche disponible — combina precio y ocupación), llegadas, huéspedes, estadía promedio.
- **Gráficos**: ingresos por día (barras apiladas alojamiento/extras, con tooltip y vista de tabla alternativa), ingresos por tipo de cuarto, profesional vs promocional, noches vendidas por cuarto, origen de la reserva (recepción vs sitio web).
- **Prorrateo por noche**: una estadía que cruza de mes reparte sus noches e ingreso entre ambos meses correctamente (ver `DOCUMENTO_MAESTRO.md` sección 10 para el detalle técnico) — verificado con test automatizado.
- Colores de los gráficos elegidos y **validados** contra daltonismo (protan/deutan) y contraste, no a ojo — el primer intento (dorado + verde salvia, los colores de marca) resultó indistinguible bajo deutanopía.
- Se mantienen: estado de cuartos ahora mismo, consumo de frigobar histórico.

### Modo claro / oscuro (nuevo, esta sesión)
- Toggle en el header (ícono sol/luna), preferencia guardada, sin parpadeo al cargar (script inline aplica el tema antes de la primera pintura).
- Paleta de modo claro inspirada en los colores del sitio público (salvia + tostado sobre crema), con los tonos de acento oscurecidos lo necesario para mantener contraste legible sobre fondo claro.
- El logo cambia automáticamente entre la versión clara (para fondo oscuro) y la de color (para fondo claro).

### Notificaciones y feedback de acciones (nuevo, esta sesión)
- Sistema de notificaciones tipo **toast** (éxito/error/info) para todas las acciones de mutación (crear/editar/cancelar reserva, cambiar estado de cuarto, registrar frigobar, etc.), reemplazando mensajes de error sueltos o silencio total en fallos.
- Errores de carga que antes fallaban en silencio (sin mensaje al usuario) ahora avisan con un toast.
- Sesión expirada (401) redirige sola al login en vez de dejar la pantalla rota.
- Panel de notificaciones (campanita) rediseñado: fondo casi opaco (antes se veía "lavado"/transparente sobre el mapa de cuartos con color) y scrollbar propio del tema en vez de la barra gris nativa del navegador.

### Otros componentes de UI reescritos esta sesión
- **Selector de fecha/hora** completamente propio (`DateTimeField`), reemplazando el `<input type="datetime-local">`/`<input type="time">` nativos, cuyo selector del sistema operativo rompía el tema oscuro de la app.
- Modal de "Nueva reserva" más ancho (2 columnas) para no sentirse apretado con todos los campos nuevos (tarifa, estadía pasada, pago).

### Seguridad (auditoría y fixes aplicados)
- **Condición de carrera en doble reserva — corregida esta sesión**: se agregó un constraint `EXCLUDE USING gist` en Postgres (requiere `btree_gist`) que impide dos reservas activas/pendientes en el mismo cuarto con fechas cruzadas, **a nivel de base de datos** — antes solo había un `SELECT` en Python antes de insertar, que dos requests concurrentes podían pasar ambos. Probado con 8 requests simultáneas reales contra el backend: exactamente 1 se creó, 7 rechazadas limpiamente (sin errores 500 ni duplicados).
- Límite de tasa (rate limit) llaveado a la IP real del visitante (lee `CF-Connecting-IP`/`X-Forwarded-For` detrás de Cloudflare + nginx, no la IP interna compartida).
- Login con tope de 10 intentos/minuto por IP.
- Formulario público de reserva: correo validado (`EmailStr`) + honeypot anti-bot.
- `ufw` en el VPS; queries vía ORM (sin inyección SQL).

**Diferido a propósito** (ver `DOCUMENTO_MAESTRO.md` sección 11):
- Zona horaria UTC (servidor) vs Perú (hotel).
- Cloudflare "Flexible" deja el tramo Cloudflare↔origen sin cifrar.

---

## 3. Decisiones de negocio confirmadas

- **Tarifas fijas** por tipo de habitación, manuales, en soles y dólares, con dos niveles (profesional/promocional) elegibles por reserva — sin pasarela de pago, todo se cobra en persona.
- **Todo el sistema de cargos/folio es informativo y señalativo**: el valor está en que el staff sepa qué se debe y a quién, no en procesar pagos dentro de la app.
- **Política de cancelación con cargo (24h)** queda pendiente para una fase futura — hoy se puede cancelar una reserva pendiente sin penalidad.
- **Aforo por tipo de habitación**: Individual = 1 huésped; el resto = 2 huéspedes.
- **Estadías pasadas**: solo se captura alojamiento + pago (no cargos extra como frigobar en el mismo formulario) — decisión explícita para mantener el formulario simple; cargos extra de una estadía pasada se agregan después por el flujo normal de Cargos si hace falta.
- **Reportes**: visibles para admin y recepción (no solo admin) — recepción necesita ver ocupación/ingresos para su propio trabajo diario, no solo el dueño.

---

## 4. Estado técnico actual — EN PRODUCCIÓN

- **Sitio público**: https://apu-garden-lodge.com — en vivo.
- **Sistema de gestión**: https://gestion.apu-garden-lodge.com — en vivo.
- **Infraestructura**: VPS Hetzner (CX23, Nuremberg) corriendo Docker Compose. DNS y HTTPS por Cloudflare (proxy activado, SSL Flexible). Detalle completo en [DOCUMENTO_MAESTRO.md](DOCUMENTO_MAESTRO.md) y [DEPLOY.md](DEPLOY.md).
- **Deploy automático**: cada push a `main` en cualquiera de los dos repos dispara GitHub Actions → SSH → `deploy.sh` (pull + rebuild + migraciones). Ya no es un paso manual. Verificado además de forma directa por SSH (no solo por Actions) — acceso configurado esta sesión con llave propia.
- Migraciones aplicadas en producción — cadena actual hasta `b8e4f6a2c9d1` (voucher de reserva), confirmada contra la base real (`alembic current`).
- 14 cuartos reales cargados, con frigobar activado.
- ~~Datos de prueba mezclados con reservas reales~~ → **limpiados esta sesión.** Solo quedan las 2 reservas reales (confirmadas por el dueño); las de prueba se borraron con `scripts/limpiar-datos-prueba.sh`, con respaldo automático previo y confirmación escrita. El propio simulacro detectó y permitió corregir un bug del script (FK de `notification_reads` sin cubrir) antes de tocar datos reales.
- Respaldos automáticos de la base de datos **confirmados activos** (`crontab -l` verificado directamente en el servidor): diario 03:00, rotación 14 días.
- WebSocket de notificaciones en tiempo real verificado funcionando a través de Cloudflare.

## 5. Lo que queda pendiente

Ver [`DOCUMENTO_MAESTRO.md`](DOCUMENTO_MAESTRO.md) sección 11 para la lista completa y actualizada (operativo + técnico). En resumen, lo más relevante hoy:

1. Crear cuentas reales de housekeeper si faltan (recepción y admin ya existen), cargar catálogo real de frigobar, cambiar contraseña del admin si sigue siendo la de prueba.
2. Google Business Profile y backlinks — el paso más importante para aparecer en búsquedas, 100% del dueño.
3. Confirmar Cloud Firewall de Hetzner.
4. Zona horaria UTC vs Lima — diferido, sigue abierto.
5. Copia de los respaldos automáticos **fuera** del VPS — hoy viven en el mismo disco que la base de datos.
6. Cloudflare Flexible → Full (strict) — opcional, diferido.
7. Monitoreo de uptime — no configurado, tarea del dueño.
