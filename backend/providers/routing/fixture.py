"""Fixture routing double: replays a recorded real TomTom response through
the same parsing path as the live adapter (docs/03 §2.4) — tests exercise
real response shapes, not hand-rolled convenience objects.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import List

from domain.models import LatLng

from ..http import ProviderError
from .base import ProviderRoute
from .tomtom import _error_code, _parse_routes


class FixtureRouting:
    """Loads a recorded TomTom `calculateRoute` JSON body from disk and parses
    it with the identical logic the live adapter uses, so a fixture test and
    a live-provider test share one parsing implementation to verify.
    """

    def __init__(self, fixture_path: str, http_status: int = 200):
        self._body = json.loads(Path(fixture_path).read_text())
        self._http_status = http_status

    def routes(
        self, origin: LatLng, destination: LatLng, *, max_alternatives: int, departure_iso: str
    ) -> List[ProviderRoute]:
        if self._http_status >= 400:
            code = _error_code(self._body)
            if code == "MAP_MATCHING_FAILURE":
                raise ProviderError("NO_ROUTE", "No drivable route found", retryable=False)
            raise ProviderError("ROUTING_UNAVAILABLE", f"TomTom rejected the request: {code}", retryable=False)
        return _parse_routes(self._body)
