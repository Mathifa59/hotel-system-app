import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

# ponytail: contador en memoria por proceso, suficiente para un solo backend.
# Si en algún momento corren varias réplicas, mover el contador a Redis (ya está
# disponible en el stack) para que el límite sea compartido entre procesos.


def client_ip(request: Request) -> str:
    """IP real del visitante.

    Detrás de Cloudflare + nginx, ``request.client.host`` es la IP interna de
    nginx (la misma para todos), así que el límite se volvería un balde global.
    Cloudflare manda la IP real en ``CF-Connecting-IP`` y nginx la propaga vía
    ``X-Forwarded-For``. Preferimos esas; caemos a la IP directa solo en
    desarrollo (sin proxy delante)."""
    cf = request.headers.get("cf-connecting-ip")
    if cf:
        return cf.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(max_per_minute: int):
    hits: dict[str, list[float]] = defaultdict(list)  # propio de este endpoint, no se comparte con otros
    last_sweep = [time.monotonic()]

    def checker(request: Request) -> None:
        ip = client_ip(request)
        now = time.monotonic()

        # Barrido ocasional: descarta IPs que ya no tienen hits recientes para
        # no acumular memoria con visitantes de una sola vez.
        if now - last_sweep[0] > 300:
            for stale in [k for k, v in hits.items() if not v or now - v[-1] > 60]:
                del hits[stale]
            last_sweep[0] = now

        recent = [t for t in hits[ip] if now - t < 60]
        if len(recent) >= max_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas solicitudes, intenta de nuevo en un momento",
            )
        recent.append(now)
        hits[ip] = recent

    return checker
