#!/usr/bin/env bash
# Respaldo de la base de datos de Apu Gestión.
#
# Genera un dump comprimido con fecha/hora y conserva solo los últimos
# RETENTION_DAYS días (rotación automática). Pensado para correr por cron en el
# VPS, pero funciona igual en local mientras el contenedor `db` esté arriba.
#
# Uso:   ./scripts/backup.sh
#
# El cron NO hay que configurarlo a mano: deploy.sh lo instala solo (paso 4/5)
# en el primer despliegue, a las 03:00 hora del servidor.
#
# Restaurar un respaldo:
#   gunzip -c backups/apu_hotel_FECHA.sql.gz | docker compose exec -T db psql -U hotel -d hotel
#
# ponytail: pg_dump + gzip + find-mtime. Sin servicio de backup externo ni
# herramientas extra — si algún día necesitas copias fuera del servidor,
# súbelas a almacenamiento externo con un segundo paso, no reescribas esto.
set -euo pipefail

# Raíz del proyecto = un nivel arriba de este script (scripts/ → proyecto/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DB_USER="${POSTGRES_USER:-hotel}"
DB_NAME="${POSTGRES_DB:-hotel}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

# Mismos archivos de compose que usa deploy.sh. Sin el override de producción,
# `docker compose` lee solo el archivo base y puede no resolver el contenedor
# que realmente está corriendo en el VPS.
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/apu_${DB_NAME}_${STAMP}.sql.gz"
TMP="$OUT.tmp"

# Se escribe a un temporal y solo se renombra al nombre definitivo si el dump
# salió íntegro. Así un fallo nunca deja un .sql.gz que parezca un respaldo
# bueno: o el archivo está completo, o no existe.
#
# El `set +e` es necesario porque con `set -e` un pg_dump fallido cortaría el
# script aquí mismo, sin llegar a borrar el temporal ni a avisar del error.
set +e
"${COMPOSE[@]}" exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$TMP"
dump_rc=$?
set -e

if [ "$dump_rc" -ne 0 ] || [ ! -s "$TMP" ] || ! gzip -t "$TMP" 2>/dev/null; then
  echo "$(date '+%F %T') ERROR: el respaldo falló o quedó corrupto, se descarta." >&2
  rm -f "$TMP"
  exit 1
fi

mv "$TMP" "$OUT"

# Rotación: elimina respaldos con más de RETENTION_DAYS días de antigüedad.
find "$BACKUP_DIR" -name 'apu_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "$(date '+%F %T') Respaldo OK: $OUT ($(du -h "$OUT" | cut -f1))"
