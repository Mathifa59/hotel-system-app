import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    auth,
    charges,
    housekeeping,
    minibar,
    notifications,
    public,
    reports,
    reservations,
    rooms,
    users,
    ws,
)
from app.services.realtime import redis_listener


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(redis_listener())
    yield
    task.cancel()


app = FastAPI(title="Apu Gestión API", lifespan=lifespan)

# ponytail: allow_origins="*" es seguro aquí porque la auth es Bearer token
# (sin cookies), no credenciales de sesión cross-site.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Todo el REST queda bajo /api — así nginx enruta con una sola regla fija
# (/api/*) en vez de mantener una lista de routers que hay que actualizar
# cada vez que se agrega uno nuevo.
app.include_router(auth.router, prefix="/api")
app.include_router(rooms.router, prefix="/api")
app.include_router(housekeeping.router, prefix="/api")
app.include_router(minibar.router, prefix="/api")
app.include_router(charges.router, prefix="/api")
app.include_router(reservations.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(public.router, prefix="/api")
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
