"""fase10: tipo de cuarto Triple + tarifas profesional/promocional

Revision ID: b5f8e2a1c7d3
Revises: a3c7f1e9d4b2
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b5f8e2a1c7d3'
down_revision: Union[str, None] = 'a3c7f1e9d4b2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TYPES = ('individual', 'doble', 'doble_deluxe', 'doble_deluxe_twin', 'deluxe_extragrande')
NEW_TYPES = (*OLD_TYPES, 'triple')

# Tarifas confirmadas con el dueño (2026-07-21). "Doble Deluxe - 2 camas" no
# está en ninguna de las dos listas que dio — se deja tal cual, sin
# promocional (el checkout cae a la profesional para ese tipo). USD estimado
# con el mismo tipo de cambio de referencia (~3.75) usado en la carga
# original de tarifas (ver 9b2a7f3e1d6c).
PROFESSIONAL_RATES = {
    'individual': (100, 27),
    'doble': (175, 47),
    'doble_deluxe': (207, 55),
    'deluxe_extragrande': (223, 59),
    'triple': (260, 69),
}
PROMOTIONAL_RATES = {
    'individual': (70, 19),
    'doble': (120, 32),
    'doble_deluxe': (140, 37),
    'deluxe_extragrande': (150, 40),
    'triple': (170, 45),
}

# Todas las columnas que usan el enum room_type — hay que despegarlas antes
# de poder hacer DROP TYPE y volver a pegarlas después (si se olvida alguna,
# el DROP TYPE falla por dependencia).
ROOM_TYPE_COLUMNS = [
    ("rooms", "type"),
    ("room_type_rates", "type"),
    ("reservations", "requested_room_type"),
]


def upgrade() -> None:
    for table, column in ROOM_TYPE_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE varchar(30)")
    op.execute("DROP TYPE room_type")

    room_type_enum = postgresql.ENUM(*NEW_TYPES, name='room_type')
    room_type_enum.create(op.get_bind())

    for table, column in ROOM_TYPE_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE room_type USING {column}::room_type")

    op.add_column('room_type_rates', sa.Column('price_pen_promo', sa.Numeric(8, 2), nullable=True))
    op.add_column('room_type_rates', sa.Column('price_usd_promo', sa.Numeric(8, 2), nullable=True))

    for room_type, (pen, usd) in PROFESSIONAL_RATES.items():
        promo_pen, promo_usd = PROMOTIONAL_RATES[room_type]
        op.execute(
            f"""
            INSERT INTO room_type_rates (type, price_pen, price_usd, price_pen_promo, price_usd_promo)
            VALUES ('{room_type}', {pen}, {usd}, {promo_pen}, {promo_usd})
            ON CONFLICT (type) DO UPDATE SET
                price_pen = EXCLUDED.price_pen,
                price_usd = EXCLUDED.price_usd,
                price_pen_promo = EXCLUDED.price_pen_promo,
                price_usd_promo = EXCLUDED.price_usd_promo
            """
        )

    rate_plan_enum = postgresql.ENUM('professional', 'promotional', name='rate_plan')
    rate_plan_enum.create(op.get_bind())
    op.add_column(
        'reservations',
        sa.Column(
            'rate_plan',
            postgresql.ENUM('professional', 'promotional', name='rate_plan', create_type=False),
            nullable=False,
            server_default='professional',
        ),
    )


def downgrade() -> None:
    op.drop_column('reservations', 'rate_plan')
    op.execute("DROP TYPE rate_plan")

    op.drop_column('room_type_rates', 'price_pen_promo')
    op.drop_column('room_type_rates', 'price_usd_promo')
    op.execute("DELETE FROM room_type_rates WHERE type = 'triple'")

    for table, column in ROOM_TYPE_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE varchar(30)")
    op.execute("DROP TYPE room_type")

    room_type_enum = postgresql.ENUM(*OLD_TYPES, name='room_type')
    room_type_enum.create(op.get_bind())

    for table, column in ROOM_TYPE_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE room_type USING {column}::room_type")
