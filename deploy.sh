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

GESTION_DIR="$HOME/apu-gestion-system"
WEB_DIR="$HOME/apu-garden-lodge-web"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "==> 1/4  Trayendo código nuevo desde GitHub..."
git -C "$WEB_DIR" pull --ff-only origin main
git -C "$GESTION_DIR" pull --ff-only origin main

echo "==> 2/4  Reconstruyendo contenedores (backend, frontend, web)..."
cd "$GESTION_DIR"
"${COMPOSE[@]}" up -d --build

echo "==> 3/4  Aplicando migraciones de base de datos..."
"${COMPOSE[@]}" exec -T backend alembic upgrade head

echo "==> 4/4  Estado final:"
"${COMPOSE[@]}" ps

echo ""
echo "Listo. Si no ves los cambios en el navegador, purga la caché de"
echo "Cloudflare (panel de Cloudflare -> Caching -> Configuration ->"
echo "Purge Everything) o prueba en una ventana de incógnito."
