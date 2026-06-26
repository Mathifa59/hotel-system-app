"""fase6: agregar tipo de cargo 'room' (alojamiento)

Revision ID: d7e3b9a4f1c2
Revises: c4d8a1f9e2b3
Create Date: 2026-06-26 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd7e3b9a4f1c2'
down_revision: Union[str, None] = 'c4d8a1f9e2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_TYPES = ('minibar', 'damage', 'extra_cleaning', 'other')
NEW_TYPES = ('minibar', 'damage', 'extra_cleaning', 'other', 'room')


def upgrade() -> None:
    # La tabla charges está vacía en este punto, así que no hace falta backfill.
    op.execute("ALTER TABLE charges ALTER COLUMN type TYPE varchar(30)")
    op.execute("DROP TYPE charge_type")

    charge_type_enum = postgresql.ENUM(*NEW_TYPES, name='charge_type')
    charge_type_enum.create(op.get_bind())

    op.execute("ALTER TABLE charges ALTER COLUMN type TYPE charge_type USING type::charge_type")


def downgrade() -> None:
    op.execute("ALTER TABLE charges ALTER COLUMN type TYPE varchar(30)")
    op.execute("DROP TYPE charge_type")

    charge_type_enum = postgresql.ENUM(*OLD_TYPES, name='charge_type')
    charge_type_enum.create(op.get_bind())

    op.execute("ALTER TABLE charges ALTER COLUMN type TYPE charge_type USING type::charge_type")
