"""TomTom Search (Fuzzy Search, used as typeahead/suggest) adapter.

docs/03 §2.3: endpoint choice was UNVERIFIED at Gate 0 (not in the hard-trigger
checklist, since it only gates row 1/3/4 of routing). Uses TomTom's Fuzzy
Search endpoint with `typeahead=true&countrySet=US` (docs/01 A-09: suggestions
restricted to the United States).
"""
from __future__ import annotations

import urllib.parse
from typing import Any, Dict, List, Optional

import requests

from ..http import ProviderError, request_with_retry
from .base import Place

BASE_URL = "https://api.tomtom.com/search/2/search"


class TomTomGeocoding:
    def __init__(self, api_key: str, session: Optional[requests.Session] = None):
        self._api_key = api_key
        self._session = session or requests.Session()

    def suggest(self, q: str, *, limit: int) -> List[Place]:
        encoded = urllib.parse.quote(q)
        url = f"{BASE_URL}/{encoded}.json"
        params = {
            "key": self._api_key,
            "limit": limit,
            "typeahead": "true",
            "countrySet": "US",
        }
        result = request_with_retry(
            "GET", url, params=params, session=self._session, provider_kind="geocoding", operation="search"
        )

        # docs/04 §2 defines no geocoding-specific "*_UNAVAILABLE" code (only
        # RATE_LIMITED/UPSTREAM_TIMEOUT are named for this endpoint); TomTom
        # Search shares the same account/key family as TomTom Routing, so a
        # hard failure here is reported under the same ROUTING_UNAVAILABLE code.
        if result.status_code in (401, 403) or result.status_code >= 400:
            raise ProviderError("ROUTING_UNAVAILABLE", "TomTom geocoding request failed", retryable=False, upstream_status=result.status_code)

        return _parse_places(result.json)


def _parse_places(body: Any) -> List[Place]:
    if not isinstance(body, dict):
        return []
    places: List[Place] = []
    for r in body.get("results", []):
        position: Dict[str, Any] = r.get("position", {})
        address: Dict[str, Any] = r.get("address", {})
        lat, lng = position.get("lat"), position.get("lon")
        label = address.get("freeformAddress")
        place_id = r.get("id")
        if lat is None or lng is None or not label or not place_id:
            continue
        places.append(Place(id=f"tt:{place_id}", label=label, lat=lat, lng=lng))
    return places
