import json
from datetime import datetime, timezone

import redis

from app.core.config import settings

_redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def publish_event(event: str, audiences: list[str], payload: dict) -> None:
    message = json.dumps({"event": event, **payload, "ts": datetime.now(timezone.utc).isoformat()})
    for audience in audiences:
        _redis.publish(f"channel:{audience}", message)
