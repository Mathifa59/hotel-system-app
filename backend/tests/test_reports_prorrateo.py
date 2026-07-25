"""Comprobación del prorrateo de ingresos por alojamiento en el reporte.

Corre sin base de datos ni framework: reproduce la aritmética exacta de
stats_report sobre datos armados a mano. Lo que protege es la regla que hace
que los reportes de meses cerrados no se muevan solos:

    el ingreso sale del cargo REALMENTE facturado, no de la tarifa vigente.

Uso:  python -m tests.test_reports_prorrateo      (desde backend/)
"""

from datetime import date, datetime, timedelta
from decimal import Decimal


def stay_nights(check_in: datetime, check_out: datetime) -> list[date]:
    """Copia de _stay_nights (reports.py) — las noches en que se duerme."""
    first, last = check_in.date(), check_out.date()
    if last <= first:
        return [first]
    return [first + timedelta(days=i) for i in range((last - first).days)]


def lodging_for_period(
    check_in: datetime,
    check_out: datetime,
    charge_pen: Decimal | None,
    current_rate_pen: Decimal,
    start: date,
    end: date,
) -> tuple[int, Decimal]:
    """Misma aritmética que stats_report: noches del periodo e ingreso."""
    nights = stay_nights(check_in, check_out)
    in_period = [n for n in nights if start <= n <= end]
    if not in_period:
        return 0, Decimal("0.00")
    count = len(in_period)
    if charge_pen is not None:
        total = Decimal(charge_pen) * count / len(nights)
    else:
        total = current_rate_pen * count
    return count, total.quantize(Decimal("0.01"))


def dt(s: str) -> datetime:
    return datetime.fromisoformat(s)


def main() -> None:
    JULIO = (date(2026, 7, 1), date(2026, 7, 31))

    # 1. Estadía cerrada dentro del mes: vale el cargo exacto, sin rastro de
    #    la tarifa vigente (que acá está deliberadamente inflada a 999).
    n, total = lodging_for_period(
        dt("2026-07-10T15:00"), dt("2026-07-13T11:00"),
        charge_pen=Decimal("525.00"), current_rate_pen=Decimal("999"), start=JULIO[0], end=JULIO[1],
    )
    assert n == 3, n
    assert total == Decimal("525.00"), total

    # 2. La misma estadía después de que suben los precios: NO se mueve.
    #    Es la regresión que motivó el cambio.
    _, total_despues = lodging_for_period(
        dt("2026-07-10T15:00"), dt("2026-07-13T11:00"),
        charge_pen=Decimal("525.00"), current_rate_pen=Decimal("250"), start=JULIO[0], end=JULIO[1],
    )
    assert total_despues == Decimal("525.00"), total_despues

    # 3. Estadía a caballo entre julio y agosto: 4 noches caen en julio de 7.
    n_jul, jul = lodging_for_period(
        dt("2026-07-28T15:00"), dt("2026-08-04T11:00"),
        charge_pen=Decimal("700.00"), current_rate_pen=Decimal("100"), start=JULIO[0], end=JULIO[1],
    )
    n_ago, ago = lodging_for_period(
        dt("2026-07-28T15:00"), dt("2026-08-04T11:00"),
        charge_pen=Decimal("700.00"), current_rate_pen=Decimal("100"),
        start=date(2026, 8, 1), end=date(2026, 8, 31),
    )
    assert (n_jul, n_ago) == (4, 3), (n_jul, n_ago)
    assert jul == Decimal("400.00"), jul
    assert ago == Decimal("300.00"), ago
    # Prorratear no puede inventar ni perder dinero.
    assert jul + ago == Decimal("700.00"), jul + ago

    # 4. Estadía activa (aún sin facturar): cae a la tarifa vigente.
    n, total = lodging_for_period(
        dt("2026-07-20T15:00"), dt("2026-07-22T11:00"),
        charge_pen=None, current_rate_pen=Decimal("175"), start=JULIO[0], end=JULIO[1],
    )
    assert n == 2 and total == Decimal("350.00"), (n, total)

    # 5. Cargo editado a mano (descuento): manda el importe corregido.
    _, total = lodging_for_period(
        dt("2026-07-05T15:00"), dt("2026-07-07T11:00"),
        charge_pen=Decimal("280.00"), current_rate_pen=Decimal("175"), start=JULIO[0], end=JULIO[1],
    )
    assert total == Decimal("280.00"), total

    # 6. Estadía de un solo día cuenta como 1 noche, igual que el cobro.
    n, _ = lodging_for_period(
        dt("2026-07-15T15:00"), dt("2026-07-15T20:00"),
        charge_pen=Decimal("175.00"), current_rate_pen=Decimal("175"), start=JULIO[0], end=JULIO[1],
    )
    assert n == 1, n

    # 7. Estadía completamente fuera del periodo: no aporta nada.
    n, total = lodging_for_period(
        dt("2026-06-01T15:00"), dt("2026-06-05T11:00"),
        charge_pen=Decimal("700.00"), current_rate_pen=Decimal("175"), start=JULIO[0], end=JULIO[1],
    )
    assert n == 0 and total == Decimal("0.00"), (n, total)

    # 8. ADR y RevPAR sobre el caso del reporte real (14 cuartos, julio).
    noches_vendidas, ingreso = 16, Decimal("2800.00")
    disponibles = 14 * 31
    assert disponibles == 434, disponibles
    assert (ingreso / noches_vendidas).quantize(Decimal("0.01")) == Decimal("175.00")
    assert (ingreso / disponibles).quantize(Decimal("0.01")) == Decimal("6.45")

    print("Prorrateo de ingresos: las 8 comprobaciones pasan.")


if __name__ == "__main__":
    main()
