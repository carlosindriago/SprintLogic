"""In-memory token bucket rate limiter for LLM-bound endpoints.

The app is a local desktop sidecar, so a process-local limiter keyed by
client address is sufficient — there is no shared infrastructure to
coordinate with. It protects against runaway/malicious usage of paid LLM
calls without requiring an external dependency (e.g. slowapi).

Thread-safety: bucket state is read/mutated only inside the event loop
(no blocking context switches happen between `consume()` calls), so a
plain dict is safe. The registry is capped and evicted oldest-first to
avoid unbounded growth on a long-lived server.
"""

import time
from collections import OrderedDict
from collections.abc import Callable

from fastapi import HTTPException, Request

RateLimitKey = str

DEFAULT_LIMIT = 10
DEFAULT_WINDOW_SECONDS = 60


class TokenBucket:
    """Leaky-bucket token bucket with full-token refill over a window."""

    __slots__ = ("tokens", "max_tokens", "window_seconds", "last_refill")

    def __init__(self, limit: int, window_seconds: int):
        self.tokens = float(limit)
        self.max_tokens = float(limit)
        self.window_seconds = float(window_seconds)
        self.last_refill = time.monotonic()

    def consume(self) -> bool:
        now = time.monotonic()
        self.tokens = min(
            self.max_tokens,
            self.tokens + (now - self.last_refill) * (self.max_tokens / self.window_seconds),
        )
        self.last_refill = now

        if self.tokens >= 1.0:
            self.tokens -= 1.0
            return True
        return False


class MemoryRateLimiter:
    """Thread-free in-process rate limiter keyed by client address."""

    def __init__(self, max_clients: int = 10_000):
        self._buckets: OrderedDict[RateLimitKey, TokenBucket] = OrderedDict()
        self._max_clients = max_clients

    def check(self, key: RateLimitKey, limit: int, window_seconds: int) -> bool:
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = TokenBucket(limit, window_seconds)
            self._buckets[key] = bucket
            self._evict_if_needed()
        else:
            self._buckets.move_to_end(key)
        return bucket.consume()

    def _evict_if_needed(self) -> None:
        while len(self._buckets) > self._max_clients:
            self._buckets.popitem(last=False)


_limiter = MemoryRateLimiter()


def require_rate_limit(
    limit: int = DEFAULT_LIMIT,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
    scope: str = "global",
) -> Callable[[Request], None]:
    """Build a FastAPI dependency enforcing N requests per window per client IP."""

    def dependency(request: Request) -> None:
        key = f"{scope}:{request.client.host if request.client else 'unknown'}"
        if not _limiter.check(key, limit, window_seconds):
            raise HTTPException(
                status_code=429,
                detail={
                    "message": f"Rate limit exceeded: {limit} requests per {window_seconds}s",
                    "scope": scope,
                },
            )

    return dependency
