"""Forecast sampling at an arbitrary arrival time (docs/05 §4.2-4.3)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from .models import WeatherSample

__all__ = ["ForecastSeries", "sample_at"]


@dataclass(frozen=True)
class ForecastSeries:
    """One location's hourly forecast. `times` are UTC, on-the-hour, ascending.

    `wind_mph` is instantaneous; `rain_in`, `showers_in`, `snow_in` are each a
    sum over the hour ENDING at the same-index timestamp (Open-Meteo convention,
    docs/05 §4.2). Any entry may be `None` to represent missing/null provider data.
    """

    times: Sequence[datetime]
    wind_mph: Sequence[Optional[float]]
    rain_in: Sequence[Optional[float]]
    showers_in: Sequence[Optional[float]]
    snow_in: Sequence[Optional[float]]


def _floor_hour(t: datetime) -> datetime:
    return t.replace(minute=0, second=0, microsecond=0)


def _index_of(times: Sequence[datetime], t: datetime) -> Optional[int]:
    # Hourly series are small (<= a few hundred entries); linear scan is fine and
    # avoids assuming a particular container type beyond Sequence.
    for i, candidate in enumerate(times):
        if candidate == t:
            return i
    return None


def sample_at(series: ForecastSeries, t: datetime) -> WeatherSample:
    """docs/05 §4.3. Returns a WeatherSample; `unknown=True` if any required
    value is missing/null or `t`'s hour bracket falls outside the series.
    """
    h0 = _floor_hour(t)
    h1 = h0 if t == h0 else h0 + timedelta(hours=1)

    idx0 = _index_of(series.times, h0)
    idx1 = _index_of(series.times, h1)
    if idx0 is None or idx1 is None:
        return WeatherSample(
            wind_mph=None,
            rain_in_per_hr=None,
            snow_in_per_hr=None,
            unknown=True,
            unknown_reason="beyond_forecast",
        )

    wind0, wind1 = series.wind_mph[idx0], series.wind_mph[idx1]
    rain1, showers1, snow1 = series.rain_in[idx1], series.showers_in[idx1], series.snow_in[idx1]

    if wind0 is None or wind1 is None or rain1 is None or showers1 is None or snow1 is None:
        return WeatherSample(
            wind_mph=None,
            rain_in_per_hr=None,
            snow_in_per_hr=None,
            unknown=True,
            unknown_reason="provider_error",
        )

    frac = (t - h0).total_seconds() / 3600.0
    wind = wind0 + (wind1 - wind0) * frac
    rain_rate = rain1 + showers1
    snow_rate = snow1

    return WeatherSample(
        wind_mph=wind,
        rain_in_per_hr=rain_rate,
        snow_in_per_hr=snow_rate,
        wind_time_used=(h0, h1),
        precip_bucket_end=h1,
        unknown=False,
    )
