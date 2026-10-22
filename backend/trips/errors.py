"""Typed exceptions -> DRF exception handler -> error envelope (docs/04 §2, docs/03 §8)."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

from providers.http import ProviderError

logger = logging.getLogger("trips.errors")


class DomainApiError(Exception):
    """A business-rule failure the view layer must surface as a specific
    error code (docs/04 §2), distinct from DRF serializer validation errors
    (which are handled by DRF's own ValidationError machinery) and from
    provider failures (ProviderError, mapped below).
    """

    def __init__(self, code: str, message: str, *, http_status: int, details: Optional[Dict[str, Any]] = None, retryable: bool = False, retry_after_seconds: Optional[float] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.details = details
        self.retryable = retryable
        self.retry_after_seconds = retry_after_seconds


_CODE_TO_STATUS = {
    "VALIDATION_ERROR": status.HTTP_400_BAD_REQUEST,
    "NO_ROUTE": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "TOO_MANY_CHECKPOINTS": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "FORECAST_HORIZON": status.HTTP_422_UNPROCESSABLE_ENTITY,
    "RATE_LIMITED": status.HTTP_429_TOO_MANY_REQUESTS,
    "WEATHER_UNAVAILABLE": status.HTTP_502_BAD_GATEWAY,
    "ROUTING_UNAVAILABLE": status.HTTP_502_BAD_GATEWAY,
    "UPSTREAM_TIMEOUT": status.HTTP_504_GATEWAY_TIMEOUT,
    "INTERNAL_ERROR": status.HTTP_500_INTERNAL_SERVER_ERROR,
}

_FRIENDLY_MESSAGE = {
    "VALIDATION_ERROR": "Please correct the highlighted fields.",
    "NO_ROUTE": "No drivable route was found between these locations.",
    "TOO_MANY_CHECKPOINTS": "This trip needs a coarser checkpoint spacing.",
    "FORECAST_HORIZON": "This departure time is beyond the weather forecast's coverage.",
    "RATE_LIMITED": "Too many requests. Please try again shortly.",
    "WEATHER_UNAVAILABLE": "Weather data is temporarily unavailable.",
    "ROUTING_UNAVAILABLE": "The routing service is temporarily unavailable.",
    "UPSTREAM_TIMEOUT": "The request timed out. Please try again.",
    "INTERNAL_ERROR": "Something went wrong on our end.",
}


def _envelope(code: str, message: str, *, details=None, retryable=False, retry_after_seconds=None, request_id=None) -> Dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "retryable": retryable,
            "retry_after_seconds": retry_after_seconds,
            "request_id": request_id or str(uuid.uuid4()),
        }
    }


def _sanitize_retry_after(value: Any) -> Optional[float]:
    """Defense in depth (M2 security closeout W-3): whatever produced this
    value (our own retry budget, or DRF's Throttled.wait), make sure what
    reaches the client is finite and non-negative before it's ever put in
    the envelope.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v or v in (float("inf"), float("-inf")):  # NaN / Infinite
        return None
    return max(0.0, v)


def exception_handler(exc, context):
    request_id = str(uuid.uuid4())
    request = context.get("request") if context else None
    if request is not None:
        request_id = getattr(request, "request_id", request_id)

    if isinstance(exc, DomainApiError):
        body = _envelope(
            exc.code, exc.message, details=exc.details, retryable=exc.retryable,
            retry_after_seconds=_sanitize_retry_after(exc.retry_after_seconds), request_id=request_id,
        )
        response = Response(body, status=exc.http_status)
        response["X-Request-ID"] = request_id
        return response

    # DRF's own application-level throttling (docs/04 §2 RATE_LIMITED applies
    # to "our throttle or an upstream limit" alike) — handled explicitly so it
    # gets the same RATE_LIMITED envelope + retry_after_seconds as an upstream
    # 429 does, instead of falling through to the generic VALIDATION_ERROR
    # mapping below (M2 security closeout W-3).
    if isinstance(exc, Throttled):
        retry_after = _sanitize_retry_after(exc.wait)
        body = _envelope(
            "RATE_LIMITED", _FRIENDLY_MESSAGE["RATE_LIMITED"], retryable=True,
            retry_after_seconds=retry_after, request_id=request_id,
        )
        response = Response(body, status=status.HTTP_429_TOO_MANY_REQUESTS)
        response["X-Request-ID"] = request_id
        if retry_after is not None:
            response["Retry-After"] = str(int(retry_after))
        return response

    if isinstance(exc, ProviderError):
        http_status = _CODE_TO_STATUS.get(exc.kind, status.HTTP_502_BAD_GATEWAY)
        message = _FRIENDLY_MESSAGE.get(exc.kind, str(exc))
        body = _envelope(
            exc.kind, message, retryable=exc.retryable,
            retry_after_seconds=_sanitize_retry_after(getattr(exc, "retry_after_seconds", None)),
            request_id=request_id,
        )
        response = Response(body, status=http_status)
        response["X-Request-ID"] = request_id
        return response

    drf_response = drf_default_handler(exc, context)
    if drf_response is not None:
        details = drf_response.data if isinstance(drf_response.data, dict) else {"non_field_errors": drf_response.data}
        body = _envelope(
            "VALIDATION_ERROR", _FRIENDLY_MESSAGE["VALIDATION_ERROR"], details=details, request_id=request_id,
        )
        response = Response(body, status=status.HTTP_400_BAD_REQUEST if drf_response.status_code < 500 else drf_response.status_code)
        response["X-Request-ID"] = request_id
        return response

    # Unknown exception: never leak the stack trace to the client (docs/03 §8).
    logger.exception("Unhandled exception (request_id=%s)", request_id)
    body = _envelope("INTERNAL_ERROR", _FRIENDLY_MESSAGE["INTERNAL_ERROR"], request_id=request_id)
    response = Response(body, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    response["X-Request-ID"] = request_id
    return response
