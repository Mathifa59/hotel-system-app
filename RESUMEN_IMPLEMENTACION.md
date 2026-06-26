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

---

## 2. Apu Gestion System (sistema interno)

**Stack:** FastAPI + PostgreSQL + Redis + Next.js (admin/recepción/limpieza) + nginx, todo en Docker Compose.

### Roles
Tres roles de usuario: **admin**, **recepción**, **limpieza** (housekeeper). Cada uno tiene su propio panel y permisos.

### Cuartos
- 42 cuartos cargados (3 pisos × 14), repartidos entre los 5 tipos reales.
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

---

## 3. Decisiones de negocio confirmadas

- **Tarifas fijas** por tipo de habitación, manuales, en soles y dólares — sin pasarela de pago, todo se cobra en persona.
- **Todo el sistema de cargos/folio es informativo y señalativo**: el valor está en que el staff sepa qué se debe y a quién, no en procesar pagos dentro de la app.
- **Política de cancelación con cargo (24h)** queda pendiente para una fase futura — hoy se puede cancelar una reserva pendiente sin penalidad.
- **Aforo por tipo de habitación**: Individual = 1 huésped; Doble, Doble Deluxe, Doble Deluxe (2 camas) y Deluxe con cama extragrande = 2 huéspedes. (Ajustable si la realidad del hotel es distinta.)

---

## 4. Estado técnico actual

- Todo corre **localmente en Docker** (Postgres, Redis, backend, frontend, nginx) — `docker compose up`.
- Credenciales y secretos actuales son de desarrollo (`local_dev`), no aptos para producción.
- Solo existe la cuenta de admin; faltan crear las cuentas reales de recepción y de cada housekeeper.
- El catálogo de frigobar está vacío — listo para cargarse desde la app misma.
- Migraciones de base de datos al día (Alembic).

## 5. Lo que falta para producción

1. **VPS** — ya tienes el dominio en Cloudflare; falta el servidor donde correrá Docker Compose.
2. Configurar DNS en Cloudflare apuntando al VPS, y HTTPS (certificado).
3. Reemplazar todos los secretos de desarrollo por secretos reales (contraseña de DB, JWT, etc.).
4. Crear las cuentas reales del personal.
5. Cargar el catálogo real de frigobar.
6. Configurar respaldos automáticos de la base de datos.
7. Apuntar el sitio público (`Apu Garden Lodge Web`) a la URL real del backend en producción.

Cuando tengas el VPS, podemos armar la guía paso a paso de despliegue.
