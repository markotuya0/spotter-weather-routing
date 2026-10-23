"""TomTom Routing adapter (docs/03 §2.1, docs/08 Gate 0, docs/gate0-result.md).

Truck-mode request confirmed live in Gate 0: `travelMode=truck` with fixed
vehicle dimension/weight parameters. Those parameters describe a generic
legal truck profile for road-restriction purposes (low bridges, weight
limits) — they are deliberately NOT derived from the trip's `load_weight_lb`
(docs/09 §6: "weight semantics (load vs gross) must be defined first" is an
open item the user has not resolved; `load_weight_lb` only feeds the weather
load-override rules, domain/risk.py §6, never routing).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import requests

from domain.models import LatLng

from ..http import READ_TIMEOUT_S_ROUTING, ProviderError, redact_url, request_with_retry
from .base import ProviderRoute

BASE_URL = "https://api.tomtom.com/routing/1/calculateRoute"

# Generic legal-truck profile (matches the Gate 0 spike request, docs/gate0-result.md).
# Not derived from the request's load_weight_lb — see module docstring.
DEFAULT_VEHICLE_WEIGHT_KG = 18000
DEFAULT_VEHICLE_LENGTH_M = 16.5
DEFAULT_VEHICLE_WIDTH_M = 2.6
DEFAULT_VEHICLE_HEIGHT_M = 4.0


class TomTomRouting:
    def __init__(self, api_key: str, session: Optional[requests.Session] = None):
        self._api_key = api_key
        self._session = session or requests.Session()

    def routes(
        self, origin: LatLng, destination: LatLng, *, max_alternatives: int, departure_iso: str
    ) -> List[ProviderRoute]:
        url = f"{BASE_URL}/{origin.lat},{origin.lng}:{destination.lat},{destination.lng}/json"
        params = {
            "key": self._api_key,
            "maxAlternatives": max_alternatives,
            "travelMode": "truck",
            "vehicleWeight": DEFAULT_VEHICLE_WEIGHT_KG,
            "vehicleLength": DEFAULT_VEHICLE_LENGTH_M,
            "vehicleWidth": DEFAULT_VEHICLE_WIDTH_M,
            "vehicleHeight": DEFAULT_VEHICLE_HEIGHT_M,
            "vehicleCommercial": "true",
            "departAt": departure_iso,
        }
        try:
            result = request_with_retry(
                "GET", url, params=params, session=self._session, provider_kind="routing", operation="calculateRoute",
                read_timeout_s=READ_TIMEOUT_S_ROUTING,
            )
        except ProviderError:
            raise

        if result.status_code == 401 or result.status_code == 403:
            raise ProviderError("ROUTING_UNAVAILABLE", "TomTom auth failed", retryable=False, upstream_status=result.status_code)

        if result.status_code >= 400:
            code = _error_code(result.json)
            if code == "MAP_MATCHING_FAILURE":
                raise ProviderError("NO_ROUTE", "No drivable route found", retryable=False, upstream_status=result.status_code)
            # Any other rejection (e.g. BAD_INPUT) is a provider-side failure
            # from the API's point of view (04 §2 has no "upstream rejected our
            # otherwise-valid input" code) — our own serializer already
            # validated the request shape before this call was made.
            raise ProviderError(
                "ROUTING_UNAVAILABLE",
                f"TomTom rejected the request: {code}",
                retryable=False,
                upstream_status=result.status_code,
            )

        return _parse_routes(result.json)

    def __repr__(self) -> str:  # pragma: no cover - debug aid only
        return f"TomTomRouting(key={redact_url('?key=' + self._api_key)})"


def _error_code(body: Any) -> str:
    if isinstance(body, dict):
        return (body.get("detailedError") or {}).get("code", "UNKNOWN")
    return "UNKNOWN"


def _parse_routes(body: Any) -> List[ProviderRoute]:
    if not isinstance(body, dict) or not body.get("routes"):
        raise ProviderError("NO_ROUTE", "TomTom returned no routes", retryable=False)

    routes: List[ProviderRoute] = []
    for idx, raw_route in enumerate(body["routes"]):
        summary: Dict[str, Any] = raw_route.get("summary", {})
        distance_mi = summary.get("lengthInMeters", 0) / 1609.344
        duration_s = float(summary.get("travelTimeInSeconds", 0))

        points: List[LatLng] = []
        for leg in raw_route.get("legs", []):
            for p in leg.get("points", []):
                points.append(LatLng(lat=p["latitude"], lng=p["longitude"]))

        if not points or distance_mi <= 0:
            continue

        routes.append(
            ProviderRoute(
                provider_index=idx,
                points=tuple(points),
                distance_mi=distance_mi,
                duration_s=duration_s,
            )
        )

    if not routes:
        raise ProviderError("NO_ROUTE", "TomTom returned no usable routes", retryable=False)
    return routes
