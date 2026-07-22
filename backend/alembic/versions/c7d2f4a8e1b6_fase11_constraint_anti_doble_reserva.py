"""fase11: constraint anti-doble-reserva (EXCLUDE gist)

Revision ID: c7d2f4a8e1b6
Revises: b5f8e2a1c7d3
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c7d2f4a8e1b6'
down_revision: Union[str, None] = 'b5f8e2a1c7d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Antes solo un SELECT + INSERT en Python (ver create_reservation)
    # validaba que no hubiera cruce de fechas para el mismo cuarto — dos
    # requests concurrentes (dos pestañas, dos recepcionistas) podían pasar
    # esa validación EN PARALELO y crear dos reservas que se pisan para el
    # mismo cuarto. Este constraint lo impide a nivel de base de datos, sin
    # importar la concurrencia. btree_gist habilita "=" sobre una columna
    # normal (room_id) dentro de un EXCLUDE, que de por sí solo trabaja con
    # operadores de rango/geometría (acá, && de solapamiento de rango).
    #
    # El WHERE parcial deja fuera: reservas canceladas/con checkout (no
    # ocupan el cuarto) y reservas en lista de espera (room_id NULL — Postgres
    # nunca las trata como "iguales" entre sí bajo "=", así que de todas
    # formas no chocarían, pero ser explícitos documenta la intención).
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute(
        """
        ALTER TABLE reservations
        ADD CONSTRAINT no_overlapping_reservations
        EXCLUDE USING gist (
            room_id WITH =,
            tstzrange(check_in, check_out) WITH &&
        )
        WHERE (status IN ('pending', 'active') AND room_id IS NOT NULL)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE reservations DROP CONSTRAINT no_overlapping_reservations")
    op.execute("DROP EXTENSION IF EXISTS btree_gist")
