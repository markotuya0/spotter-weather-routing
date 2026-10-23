"""Shared HTTP client for provider adapters: timeouts, retry/backoff, key redaction.

docs/04 §5.3, docs/03 §7: connect 3s / read 8s timeout; 2 retries with jittered
backoff on timeouts/5xx/429 (respecting Retry-After); never retry on 4xx (except
429). This module does no business logic — it only knows about HTTP mechanics.
"""
from __future__ import annotations

import logging
import random
import re
import time
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests

logger = logging.getLogger("providers.http")

CONNECT_TIMEOUT_S = 3
READ_TIMEOUT_S = 8
# Routing responses for long-haul trips with several alternatives can be
# multi-MB (measured live in M2 integration: a Seattle->SLC calculateRoute
# response was 4.7 MB and took 8.94s, just over the original 8s budget,
# docs/09 §8) — routing gets a longer read timeout than the 8s default used
# for weather/geocoding, whose payloads stay small regardless of trip length.
READ_TIMEOUT_S_ROUTING = 20
MAX_RETRIES = 2
BACKOFF_BASE_S = 0.5
# M2 security closeout (C-1): a provider-controlled Retry-After must never
# be able to block a worker indefinitely or stack up unboundedly across
# retries. A single Retry-After is capped, and the *cumulative* time spent
# sleeping across all attempts of one logical request is capped too — once
# the budget would be exceeded we stop retrying and surface a controlled
# RATE_LIMITED error instead of sleeping further.
MAX_RETRY_AFTER_S = 20.0
MAX_TOTAL_WAIT_BUDGET_S = 20.0

# Set per request by trips.middleware.RequestIdMiddleware so provider logs can
# be correlated with the X-Request-ID the client sees.
request_id_var: ContextVar[Optional[str]] = ContextVar("request_id", default=None)

_REASON_MAX_LEN = 120

_BARE_KEY_RE = re.compile(r"(?i)\b(key|apiKey)=\S+")
_KEY_PARAM_RE = re.compile(r"(?i)([?&](?:key|apiKey)=)[^&]+")


def redact_url(url: str) -> str:
    """Strip API key values out of a URL (or any text containing one, e.g. a
    requests/urllib3 exception message that embeds the request URL) for safe
    logging and error messages (docs/03 §9, M2 security closeout C-2).
    """
    return _KEY_PARAM_RE.sub(r"\1REDACTED", url)


def _upstream_reason(response: requests.Response) -> Optional[str]:
    """Short, key-redacted reason string from a provider error body (Open-Meteo
    `reason`, TomTom `detailedError.code`/`error`), for diagnostics only. Never
    the raw body, so nothing user-specific or secret is logged."""
    try:
        body = response.json()
    except ValueError:
        return None
    if not isinstance(body, dict):
        return None
    reason = body.get("reason") or body.get("error") or (body.get("detailedError") or {}).get("code")
    if not isinstance(reason, str):
        return None
    return _BARE_KEY_RE.sub(r"\1=REDACTED", redact_url(reason))[:_REASON_MAX_LEN]


def _log_attempt(
    *, provider: str, operation: str, attempt: int, max_attempts: int, status: Optional[int],
    retry_after: Optional[str], attempt_ms: float, total_ms: float, category: str,
    will_retry: bool, reason: Optional[str] = None,
) -> None:
    """One structured key=value line per provider HTTP attempt. Host only (no
    URL/query, so no API key or coordinates), no client identity."""
    logger.info(
        "provider_call request_id=%s provider=%s operation=%s attempt=%d/%d status=%s "
        "retry_after=%s attempt_ms=%d total_ms=%d category=%s will_retry=%s reason=%s",
        request_id_var.get(), provider, operation, attempt + 1, max_attempts,
        status if status is not None else "-", retry_after or "-", attempt_ms, total_ms,
        category, str(will_retry).lower(), reason or "-",
    )


class ProviderError(Exception):
    """Typed provider failure (docs/03 §8). `kind` maps to the API error envelope."""

    def __init__(
        self,
        kind: str,
        message: str,
        *,
        retryable: bool,
        upstream_status: Optional[int] = None,
        retry_after_seconds: Optional[float] = None,
    ):
        super().__init__(redact_url(message))
        self.kind = kind
        self.retryable = retryable
        self.upstream_status = upstream_status
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class HttpResult:
    status_code: int
    json: Any
    headers: Dict[str, str]


