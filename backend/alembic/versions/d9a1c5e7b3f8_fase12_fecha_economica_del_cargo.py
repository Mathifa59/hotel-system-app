"""fase12: fecha economica del cargo (occurred_at)

Revision ID: d9a1c5e7b3f8
Revises: c7d2f4a8e1b6
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd9a1c5e7b3f8'
down_revision: Union[str, None] = 'c7d2f4a8e1b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Hasta ahora los reportes de ingresos sumaban por created_at — CUÁNDO se
    # tecleó el cargo. Con el registro de estadías pasadas eso se rompe: una
    # estadía de marzo cargada hoy sumaría a los ingresos de hoy, no a los de
    # marzo. occurred_at separa las dos fechas: created_at sigue siendo la de
    # auditoría (cuándo se registró) y occurred_at es la económica (cuándo
    # ocurrió de verdad el consumo/alojamiento), que es la que usan los
    # reportes.
    op.add_column("charges", sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True))
    # Para los cargos que ya existen ambas fechas coinciden — se registraron
    # en el momento en que ocurrieron, porque hasta ahora no había otra forma.
    op.execute("UPDATE charges SET occurred_at = created_at WHERE occurred_at IS NULL")
    op.alter_column(
        "charges",
        "occurred_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("now()"),
    )


def downgrade() -> None:
    op.drop_column("charges", "occurred_at")
