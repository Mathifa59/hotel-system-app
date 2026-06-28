from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.core.security import decode_access_token
from app.services.realtime import manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    # Aceptar primero y recién ahí cerrar si el token no es válido — cerrar
    # antes de aceptar el handshake se comporta de forma inconsistente según
    # el navegador/proxy de por medio (puede verse como "closed before the
    # connection is established" en vez de un cierre limpio con código 4401).
    await websocket.accept()
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=4401)
        return

    channels = [payload["role"], "all"]
    manager.register(channels, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.unregister(channels, websocket)
