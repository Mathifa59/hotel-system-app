#!/usr/bin/env bash
# Respaldo de la base de datos de Apu Gestión.
#
# Genera un dump comprimido con fecha/hora y conserva solo los últimos
# RETENTION_DAYS días (rotación automática). Pensado para correr por cron en el
# VPS, pero funciona igual en local mientras el contenedor `db` esté arriba.
#
# Uso:   ./scripts/backup.sh
# Cron:  0 3 * * * /ruta/a/hotel-system/scripts/backup.sh >> /ruta/a/hotel-system/backups/backup.log 2>&1
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

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/apu_${DB_NAME}_${STAMP}.sql.gz"

# Dump desde el contenedor, comprimido al vuelo.
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"

# Si el dump quedó vacío, algo falló: se descarta y NO se rota (no borrar
# respaldos buenos por culpa de uno fallido).
if [ ! -s "$OUT" ]; then
  echo "$(date '+%F %T') ERROR: el respaldo quedó vacío, se aborta." >&2
  rm -f "$OUT"
  exit 1
fi

# Rotación: elimina respaldos con más de RETENTION_DAYS días de antigüedad.
find "$BACKUP_DIR" -name 'apu_*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -delete

echo "$(date '+%F %T') Respaldo OK: $OUT ($(du -h "$OUT" | cut -f1))"
