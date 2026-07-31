"""fase13: voucher de reserva (numero correlativo + adelanto)

Revision ID: b8e4f6a2c9d1
Revises: d9a1c5e7b3f8
Create Date: 2026-07-30 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'b8e4f6a2c9d1'
down_revision: Union[str, None] = 'd9a1c5e7b3f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Numeración del voucher (RES-0001, RES-0002...). Se asigna LAZY —recién
    # cuando alguien pide el voucher por primera vez, no al crear la
    # reserva— por eso es una SEQUENCE aparte y no un identity/serial de la
    # columna: reservas que nunca imprimen voucher no consumen número, y el
    # correlativo que ve la dueña coincide con el orden en que de verdad
    # entregó vouchers, no con el orden en que se tecleó cada reserva.
    op.execute("CREATE SEQUENCE reservation_voucher_seq START WITH 1")
    op.add_column('reservations', sa.Column('voucher_number', sa.Integer(), nullable=True))
    op.create_unique_constraint('uq_reservations_voucher_number', 'reservations', ['voucher_number'])

    # Adelanto pagado AL RESERVAR — distinto de payment_*/paid_at (fase9),
    # que es el pago final que se cobra al check-out. Antes de esto el
    # sistema no tenía forma de registrar que el huésped ya entregó S/70 al
    # reservar; el voucher necesita mostrar ese adelanto y el saldo
    # pendiente. Reutiliza el enum "payment_method" que ya existe.
    payment_method = postgresql.ENUM(name='payment_method', create_type=False)
    op.add_column('reservations', sa.Column('deposit_amount_pen', sa.Numeric(10, 2), nullable=True))
    op.add_column('reservations', sa.Column('deposit_amount_usd', sa.Numeric(10, 2), nullable=True))
    op.add_column('reservations', sa.Column('deposit_method', payment_method, nullable=True))
    op.add_column('reservations', sa.Column('deposit_paid_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('reservations', 'deposit_paid_at')
    op.drop_column('reservations', 'deposit_method')
    op.drop_column('reservations', 'deposit_amount_usd')
    op.drop_column('reservations', 'deposit_amount_pen')
    op.drop_constraint('uq_reservations_voucher_number', 'reservations', type_='unique')
    op.drop_column('reservations', 'voucher_number')
    op.execute("DROP SEQUENCE reservation_voucher_seq")
