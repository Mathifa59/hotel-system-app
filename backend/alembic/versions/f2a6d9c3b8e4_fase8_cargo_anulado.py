"""fase8: estado 'cancelled' (anulado) para cargos

Revision ID: f2a6d9c3b8e4
Revises: e1f4c8b2a9d5
Create Date: 2026-06-26 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f2a6d9c3b8e4'
down_revision: Union[str, None] = 'e1f4c8b2a9d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD = ('pending', 'approved', 'billed')
NEW = ('pending', 'approved', 'billed', 'cancelled')


def upgrade() -> None:
    # La columna charges.status tiene un DEFAULT que referencia el enum, así que
    # hay que soltarlo antes de reemplazar el tipo y volver a ponerlo después.
    op.execute("ALTER TABLE charges ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE charges ALTER COLUMN status TYPE varchar(30)")
    op.execute("DROP TYPE charge_status")

    enum = postgresql.ENUM(*NEW, name='charge_status')
    enum.create(op.get_bind())

    op.execute("ALTER TABLE charges ALTER COLUMN status TYPE charge_status USING status::charge_status")
    op.execute("ALTER TABLE charges ALTER COLUMN status SET DEFAULT 'pending'")


def downgrade() -> None:
    op.execute("ALTER TABLE charges ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TABLE charges ALTER COLUMN status TYPE varchar(30)")
    op.execute("DROP TYPE charge_status")

    enum = postgresql.ENUM(*OLD, name='charge_status')
    enum.create(op.get_bind())

    op.execute("ALTER TABLE charges ALTER COLUMN status TYPE charge_status USING status::charge_status")
    op.execute("ALTER TABLE charges ALTER COLUMN status SET DEFAULT 'pending'")
