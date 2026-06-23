# Despliegue a producción

## Lo que necesitas

- Un VPS con Docker instalado (Ubuntu 22.04+ recomendado). Opciones baratas que funcionan bien: DigitalOcean, Hetzner, Contabo — cualquiera con 2GB de RAM alcanza para este sistema.
- Un dominio o subdominio (ej. `gestion.tuhotel.com`) con acceso a su DNS.
- Acceso por SSH al servidor.

Vercel **no sirve para esto** — solo aloja el frontend Next.js, no Postgres/Redis/FastAPI con WebSockets. Por eso todo va junto en un VPS con Docker Compose, igual que en desarrollo.

## 1. Apuntar el dominio

En el proveedor de DNS donde administras tu dominio, crea un registro:

```
Tipo: A
Nombre: gestion (o el subdominio que quieras)
Valor: <IP pública del VPS>
```

Espera unos minutos a que propague. Verifica con `ping gestion.tuhotel.com` desde tu compu — debe responder con la IP del servidor.

## 2. Preparar el servidor

```bash
ssh root@<ip-del-servidor>

# Instalar Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh

# Clonar o subir el código
git clone <tu-repo> hotel-system   # o sube la carpeta por scp/rsync
cd hotel-system
```

## 3. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

Cambia **todo lo que diga "change_me"**: `POSTGRES_PASSWORD`, `JWT_SECRET` (usa algo largo y random, ej. `openssl rand -hex 32`), `ADMIN_PASSWORD`. Pon tu dominio real en `DOMAIN`. `DATABASE_URL` debe usar la misma contraseña que pusiste en `POSTGRES_PASSWORD`.

## 4. Abrir los puertos del firewall

```bash
ufw allow 80
ufw allow 443
ufw allow OpenSSH
ufw enable
```

## 5. Levantar todo

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Esto construye el frontend en modo producción (`next build`, sin hot-reload) y levanta Caddy, que automáticamente pide y renueva el certificado HTTPS de Let's Encrypt para el dominio que pusiste en `DOMAIN` — no hay que hacer nada manual con certificados.

## 6. Migraciones + admin inicial

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed
```

Esto crea las tablas y el primer usuario admin (con el correo/contraseña que pusiste en `.env`). Desde ahí, ese admin entra a `https://gestion.tuhotel.com/admin/usuarios` y crea las cuentas de recepción y limpieza.

## 7. Verificar

Abre `https://gestion.tuhotel.com/login` en el navegador — debe cargar con el candado de HTTPS válido.

## Actualizar el sistema después

```bash
git pull   # o sube el código nuevo
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec backend alembic upgrade head   # solo si hay migraciones nuevas
```

## Respaldo de la base de datos

PostgreSQL guarda todo en un volumen Docker (`pg_data`) que sobrevive a reinicios y actualizaciones, pero **no a un disco dañado ni a un borrado accidental**. Por eso el respaldo es imprescindible antes de tener huéspedes reales.

### Respaldo automático (recomendado)

El repo incluye `scripts/backup.sh`, que genera un dump comprimido con fecha y conserva solo los últimos 14 días (rotación automática). Pruébalo a mano una vez:

```bash
./scripts/backup.sh
# → backups/apu_hotel_2026-06-23_030000.sql.gz
```

Para que corra solo cada día, agrégalo al cron del servidor con `crontab -e`:

```cron
# Respaldo de Apu Gestión todos los días a las 3:00 AM
0 3 * * * /ruta/a/hotel-system/scripts/backup.sh >> /ruta/a/hotel-system/backups/backup.log 2>&1
```

Ajustes opcionales por variables de entorno: `RETENTION_DAYS` (días a conservar, 14 por defecto) y `BACKUP_DIR` (carpeta destino).

> **Importante:** los respaldos quedan en el mismo servidor. Para protección real ante un disco dañado, copia la carpeta `backups/` a otro lugar (otro disco, un bucket S3/Backblaze, o `rsync` a otra máquina) — un segundo paso aparte, no hace falta tocar el script.

### Restaurar un respaldo

```bash
gunzip -c backups/apu_hotel_FECHA.sql.gz | docker compose exec -T db psql -U hotel -d hotel
```

### Respaldo manual rápido (alternativa)

```bash
docker compose exec db pg_dump -U hotel hotel > respaldo-$(date +%F).sql
```
