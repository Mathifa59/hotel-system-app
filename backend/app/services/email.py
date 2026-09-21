"""Envío de correos vía la API REST de Resend, sin dependencia nueva (usa
urllib de la librería estándar — un POST simple no justifica agregar un SDK).

Mismo diseño de marca que los correos del Libro de Reclamaciones en el sitio
público (repo apu-garden-lodge-web, app/api/libro-de-reclamaciones/route.ts)
— colores y logo repetidos acá porque son dos runtimes distintos (Python vs.
TypeScript) sin forma de compartir ese archivo entre ambos.
"""

import json
import logging
import urllib.error
import urllib.request
from datetime import datetime

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
FROM_EMAIL = "Apu Garden Lodge <reservas@apu-garden-lodge.com>"
SITE_URL = "https://apu-garden-lodge.com"
LOGO_URL = f"{SITE_URL}/logo-white.png"
GESTION_URL = "https://gestion.apu-garden-lodge.com/reception/reservas"
FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

BRAND = {
    "cream_soft": "#fbf7ee",
    "sand": "#efe3c6",
    "ink": "#2b2a22",
    "ink_soft": "#54513f",
    "sage_deep": "#3f4a30",
    "sage_pale": "#dde3c8",
    "terracotta": "#83664a",
}

BUSINESS = {
    "razon_social": "CATNET PERU SAC",
    "ruc": "20608166204",
    "direccion": "Cidruchayoc, lote 178, sector Yanaconas, Urubamba, Cusco, Perú",
}


def _send(to: str, subject: str, html: str, reply_to: str | None = None) -> None:
    """Lanza excepción si falla — el caller decide si es crítico o best-effort."""
    payload: dict = {"from": FROM_EMAIL, "to": to, "subject": subject, "html": html}
    if reply_to:
        payload["reply_to"] = reply_to

    req = urllib.request.Request(
        RESEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
            # Sin esto, Cloudflare (delante de api.resend.com) devuelve un
            # 403 "error code: 1010" — bloquea el User-Agent por defecto de
            # urllib ("Python-urllib/3.x") por parecer tráfico de bot.
            # Encontrado reproduciendo el error real en producción.
            "User-Agent": "apu-gestion-system/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        if res.status >= 300:
            raise urllib.error.HTTPError(RESEND_URL, res.status, "Resend error", res.headers, None)


def _row(label: str, value: str | None) -> str:
    if not value:
        return ""
    safe = value.replace("\n", "<br/>")
    return f"""<tr>
        <td style="padding:10px 16px 10px 0;color:{BRAND['ink_soft']};font-size:12px;font-weight:600;white-space:nowrap;vertical-align:top;border-bottom:1px solid {BRAND['sage_pale']};">{label}</td>
        <td style="padding:10px 0;color:{BRAND['ink']};font-size:14px;line-height:1.5;vertical-align:top;border-bottom:1px solid {BRAND['sage_pale']};">{safe}</td>
    </tr>"""


def _shell(banner_color: str, banner_label: str, banner_right: str, body_html: str) -> str:
    return f"""<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:{BRAND['sand']};font-family:{FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BRAND['sand']};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:{BRAND['cream_soft']};border-radius:18px;border:1px solid {BRAND['sage_pale']};">
            <tr>
              <td style="background:{BRAND['sage_deep']};padding:28px 32px;text-align:center;border-radius:18px 18px 0 0;">
                <img src="{LOGO_URL}" width="150" alt="Apu Garden Lodge" style="display:block;margin:0 auto;border:0;outline:none;" />
              </td>
            </tr>
            <tr>
              <td style="background:{banner_color};padding:12px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#ffffff;">{banner_label}</td>
                    <td align="right" style="font-size:13px;font-weight:700;color:#ffffff;">{banner_right}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;">{body_html}</td>
            </tr>
            <tr>
              <td style="padding:24px 32px;border-top:1px solid {BRAND['sage_pale']};text-align:center;">
                <p style="margin:0;font-size:12px;line-height:1.7;color:{BRAND['ink_soft']};">
                  <strong style="color:{BRAND['ink']};">{BUSINESS['razon_social']}</strong> — RUC {BUSINESS['ruc']}<br/>
                  {BUSINESS['direccion']}<br/>
                  <a href="{SITE_URL}" style="color:{BRAND['terracotta']};text-decoration:none;">apu-garden-lodge.com</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def _format_pe(dt: datetime) -> str:
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    meses = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]
    return f"{dias[dt.weekday()]} {dt.day} de {meses[dt.month - 1]} de {dt.year}"


def send_booking_request_notification(
    *,
    guest_name: str,
    guest_email: str | None,
    guest_phone: str | None,
    room_type_label: str,
    room_number: str | None,
    check_in: datetime,
    check_out: datetime,
    guests: int,
    notes: str | None,
) -> None:
    """Avisa por correo cuando llega una solicitud de disponibilidad desde el
    sitio público — antes solo se veía dentro del sistema (websocket +
    notificación in-app), así que si nadie tenía esa pantalla abierta, la
    solicitud podía pasar inadvertida por horas. Best-effort: si Resend no
    está configurado o falla, solo se registra el error — la reserva ya
    quedó creada de todas formas, esto es un aviso adicional, no la fuente
    de verdad."""
    if not settings.resend_api_key or not settings.complaints_email_to:
        return

    waitlisted = room_number is None
    banner_color = BRAND["terracotta"] if not waitlisted else "#a3522f"
    status_label = f"Cuarto {room_number}" if room_number else "SIN CUARTO — lista de espera"

    content = f"""
        <h1 style="margin:0 0 6px;font-size:21px;font-weight:700;color:{BRAND['ink']};">Nueva solicitud de disponibilidad</h1>
        <p style="margin:0 0 20px;font-size:13px;color:{BRAND['ink_soft']};">Llegó desde el buscador de disponibilidad del sitio web.</p>
        {f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td align="center" style="background:#fce4d6;border-radius:12px;padding:14px;"><p style="margin:0;font-size:13px;font-weight:700;color:{banner_color};">Sin cuarto libre de ese tipo — quedó en lista de espera, asignar a mano.</p></td></tr></table>' if waitlisted else ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            {_row("Huésped", guest_name)}
            {_row("Email", guest_email)}
            {_row("Teléfono", guest_phone)}
            {_row("Tipo de cuarto", room_type_label)}
            {_row("Asignación", status_label)}
            {_row("Check-in", _format_pe(check_in))}
            {_row("Check-out", _format_pe(check_out))}
            {_row("Huéspedes", str(guests))}
            {_row("Notas", notes)}
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
            <tr>
                <td style="border-radius:10px;background:{BRAND['sage_deep']};">
                    <a href="{GESTION_URL}" style="display:inline-block;padding:11px 22px;font-size:13px;font-weight:600;color:#ffffff;text-decoration:none;">Ver en el sistema →</a>
                </td>
            </tr>
        </table>
    """
    html = _shell(banner_color, "Solicitud de disponibilidad", guest_name, content)

    try:
        _send(settings.complaints_email_to, f"Nueva solicitud — {guest_name} ({room_type_label})", html)
    except Exception:
        logger.exception("No se pudo enviar el correo de aviso de solicitud de disponibilidad")
