import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

# ponytail: contador en memoria por proceso, suficiente para un solo backend.
# Si en algún momento corren varias réplicas, mover el contador a Redis (ya está
# disponible en el stack) para que el límite sea compartido entre procesos.


def rate_limit(max_per_minute: int):
    hits: dict[str, list[float]] = defaultdict(list)  # propio de este endpoint, no se comparte con otros

    def checker(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        recent = [t for t in hits[ip] if now - t < 60]
        if len(recent) >= max_per_minute:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas solicitudes, intenta de nuevo en un momento",
            )
        recent.append(now)
        hits[ip] = recent

    return checker
