"""Fixture geocoding double: replays a recorded TomTom Search response through
the same parsing path as the live adapter.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import List

from .base import Place
from .tomtom import _parse_places


class FixtureGeocoding:
    def __init__(self, fixture_path: str):
        self._body = json.loads(Path(fixture_path).read_text())

    def suggest(self, q: str, *, limit: int) -> List[Place]:
        return _parse_places(self._body)[:limit]
