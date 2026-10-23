"""Open-Meteo forecast adapter (docs/03 §2.2, §6).

- Always requests `wind_speed_unit=mph`, `precipitation_unit=inch`,
  `timeformat=unixtime` — never converts units itself (removes a whole class
  of unit-error bug, docs/03 §2.2 "Consequences").
- Chunks requests to <=100 locations (docs/03 §6) and applies a shared
  in-process token-bucket limiter (500 locations/min) ahead of each chunk.
- Returns are positional: Open-Meteo's multi-location response is an array
  indexed by request order (confirmed live, docs/gate0-result.md), so results
  are zipped back onto the input `points` list by index, not by echoed
  lat/lng (which can be grid-snapped and need not match exactly).
"""
from __future__ import annotations

import threading
import time
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

import requests

from domain.models import LatLng
from domain.weather_match import ForecastSeries

from ..http import ProviderError, request_with_retry

BASE_URL = "https://api.open-meteo.com/v1/forecast"
CHUNK_SIZE = 100
RATE_LIMIT_LOCATIONS_PER_MIN = 500
HOURLY_VARS = "wind_speed_10m,rain,showers,snowfall"
ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)"


class _TokenBucket:
    """Shared, process-local rate limiter: `rate` tokens refill per 60s."""

    def __init__(self, rate_per_minute: int):
        self._rate_per_sec = rate_per_minute / 60.0
        self._tokens = float(rate_per_minute)
        self._capacity = float(rate_per_minute)
        self._last = time.monotonic()
        self._lock = threading.Lock()

    def consume(self, amount: int) -> None:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last
            self._last = now
            self._tokens = min(self._capacity, self._tokens + elapsed * self._rate_per_sec)
            if amount > self._tokens:
                deficit = amount - self._tokens
                wait_s = deficit / self._rate_per_sec
                time.sleep(wait_s)
                self._tokens = 0.0
                self._last = time.monotonic()
            else:
                self._tokens -= amount


_LIMITER = _TokenBucket(RATE_LIMIT_LOCATIONS_PER_MIN)


class OpenMeteoWeather:
    """`base_url` defaults to Open-Meteo's public endpoint; in production it points
    at our Cloudflare Worker proxy (worker/open-meteo-proxy), which authenticates
    with `proxy_secret` sent as X-Proxy-Secret. The secret is only ever a header:
    request_with_retry logs host/operation/status, never headers or URLs."""

    def __init__(
        self,
        session: Optional[requests.Session] = None,
        limiter: Optional[_TokenBucket] = None,
        base_url: str = BASE_URL,
        proxy_secret: str = "",
    ):
        self._session = session or requests.Session()
        self._limiter = limiter or _LIMITER
        self._base_url = base_url
        self._headers = {"X-Proxy-Secret": proxy_secret} if proxy_secret else None

    def hourly(
        self, points: Sequence[LatLng], start: date, end: date
    ) -> Dict[int, ForecastSeries]:
        """Returns a dict keyed by the *index* into `points` (not the LatLng
        itself, since LatLng is unhashable-by-identity-safe but duplicate
        coordinates would collide as a dict key and silently merge distinct
        callers' points; the service layer owns deduplication, docs/03 §6)."""
        if not points:
            return {}

        results: Dict[int, ForecastSeries] = {}
        chunks = [points[i : i + CHUNK_SIZE] for i in range(0, len(points), CHUNK_SIZE)]
        offset = 0
        last_error: ProviderError | None = None
        for chunk in chunks:
            self._limiter.consume(len(chunk))
            try:
                series_list = self._fetch_chunk(chunk, start, end)
            except ProviderError as exc:
                # A single chunk failing after retries is a partial failure
                # (docs/04 §5.4): its locations are simply absent from the
                # returned dict, which the caller reads as "unknown". Only a
                # TOTAL failure (every chunk fails) is re-raised as a 502
                # (checked after the loop).
                last_error = exc
                offset += len(chunk)
                continue
            for i, series in enumerate(series_list):
                results[offset + i] = series
            offset += len(chunk)

        if not results and points and last_error is not None:
            raise last_error
        return results

    def _fetch_chunk(self, chunk: Sequence[LatLng], start: date, end: date) -> List[ForecastSeries]:
        params = {
            "latitude": ",".join(str(p.lat) for p in chunk),
            "longitude": ",".join(str(p.lng) for p in chunk),
            "hourly": HOURLY_VARS,
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "timeformat": "unixtime",
            "timezone": "UTC",
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        }
        try:
            result = request_with_retry(
                "GET", self._base_url, params=params, session=self._session, provider_kind="weather",
                operation="forecast", headers=self._headers,
            )
        except ProviderError as exc:
            if exc.kind != "RATE_LIMITED":
                raise
            # An upstream weather quota/rate limit is a weather-provider outage
            # from the client's point of view, not the client being throttled
            # (docs/04 §5.4: total weather failure -> WEATHER_UNAVAILABLE).
            raise ProviderError(
                "WEATHER_UNAVAILABLE", "Open-Meteo rate limited", retryable=exc.retryable,
                upstream_status=exc.upstream_status, retry_after_seconds=exc.retry_after_seconds,
            ) from None
        if result.status_code >= 400:
            raise ProviderError(
                "WEATHER_UNAVAILABLE", "Open-Meteo rejected the request", retryable=True, upstream_status=result.status_code
            )

        body = result.json
        # A single location returns one object; multiple locations return a
        # list of objects, one per location, in request order (confirmed live).
        location_bodies = body if isinstance(body, list) else [body]
        if len(location_bodies) != len(chunk):
            raise ProviderError("WEATHER_UNAVAILABLE", "Open-Meteo location count mismatch", retryable=True)
        return [_parse_series(loc) for loc in location_bodies]


def _parse_series(location_body: Any) -> ForecastSeries:
    hourly: Dict[str, Any] = (location_body or {}).get("hourly", {})
    times_raw: List[int] = hourly.get("time", [])
    times = [datetime.fromtimestamp(t, tz=timezone.utc) for t in times_raw]
    return ForecastSeries(
        times=times,
        wind_mph=hourly.get("wind_speed_10m", []),
        rain_in=hourly.get("rain", []),
        showers_in=hourly.get("showers", []),
        snow_in=hourly.get("snowfall", []),
    )
