# Despliegue a producción

## Cómo está desplegado hoy (referencia real)

- **VPS**: Hetzner Cloud, plan CX23, datacenter Nuremberg (Alemania).
- **Dominio**: `apu-garden-lodge.com`, DNS y proxy en **Cloudflare**.
- **HTTPS**: lo maneja Cloudflare (modo **Flexible**) — el origen (el VPS) solo sirve HTTP plano en el puerto 80, sin certificado propio que mantener ni renovar.
- **Reverse proxy en el origen**: nginx (no Caddy) — un solo contenedor que enruta por dominio a cada servicio:
  - `apu-garden-lodge.com` → contenedor `web` (sitio público, Next.js)
  - `gestion.apu-garden-lodge.com` → contenedores `frontend` (Next.js de gestión) y `backend` (FastAPI, bajo `/api`) y el WebSocket bajo `/ws`
- **Dos repos**, clonados como hermanos en el mismo servidor:
  ```
  ~/apu-gestion-system/        ← este repo (backend + frontend de gestión + nginx + compose)
  ~/apu-garden-lodge-web/      ← sitio público (repo hermano)
  ```
  `docker-compose.prod.yml` referencia `../apu-garden-lodge-web` directamente, así que **los dos repos deben estar en el mismo nivel** en el servidor.
- **Usuario del servidor**: `deploy` (no root), con acceso SSH por llave.

## 1. Apuntar el dominio

En Cloudflare (o el proveedor DNS que uses), registros tipo A apuntando a la IP del VPS:

```
apu-garden-lodge.com           → IP del VPS
gestion.apu-garden-lodge.com   → IP del VPS
```

Si usas Cloudflare con el proxy naranja activado (recomendado, da HTTPS gratis y oculta la IP real):

- **SSL/TLS → Overview → modo "Flexible"** — esto es obligatorio con la configuración actual del origen (nginx solo en HTTP). Si lo dejas en "Full" o "Full (strict)", Cloudflare no podrá conectarse al origen y vas a ver error 521 en todo el sitio.

## 2. Preparar el servidor

```bash
ssh deploy@<ip-o-host>

# Instalar Docker (Ubuntu)
curl -fsSL https://get.docker.com | sh

# Clonar los DOS repos al mismo nivel
git clone <repo-gestion> apu-gestion-system
git clone <repo-web> apu-garden-lodge-web
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

Además del firewall del sistema (ufw), Hetzner ofrece un **Cloud Firewall** aparte a nivel de red, configurable desde su consola web — **no se ha confirmado si está creado y adjuntado al servidor**. Vale la pena revisarlo: es una capa extra independiente de ufw.

## 3. Configurar `.env`

```bash
cd apu-gestion-system
cp .env.example .env
nano .env
```

Cambia todo lo que diga `change_me`: `POSTGRES_PASSWORD`, `JWT_SECRET` (`openssl rand -hex 32`), `ADMIN_EMAIL`, `ADMIN_PASSWORD`. `DATABASE_URL` debe usar la misma contraseña que `POSTGRES_PASSWORD`. El campo `DOMAIN` de este `.env.example` es vestigio de un enfoque con Caddy que **ya no se usa** — con nginx + Cloudflare no hace falta.

## 4. Levantar todo

```bash
nohup docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build > deploy.log 2>&1 &
disown
```

**Importante:** el build de los dos frontends Next.js (gestión + sitio público) tarda varios minutos. Si lo corres directo sobre una sesión SSH sin `nohup`/`disown`, al cerrar la terminal el proceso recibe SIGHUP y el build se corta a medias — pasó en el primer despliegue. Usa siempre `nohup ... & disown` (o `tmux`/`screen`) para que sobreviva a la desconexión, y verifica con `tail -f deploy.log` y `docker compose ... ps` antes de asumir que terminó.

## 5. Migraciones + admin inicial

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python -m app.seed
```

**El segundo comando NO es opcional ni automático** — `seed_admin()` solo se ejecuta si corres `app.seed` a mano (no se llama desde `main.py` al iniciar). Sin este paso no existe ningún usuario y el login devuelve 401 aunque el resto del stack esté sano. Es un paso único, no hace falta repetirlo en despliegues futuros (el script detecta si el admin ya existe).

## 6. Verificar

```bash
curl -I https://apu-garden-lodge.com
curl -I https://gestion.apu-garden-lodge.com
```

Ambos deben responder `200`. Si da `521`, revisa el modo SSL de Cloudflare (paso 1).

## Gotcha: Cloudflare bloquea el User-Agent por defecto de scripts

Si vas a llamar a la API en producción con un script (Python `urllib`, etc.) en vez de desde el navegador, agrega un `User-Agent` que no sea el genérico de la librería:

```python
headers={"User-Agent": "Mozilla/5.0 (compatible; ApuGardenLodgeSetup/1.0)"}
```

Cloudflare devuelve `403 Forbidden` a requests con user-agents reconocidos como bots/scripts (ej. `Python-urllib/3.x`), incluso con credenciales correctas. `curl` no tiene este problema salvo que también se le quite el user-agent por defecto.

## Actualizar el sistema después

```bash
cd apu-gestion-system && git pull
cd ../apu-garden-lodge-web && git pull
cd ../apu-gestion-system
nohup docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build > deploy.log 2>&1 &
disown
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend alembic upgrade head   # solo si hay migraciones nuevas
```

## Respaldo de la base de datos

**Estado actual: NO configurado.** El repo incluye `scripts/backup.sh` (dump comprimido con rotación de 14 días) pero **no está agregado al cron del servidor** — hoy, si el disco del VPS falla, se pierde toda la base de datos de producción (reservas, cargos, usuarios, los 42 cuartos). Esto es la tarea técnica pendiente más importante.

Para activarlo:

```bash
ssh deploy@<servidor>
crontab -e
```

```cron
0 3 * * * /home/deploy/apu-gestion-system/scripts/backup.sh >> /home/deploy/apu-gestion-system/backups/backup.log 2>&1
```

Y, como segundo paso (no lo hace el script), copiar `backups/` fuera del servidor — otro disco, un bucket S3/Backblaze, o `rsync` a otra máquina — para que un respaldo en el mismo VPS no sea el único respaldo.

### Restaurar un respaldo

```bash
gunzip -c backups/apu_hotel_FECHA.sql.gz | docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db psql -U hotel -d hotel
```

### Respaldo manual rápido

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db pg_dump -U hotel hotel > respaldo-$(date +%F).sql
```
