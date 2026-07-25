#!/usr/bin/env bash
# Borra los datos de prueba de producción, conservando las reservas reales.
#
# El criterio es la FECHA DE REGISTRO: todo lo que se registró ANTES de la
# fecha de corte se considera prueba. Se eligió así porque las reservas reales
# del hotel empezaron en una fecha concreta y todo lo anterior fue ensayo — no
# hay ninguna marca en la base que distinga "prueba" de "real", así que la
# fecha es el único criterio honesto.
#
# Uso:
#   ./scripts/limpiar-datos-prueba.sh 2026-07-23              # SIMULACRO (no borra)
#   ./scripts/limpiar-datos-prueba.sh 2026-07-23 --ejecutar   # borra de verdad
#
# El simulacro y el borrado real corren EL MISMO SQL; la única diferencia es
# que el simulacro termina en ROLLBACK. Por eso lo que lista el simulacro es
# exactamente lo que va a pasar, no una aproximación.
#
# ponytail: una transacción de psql, sin script de migración ni ORM. Es una
# operación de una sola vez — si algo sale mal, revierte entera.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DB_USER="${POSTGRES_USER:-hotel}"
DB_NAME="${POSTGRES_DB:-hotel}"
COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

CORTE="${1:-}"
MODO="${2:-simulacro}"

if [ -z "$CORTE" ]; then
  echo "ERROR: falta la fecha de corte." >&2
  echo "Uso: $0 AAAA-MM-DD [--ejecutar]" >&2
  echo "     Todo lo registrado ANTES de esa fecha se borra." >&2
  exit 1
fi

if ! [[ "$CORTE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: la fecha debe tener el formato AAAA-MM-DD (recibí: $CORTE)" >&2
  exit 1
fi

if [ "$MODO" = "--ejecutar" ]; then
  CIERRE="COMMIT"
else
  CIERRE="ROLLBACK"
fi

# Antes de borrar nada, un respaldo. Si el respaldo falla, no se borra.
if [ "$CIERRE" = "COMMIT" ]; then
  echo "==> Respaldando la base antes de borrar..."
  "$SCRIPT_DIR/backup.sh"
  echo ""
  echo "!!  Vas a BORRAR de forma permanente todo lo registrado antes de $CORTE."
  echo "    Ya se guardó un respaldo en backups/ por si hay que revertir."
  read -r -p "    Escribe BORRAR para continuar: " confirmacion
  if [ "$confirmacion" != "BORRAR" ]; then
    echo "Cancelado, no se tocó nada."
    exit 1
  fi
fi

echo ""
echo "==> Modo: $([ "$CIERRE" = "COMMIT" ] && echo "BORRADO REAL" || echo "SIMULACRO (no se borra nada)")"
echo "==> Fecha de corte: $CORTE"
echo ""

# El heredoc va entre comillas simples para que `:'corte'` y los `\echo`
# lleguen literales a psql; por eso el COMMIT/ROLLBACK final se añade aparte,
# que es lo único que cambia entre simulacro y borrado real.
{
cat <<'SQL'
BEGIN;

CREATE TEMP TABLE _prueba ON COMMIT DROP AS
SELECT id FROM reservations WHERE created_at < :'corte'::timestamptz;

\echo ''
\echo '--- RESERVAS QUE SE CONSERVAN (las reales) ---'
SELECT guest_name, check_in::date AS entrada, check_out::date AS salida,
       status, source, created_at::date AS registrada
FROM reservations
WHERE id NOT IN (SELECT id FROM _prueba)
ORDER BY created_at;

\echo ''
\echo '--- RESERVAS QUE SE BORRAN (las de prueba) ---'
SELECT guest_name, check_in::date AS entrada, check_out::date AS salida,
       status, source, created_at::date AS registrada
FROM reservations
WHERE id IN (SELECT id FROM _prueba)
ORDER BY created_at;

\echo ''
\echo '--- BORRANDO (filas afectadas por tabla) ---'

-- Orden obligatorio: ningún FK tiene ON DELETE CASCADE, así que los hijos
-- van primero o Postgres rechaza el borrado.
DELETE FROM charges               WHERE reservation_id IN (SELECT id FROM _prueba);
DELETE FROM minibar_consumptions  WHERE reservation_id IN (SELECT id FROM _prueba);
DELETE FROM cleaning_requests     WHERE reservation_id IN (SELECT id FROM _prueba);
DELETE FROM reservations          WHERE id             IN (SELECT id FROM _prueba);

-- Limpiezas de prueba que nunca estuvieron ligadas a una reserva.
DELETE FROM cleaning_requests WHERE reservation_id IS NULL AND created_at < :'corte'::timestamptz;

-- Ruido de la etapa de pruebas: avisos viejos en la campana e historial.
DELETE FROM notifications WHERE created_at < :'corte'::timestamptz;
DELETE FROM activity_logs WHERE created_at < :'corte'::timestamptz;

-- Borrar una reserva no libera el cuarto. Todo cuarto que no tenga una
-- estadía activa vuelve a "disponible"; los de mantenimiento se respetan,
-- porque eso lo decidió una persona y no es residuo de las pruebas.
UPDATE rooms SET status = 'available'
WHERE status NOT IN ('available', 'maintenance')
  AND id NOT IN (
    SELECT room_id FROM reservations
    WHERE status = 'active' AND room_id IS NOT NULL
  );

\echo ''
\echo '--- ESTADO FINAL ---'
SELECT
  (SELECT count(*) FROM reservations)          AS reservas,
  (SELECT count(*) FROM charges)               AS cargos,
  (SELECT count(*) FROM minibar_consumptions)  AS consumos,
  (SELECT count(*) FROM cleaning_requests)     AS limpiezas,
  (SELECT count(*) FROM rooms WHERE status = 'available') AS cuartos_disponibles;
SQL
echo "$CIERRE;"
} | "${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -v corte="$CORTE"

echo ""
if [ "$CIERRE" = "COMMIT" ]; then
  echo "Listo. Los datos de prueba se borraron y los reportes ya reflejan solo lo real."
  echo "Si algo salió mal, restaura con el respaldo que se acaba de crear (ver DEPLOY.md)."
else
  echo "Fue un SIMULACRO — no se borró nada, la transacción se revirtió."
  echo "Si la lista de arriba es correcta, repite con:  $0 $CORTE --ejecutar"
fi
