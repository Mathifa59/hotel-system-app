from collections import defaultdict

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import settings

CHANNELS = ["admin", "reception", "cleaning", "all"]


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    def register(self, channels: list[str], websocket: WebSocket) -> None:
        for channel in channels:
            self._connections[channel].add(websocket)

    def unregister(self, channels: list[str], websocket: WebSocket) -> None:
        for channel in channels:
            self._connections[channel].discard(websocket)

    async def broadcast(self, channel: str, message: str) -> None:
        for ws in list(self._connections.get(channel, ())):
            try:
                await ws.send_text(message)
            except Exception:
                self._connections[channel].discard(ws)


manager = ConnectionManager()


async def redis_listener() -> None:
    """Reenvía los eventos publicados en Redis a los WebSockets conectados por canal/rol."""
    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = client.pubsub()
    await pubsub.subscribe(*[f"channel:{c}" for c in CHANNELS])
    async for message in pubsub.listen():
        if message["type"] != "message":
            continue
        channel = message["channel"].removeprefix("channel:")
        await manager.broadcast(channel, message["data"])
