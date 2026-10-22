"""Weather provider protocol (docs/03 §2.4)."""
from __future__ import annotations

from datetime import date
from typing import Dict, Protocol, Sequence

from domain.models import LatLng
from domain.weather_match import ForecastSeries


class WeatherProvider(Protocol):
    def hourly(
        self, points: Sequence[LatLng], start: date, end: date
    ) -> Dict[LatLng, ForecastSeries]:
        ...
