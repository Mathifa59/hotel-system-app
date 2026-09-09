# Despliegue a producción

## ⚠️ Pendiente de despliegue (desde 2026-09-09)

Hay código en `main` de **ambos** repos que todavía no está en el
servidor — se pusheó, pero el despliegue quedó bloqueado a mitad de
camino. Esto es lo que falta y por qué:

**Qué incluye este despliegue pendiente** (ver detalle completo en
`CAMBIOS.md` del repo `apu-garden-lodge-web`): idioma español por
defecto, footer con crédito a DevHorses, páginas de Términos y
Privacidad, Libro de Reclamaciones Virtual (envía emails con Resend),
404 con marca propia, y el redirect `www` → sin `www` de este archivo
(`nginx/nginx.prod.conf`).

**Por qué quedó a medias — la llave SSH que tenía Claude Code configurada
en este equipo (`~/.ssh/apu_garden_lodge_hetzner`) fue rechazada por el
servidor:**

```
deploy@188.34.202.143: Permission denied (publickey)
```

El servidor ya no reconoce esta clave pública para el usuario `deploy`:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIej5frayr41QBgVtDqNHkCOVoz8VavvwV7Q5jrF1Ma apu-garden-lodge-hetzner
```

Se intentó terminar el despliegue a mano por la **consola web de
Hetzner** (ícono `>_` junto a "Actions" en el panel del servidor, entra
como `root` sin necesitar la llave SSH) pero se cortó ahí — quedó
pendiente confirmar en qué paso.

### Para retomarlo en la próxima sesión

1. **Arreglar el acceso SSH** (recomendado, para que Claude pueda
   desplegar solo la próxima vez): entrar por la consola web de Hetzner
   como `root` y revisar/agregar la llave de arriba:
   ```bash
   su - deploy
   cat ~/.ssh/authorized_keys        # ver qué hay ahí ahora
   echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDIej5frayr41QBgVtDqNHkCOVoz8VavvwV7Q5jrF1Ma apu-garden-lodge-hetzner" >> ~/.ssh/authorized_keys
   ```
   Después probar desde la máquina local: `ssh apu-garden-lodge`.

2. **Ojo con la ruta** — los repos viven en el `$HOME` del usuario
   `deploy` (`/home/deploy/apu-gestion-system` y
   `/home/deploy/apu-garden-lodge-web`), **no** en `/root/`. Si entraste
   como `root` por la consola web, `cd apu-gestion-system` falla ahí
   ("No such file or directory") — hace falta `su - deploy` primero, o
   `cd /home/deploy/apu-gestion-system` directo.

3. **Agregar las variables del Libro de Reclamaciones al `.env` real del
   servidor** (`/home/deploy/apu-gestion-system/.env` — el de producción,
   distinto del `.env` local de este equipo):
   ```
   RESEND_API_KEY=...
   COMPLAINTS_EMAIL_TO=...
   ```
   El valor real de `RESEND_API_KEY` **no está en ningún archivo
   versionado** a propósito (es un secreto) — está guardado en el `.env`
   local de este equipo y en `.env.local` del repo web, cópialo de ahí.
   Sin esto el Libro de Reclamaciones queda publicado pero no puede
   enviar los reclamos por email (devuelve error 500 al enviarse).

4. **Desplegar:**
   ```bash
   cd ~/apu-gestion-system && ./deploy.sh
   ```

5. **Recargar nginx a mano** — el redirect de `www` vive en un archivo
   con bind-mount (`nginx/nginx.prod.conf`); `deploy.sh` no lo recarga
   solo porque nginx no reconstruye por un cambio de contenido de un
   archivo montado, solo por cambios de imagen/config declarada:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
   ```

6. **Verificar:**
   ```bash
   curl -I http://www.apu-garden-lodge.com          # debe dar 301 -> sin www
   curl -I https://apu-garden-lodge.com/terminos
   curl -I https://apu-garden-lodge.com/privacidad
   curl -I https://apu-garden-lodge.com/libro-de-reclamaciones
   ```
   Y probar el formulario del Libro de Reclamaciones en el navegador una
   vez desplegado, para confirmar que el email sí sale desde el servidor
   (las pruebas anteriores fueron solo en local).

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

**Estado: automático.** `deploy.sh` instala el cron por sí solo (paso 4/5) en el primer despliegue: `scripts/backup.sh` corre **todos los días a las 03:00** hora del servidor, con rotación de 14 días. No hay que editar `crontab` a mano; la instalación es idempotente, así que correr `deploy.sh` muchas veces no duplica la entrada.

Para confirmar que quedó activo:

```bash
ssh apu-garden-lodge "crontab -l | grep backup"
```

Y para ver el resultado de los últimos respaldos:

```bash
ssh apu-garden-lodge "tail -20 ~/apu-gestion-system/backups/backup.log; ls -lh ~/apu-gestion-system/backups/"
```

El script escribe primero a un archivo temporal y solo lo renombra a `.sql.gz` si el dump terminó bien y el gzip está íntegro. Si algo falla, no deja archivo: **nunca vas a tener un respaldo de 0 bytes que parezca bueno.** Revisa el log si un día no aparece el archivo del día.

⚠️ **Falta el paso de copia externa.** Los respaldos viven en el mismo VPS que la base de datos, así que protegen contra un borrado accidental o una migración mal aplicada, pero **no contra la pérdida del servidor**. Para cubrir eso hay que copiar `backups/` fuera: otro disco, un bucket S3/Backblaze, o `rsync` a otra máquina.

### Restaurar un respaldo

```bash
gunzip -c backups/apu_hotel_FECHA.sql.gz | docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db psql -U hotel -d hotel
```

### Respaldo manual rápido

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db pg_dump -U hotel hotel > respaldo-$(date +%F).sql
```
