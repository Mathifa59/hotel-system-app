# Ventana de mantenimiento pendiente — leer antes de ejecutar

> Plan acordado el 2026-07-25. Se ejecuta de **madrugada (3–4am hora de Perú)**
> para que la caída no afecte a nadie. Borra este archivo cuando esté hecho.

## Contexto en una línea

Los reportes de producción muestran datos que no son reales: son reservas de
prueba que el dueño creó ensayando. **No es un fallo del código** — "Reservas"
oculta las que ya hicieron check-out y "Reportes" sí las cuenta. Hay que
borrarlas, y de paso desplegar tres arreglos que ya están commiteados.

**Lo único real son las primeras reservas registradas** (Grace y Ramiro, del
~23 de julio de 2026). Todo lo anterior es prueba.

## Qué está listo (commit `c541255`, sin pushear)

| Arreglo | Archivo |
|---|---|
| Cron del respaldo se instala solo | `deploy.sh` (paso 4/5) |
| Respaldo ya no deja `.gz` de 0 bytes al fallar | `scripts/backup.sh` |
| Contenedores reviven tras reiniciar el servidor | `docker-compose.prod.yml` |
| Ingresos salen del cargo real, no de tarifas vigentes | `backend/app/routers/reports.py` |
| Script de limpieza de datos de prueba | `scripts/limpiar-datos-prueba.sh` |

## Bloqueo actual: no hay acceso SSH

No existe llave SSH en la PC del dueño (ni en WSL). Se generó una nueva en
`~/.ssh/id_ed25519` y el alias `apu-garden-lodge` ya está en `~/.ssh/config`,
**pero el servidor todavía no la reconoce**.

La llave pública a instalar:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINW7j85u6MLVFc7cLij+/zj/6C051j9Lxqh05/ITDYYk claude-code@DESKTOP-RFU7JVM-apu
```

## Pasos, en orden

### 1. Dar acceso (lo hace el dueño, desde el panel de Hetzner)

El servidor se creó con llave SSH, así que **no tiene contraseña de root**.
Hay que generar una: [console.hetzner.cloud](https://console.hetzner.cloud) →
Servers → `apu-garden-lodge-fw` → pestaña **Rescue** → **Reset root password**
(se muestra una sola vez). Eso **reinicia el servidor**.

Luego botón **`>_`** (consola web), entrar como `root`, y pegar:

```bash
mkdir -p /home/deploy/.ssh && echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINW7j85u6MLVFc7cLij+/zj/6C051j9Lxqh05/ITDYYk claude-code@DESKTOP-RFU7JVM-apu" >> /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh && chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys && echo "--- LLAVE OK ---" && cd /home/deploy/apu-gestion-system && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d && echo "--- SISTEMA ARRIBA ---"
```

> El `docker compose up -d` del final es necesario **solo esta vez**: el
> arreglo de `restart:` aún no está desplegado, así que tras el reinicio los
> contenedores no vuelven solos. Después de desplegar, ya no hace falta.

### 2. Desplegar (por SSH)

```bash
git push          # dispara GitHub Actions -> deploy.sh en el VPS
```

Reconstruye contenedores (~2-5 min de intermitencia). Deja instalado el cron
del respaldo y la política de reinicio automático.

Verificar que el cron quedó:

```bash
ssh apu-garden-lodge "crontab -l | grep backup"
```

### 3. Limpiar datos de prueba

**Primero el simulacro** — no borra nada, lista qué conservaría y qué borraría:

```bash
ssh apu-garden-lodge "cd apu-gestion-system && ./scripts/limpiar-datos-prueba.sh 2026-07-23"
```

⚠️ **Revisar la lista con el dueño antes de seguir.** Grace y Ramiro tienen que
aparecer del lado "SE CONSERVAN". Si no, ajustar la fecha de corte y repetir el
simulacro. La fecha `2026-07-23` es una estimación de "hace un par de días",
**no está confirmada contra los datos reales**.

Solo cuando la lista sea correcta:

```bash
ssh apu-garden-lodge "cd apu-gestion-system && ./scripts/limpiar-datos-prueba.sh 2026-07-23 --ejecutar"
```

Hace respaldo antes, pide escribir `BORRAR` para confirmar, y corre en una sola
transacción. Es interactivo: necesita terminal, no sirve pipearlo.

### 4. Comprobar

- Reportes de julio ya sin las reservas de prueba
- El sitio y el panel responden
- `ssh apu-garden-lodge "cd apu-gestion-system && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"` → los 6 contenedores arriba

## Queda para después (no bloquea)

- **Copia de respaldos fuera del VPS.** Hoy viven en el mismo disco que la base:
  protegen de un borrado accidental, no de perder el servidor. La opción más
  simple es activar **Backups** en Hetzner (~€1.30/mes, hoy está desactivado).
- Zona horaria del servidor (UTC) vs hotel en Perú (UTC-5).
- Cloud Firewall de Hetzner, nunca verificado.
