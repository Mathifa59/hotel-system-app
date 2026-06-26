"""fase7: numero de huespedes por reserva

Revision ID: e1f4c8b2a9d5
Revises: d7e3b9a4f1c2
Create Date: 2026-06-26 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e1f4c8b2a9d5'
down_revision: Union[str, None] = 'd7e3b9a4f1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default='1' para que las reservas existentes queden con 1 huésped.
    op.add_column('reservations', sa.Column('guests', sa.SmallInteger(), nullable=False, server_default='1'))


def downgrade() -> None:
    op.drop_column('reservations', 'guests')
