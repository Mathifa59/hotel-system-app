"""fase9: lista de espera (room_id nulo) + pago al check-out

Revision ID: a3c7f1e9d4b2
Revises: f2a6d9c3b8e4
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a3c7f1e9d4b2'
down_revision: Union[str, None] = 'f2a6d9c3b8e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # room_id nulo = reserva en lista de espera (el sitio web la creó sin
    # cuarto disponible para esas fechas); recepción asigna uno después.
    op.alter_column('reservations', 'room_id', existing_type=postgresql.UUID(), nullable=True)

    # Reutiliza el enum "room_type" que ya existe (rooms.type usa el mismo).
    op.add_column(
        'reservations',
        sa.Column(
            'requested_room_type',
            postgresql.ENUM(name='room_type', create_type=False),
            nullable=True,
        ),
    )

    payment_method = postgresql.ENUM('cash', 'card', 'transfer', name='payment_method')
    payment_method.create(op.get_bind())

    op.add_column('reservations', sa.Column('payment_method', payment_method, nullable=True))
    op.add_column('reservations', sa.Column('payment_amount_pen', sa.Numeric(10, 2), nullable=True))
    op.add_column('reservations', sa.Column('payment_amount_usd', sa.Numeric(10, 2), nullable=True))
    op.add_column('reservations', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('reservations', 'paid_at')
    op.drop_column('reservations', 'payment_amount_usd')
    op.drop_column('reservations', 'payment_amount_pen')
    op.drop_column('reservations', 'payment_method')
    op.execute("DROP TYPE payment_method")
    op.drop_column('reservations', 'requested_room_type')
    op.alter_column('reservations', 'room_id', existing_type=postgresql.UUID(), nullable=False)
