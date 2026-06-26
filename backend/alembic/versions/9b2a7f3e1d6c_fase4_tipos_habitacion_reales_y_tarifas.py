"""fase4: tipos de habitacion reales y tarifas

Revision ID: 9b2a7f3e1d6c
Revises: 8160490a4546
Create Date: 2026-06-25 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9b2a7f3e1d6c'
down_revision: Union[str, None] = '8160490a4546'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TYPES = ('single', 'double', 'suite')
NEW_TYPES = ('individual', 'doble', 'doble_deluxe', 'doble_deluxe_twin', 'deluxe_extragrande')

# Tarifas fijas por noche confirmadas con el cliente (2026-06-25).
RATES = {
    'individual': (82, 22),
    'doble': (87, 23),
    'doble_deluxe': (117, 31),
    'doble_deluxe_twin': (77, 20),
    'deluxe_extragrande': (131, 35),
}


def upgrade() -> None:
    # No hay cuartos cargados todavía (entorno recién creado), así que no hace
    # falta migrar datos — solo reemplazar el tipo enum por los 5 tipos reales.
    op.execute("ALTER TABLE rooms ALTER COLUMN type TYPE varchar(30)")
    op.execute("DROP TYPE room_type")

    room_type_enum = postgresql.ENUM(*NEW_TYPES, name='room_type')
    room_type_enum.create(op.get_bind())

    op.execute("ALTER TABLE rooms ALTER COLUMN type TYPE room_type USING type::room_type")

    op.create_table(
        'room_type_rates',
        sa.Column('type', postgresql.ENUM(*NEW_TYPES, name='room_type', create_type=False), nullable=False),
        sa.Column('price_pen', sa.Numeric(8, 2), nullable=False),
        sa.Column('price_usd', sa.Numeric(8, 2), nullable=False),
        sa.PrimaryKeyConstraint('type'),
    )

    rates_table = sa.table(
        'room_type_rates',
        sa.column('type', sa.String),
        sa.column('price_pen', sa.Numeric(8, 2)),
        sa.column('price_usd', sa.Numeric(8, 2)),
    )
    op.bulk_insert(
        rates_table,
        [{'type': t, 'price_pen': pen, 'price_usd': usd} for t, (pen, usd) in RATES.items()],
    )


def downgrade() -> None:
    op.drop_table('room_type_rates')

    op.execute("ALTER TABLE rooms ALTER COLUMN type TYPE varchar(30)")
    op.execute("DROP TYPE room_type")

    room_type_enum = postgresql.ENUM(*OLD_TYPES, name='room_type')
    room_type_enum.create(op.get_bind())

    op.execute("ALTER TABLE rooms ALTER COLUMN type TYPE room_type USING type::room_type")
