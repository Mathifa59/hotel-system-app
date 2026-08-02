"""fase15: precio personalizado por reserva

Revision ID: e2d6a4f8b7c1
Revises: c9f3e7b1a5d4
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e2d6a4f8b7c1'
down_revision: Union[str, None] = 'c9f3e7b1a5d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('reservations', sa.Column('custom_rate_pen', sa.Numeric(8, 2), nullable=True))
    op.add_column('reservations', sa.Column('custom_rate_usd', sa.Numeric(8, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('reservations', 'custom_rate_usd')
    op.drop_column('reservations', 'custom_rate_pen')
