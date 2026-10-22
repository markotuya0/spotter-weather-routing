"""Routing provider protocol and plain-data result types (docs/03 §2.4)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Protocol, Sequence, Tuple

from domain.models import LatLng


@dataclass(frozen=True)
class ProviderRoute:
    """A single route as returned by a routing provider, before selection.

    `points` and `distance_mi`/`duration_s` map directly onto domain.models.Route.
    `name`/`via` are display strings derived from provider data, if available.
    """

    provider_index: int
    points: Tuple[LatLng, ...]
    distance_mi: float
    duration_s: float
    name: Optional[str] = None
    via: Optional[str] = None


class RoutingProvider(Protocol):
    def routes(
        self, origin: LatLng, destination: LatLng, *, max_alternatives: int, departure_iso: str
    ) -> List[ProviderRoute]:
        ...
