"""Geocoding provider protocol and plain-data result types (docs/03 §2.4)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Protocol


@dataclass(frozen=True)
class Place:
    id: str
    label: str
    lat: float
    lng: float


class GeocodingProvider(Protocol):
    def suggest(self, q: str, *, limit: int) -> List[Place]:
        ...