def request_with_retry(
    method: str,
    url: str,
    *,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    session: Optional[requests.Session] = None,
    max_retries: int = MAX_RETRIES,
    provider_kind: str = "upstream",
    read_timeout_s: float = READ_TIMEOUT_S,
    operation: str = "request",
) -> HttpResult:
    """Perform one logical request with retry/backoff. Raises ProviderError on
    final failure. Never raises for a 4xx response (other than retryable 429)
    — callers inspect `HttpResult.status_code`/`json` to map provider-specific
    error bodies themselves (docs/03 §8).
    """
    sess = session or requests.Session()
    attempt = 0
    last_exc: Optional[Exception] = None
    total_waited_s = 0.0
    provider = urlparse(url).hostname or "unknown"
    call_started = time.monotonic()

    def log(status, retry_after, category, will_retry, reason=None):
        now = time.monotonic()
        _log_attempt(
            provider=provider, operation=operation, attempt=attempt, max_attempts=max_retries + 1,
            status=status, retry_after=retry_after, attempt_ms=(now - attempt_started) * 1000,
            total_ms=(now - call_started) * 1000, category=category, will_retry=will_retry, reason=reason,
        )

    while attempt <= max_retries:
        attempt_started = time.monotonic()
        try:
            response = sess.request(
                method,
                url,
                params=params,
                json=json_body,
                timeout=(CONNECT_TIMEOUT_S, read_timeout_s),
            )
        except requests.Timeout as exc:
            last_exc = exc
            planned_delay = _backoff_delay(attempt)
            will_retry = not (attempt == max_retries or total_waited_s + planned_delay > MAX_TOTAL_WAIT_BUDGET_S)
            log(None, None, "timeout", will_retry)
            if not will_retry:
                raise ProviderError(
                    "UPSTREAM_TIMEOUT", f"{provider_kind} request timed out", retryable=True
                ) from None
            time.sleep(planned_delay)
            total_waited_s += planned_delay
            attempt += 1
            continue
        except requests.RequestException as exc:
            # The exception's own message (from requests/urllib3) can embed the
            # full request URL, including the API key query param — never let
            # that raw text reach a ProviderError message or a chained traceback
            # (M2 security closeout C-2).
            safe_message = redact_url(str(exc))
            last_exc = exc
            planned_delay = _backoff_delay(attempt)
            will_retry = not (attempt == max_retries or total_waited_s + planned_delay > MAX_TOTAL_WAIT_BUDGET_S)
            log(None, None, f"connection_error:{type(exc).__name__}", will_retry)
            if not will_retry:
                raise ProviderError(
                    f"{provider_kind.upper()}_UNAVAILABLE",
                    f"{provider_kind} request failed: {safe_message}",
                    retryable=True,
                ) from None
            time.sleep(planned_delay)
            total_waited_s += planned_delay
            attempt += 1
            continue

        if response.status_code == 429 or response.status_code >= 500:
            retry_after = _parse_retry_after(response.headers.get("Retry-After"))
            planned_delay = retry_after if retry_after is not None else _backoff_delay(attempt)
            is_last_attempt = attempt == max_retries
            budget_exceeded = total_waited_s + planned_delay > MAX_TOTAL_WAIT_BUDGET_S

            log(
                response.status_code, response.headers.get("Retry-After"),
                "rate_limited" if response.status_code == 429 else "upstream_5xx",
                not (is_last_attempt or budget_exceeded), _upstream_reason(response),
            )
            if is_last_attempt or budget_exceeded:
                if response.status_code == 429:
                    raise ProviderError(
                        "RATE_LIMITED",
                        f"{provider_kind} rate limited",
                        retryable=True,
                        upstream_status=response.status_code,
                        retry_after_seconds=retry_after,
                    )
                raise ProviderError(
                    f"{provider_kind.upper()}_UNAVAILABLE",
                    f"{provider_kind} returned {response.status_code}",
                    retryable=True,
                    upstream_status=response.status_code,
                )
            time.sleep(planned_delay)
            total_waited_s += planned_delay
            attempt += 1
            continue

        log(
            response.status_code, None, "ok" if response.status_code < 400 else "client_error", False,
            _upstream_reason(response) if response.status_code >= 400 else None,
        )
        try:
            body = response.json()
        except ValueError:
            body = None
        return HttpResult(status_code=response.status_code, json=body, headers=dict(response.headers))

    # Unreachable: the loop above always returns or raises before exhausting attempts.
    raise ProviderError(  # pragma: no cover
        f"{provider_kind.upper()}_UNAVAILABLE", f"{provider_kind} failed: {redact_url(str(last_exc))}", retryable=True
    )


def _backoff_delay(attempt: int) -> float:
    return BACKOFF_BASE_S * (2 ** attempt) + random.uniform(0, BACKOFF_BASE_S)


def _parse_retry_after(value: Optional[str]) -> Optional[float]:
    """Defensively parses a Retry-After header (RFC 7231: delta-seconds or an
    HTTP-date). Returns None for anything malformed, and clamps the result to
    [0, MAX_RETRY_AFTER_S] so a malicious/broken upstream can never make us
    sleep an unbounded or negative amount (M2 security closeout C-1).
    """
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None

    seconds: Optional[float] = None
    try:
        seconds = float(text)
    except ValueError:
        try:
            dt = parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError, IndexError):
            dt = None
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            seconds = (dt - datetime.now(timezone.utc)).total_seconds()

    if seconds is None:
        return None
    if seconds != seconds or seconds in (float("inf"), float("-inf")):  # NaN / Infinite
        return None
    if seconds <= 0:
        return 0.0
    return min(seconds, MAX_RETRY_AFTER_S)
