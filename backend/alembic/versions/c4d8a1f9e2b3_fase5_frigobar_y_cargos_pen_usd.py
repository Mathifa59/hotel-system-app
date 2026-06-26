"""fase5: frigobar y cargos en soles y dolares

Revision ID: c4d8a1f9e2b3
Revises: 9b2a7f3e1d6c
Create Date: 2026-06-26 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c4d8a1f9e2b3'
down_revision: Union[str, None] = '9b2a7f3e1d6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Las 3 tablas están vacías en este punto (frigobar y cargos nunca se
    # usaron con datos reales), así que no hace falta backfill — se puede
    # agregar la columna USD como NOT NULL directamente.
    op.alter_column('minibar_products', 'price', new_column_name='price_pen')
    op.add_column('minibar_products', sa.Column('price_usd', sa.Numeric(8, 2), nullable=False))

    op.alter_column('minibar_consumptions', 'unit_price', new_column_name='unit_price_pen')
    op.add_column('minibar_consumptions', sa.Column('unit_price_usd', sa.Numeric(8, 2), nullable=False))
    op.alter_column('minibar_consumptions', 'total', new_column_name='total_pen')
    op.add_column('minibar_consumptions', sa.Column('total_usd', sa.Numeric(8, 2), nullable=False))

    op.alter_column('charges', 'amount', new_column_name='amount_pen')
    op.add_column('charges', sa.Column('amount_usd', sa.Numeric(10, 2), nullable=False))


def downgrade() -> None:
    op.drop_column('charges', 'amount_usd')
    op.alter_column('charges', 'amount_pen', new_column_name='amount')

    op.drop_column('minibar_consumptions', 'total_usd')
    op.alter_column('minibar_consumptions', 'total_pen', new_column_name='total')
    op.drop_column('minibar_consumptions', 'unit_price_usd')
    op.alter_column('minibar_consumptions', 'unit_price_pen', new_column_name='unit_price')

    op.drop_column('minibar_products', 'price_usd')
    op.alter_column('minibar_products', 'price_pen', new_column_name='price')
