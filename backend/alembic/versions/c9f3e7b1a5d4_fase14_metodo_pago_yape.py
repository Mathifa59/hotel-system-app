"""fase14: metodo de pago yape

Revision ID: c9f3e7b1a5d4
Revises: b8e4f6a2c9d1
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c9f3e7b1a5d4'
down_revision: Union[str, None] = 'b8e4f6a2c9d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Yape es el método de pago móvil más usado en Perú — el dueño lo pidió
    # explícitamente para adelantos y pagos de check-out. ALTER TYPE ADD
    # VALUE no se puede revertir (Postgres no tiene DROP VALUE), así que el
    # downgrade no intenta deshacer esto — ver nota abajo.
    op.execute("ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'yape'")


def downgrade() -> None:
    # No hay DROP VALUE en Postgres para un enum. Revertir de verdad
    # requeriría recrear el tipo entero y remapear cualquier fila que ya
    # use 'yape' — no vale la pena para un downgrade que en la práctica
    # nunca se corre. Si hace falta, es una migración aparte a mano.
    pass
