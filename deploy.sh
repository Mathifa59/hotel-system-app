#!/usr/bin/env bash
#
# Despliegue de Apu Garden Lodge — se ejecuta EN EL SERVIDOR (VPS).
#
# Resuelve el problema que tuvimos: desplegar era manual y se podía saltar el
# `git pull`, dejando el servidor con código viejo aunque GitHub estuviera al
# día. Este script trae SIEMPRE el código de GitHub y reconstruye. Flujo:
#
#   1. En tu máquina:  git push        (sube tus cambios a GitHub)
#   2. En el servidor: ./deploy.sh     (este script: pull + rebuild + migraciones)
#
# Uso:
#   ssh apu-garden-lodge
#   cd apu-gestion-system && ./deploy.sh
#
# O en un solo paso desde tu máquina:
#   ssh apu-garden-lodge "cd apu-gestion-system && ./deploy.sh"
#
set -euo pipefail

# Candado de despliegue. Si dos despliegues coinciden (GitHub Actions dispara
# el workflow de AMBOS repos casi al mismo tiempo cuando pusheas a los dos),
# el segundo espera a que el primero termine, en vez de chocar al hacer
# `git pull` / rebuild simultáneos. El control de concurrencia de GitHub
# Actions es por-repositorio y no coordina entre repos distintos, así que el
# candado tiene que vivir aquí, en el servidor.
exec 9>/tmp/apu-deploy.lock
echo "==> Tomando el candado de despliegue (espera si hay otro deploy en curso)..."
flock 9

GESTION_DIR="$HOME/apu-gestion-system"
WEB_DIR="$HOME/apu-garden-lodge-web"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "==> 1/5  Trayendo código nuevo desde GitHub..."
git -C "$WEB_DIR" pull --ff-only origin main
git -C "$GESTION_DIR" pull --ff-only origin main

echo "==> 2/5  Reconstruyendo contenedores (backend, frontend, web)..."
cd "$GESTION_DIR"
"${COMPOSE[@]}" up -d --build

echo "==> 3/5  Aplicando migraciones de base de datos..."
"${COMPOSE[@]}" exec -T backend alembic upgrade head

# El respaldo se instala desde acá y no a mano con `crontab -e` porque un cron
# que hay que acordarse de configurar es justamente el que termina sin
# configurar (fue el caso hasta hoy). Es idempotente: si ya está, no hace nada.
echo "==> 4/5  Verificando el respaldo automático..."
mkdir -p "$GESTION_DIR/backups"
chmod +x "$GESTION_DIR/scripts/backup.sh"
if crontab -l 2>/dev/null | grep -qF "scripts/backup.sh"; then
  echo "    Ya estaba configurado."
else
  CRON_LINE="0 3 * * * $GESTION_DIR/scripts/backup.sh >> $GESTION_DIR/backups/backup.log 2>&1"
  (crontab -l 2>/dev/null || true; echo "$CRON_LINE") | crontab -
  echo "    Instalado: respaldo diario a las 03:00 (hora del servidor)."
fi

echo "==> 5/5  Estado final:"
"${COMPOSE[@]}" ps

echo ""
echo "Listo. Si no ves los cambios en el navegador, purga la caché de"
echo "Cloudflare (panel de Cloudflare -> Caching -> Configuration ->"
echo "Purge Everything) o prueba en una ventana de incógnito."
