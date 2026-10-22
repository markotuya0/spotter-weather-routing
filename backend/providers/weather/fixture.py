"""Fixture weather double: replays a recorded Open-Meteo response through the
same parsing path as the live adapter. One fixture file covers one chunk
(<=100 locations); `hourly` returns it positionally keyed, same as the live
adapter's contract.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Dict, List, Sequence

from domain.models import LatLng
from domain.weather_match import ForecastSeries

from .open_meteo import _parse_series


class FixtureWeather:
    def __init__(self, fixture_path: str):
        body = json.loads(Path(fixture_path).read_text())
        self._location_bodies: List[dict] = body if isinstance(body, list) else [body]

    def hourly(self, points: Sequence[LatLng], start: date, end: date) -> Dict[int, ForecastSeries]:
        results: Dict[int, ForecastSeries] = {}
        for i in range(len(points)):
            loc = self._location_bodies[i % len(self._location_bodies)]
            results[i] = _parse_series(loc)
        return results
