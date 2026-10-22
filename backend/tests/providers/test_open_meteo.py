import json
from datetime import date
from pathlib import Path

import pytest
import responses

from domain.models import LatLng
from providers.http import ProviderError
from providers.weather.fixture import FixtureWeather
from providers.weather.open_meteo import OpenMeteoWeather, _TokenBucket

FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_fixture_weather_parses_real_recorded_response():
    provider = FixtureWeather(str(FIXTURES / "open_meteo_denver_omaha.json"))
    points = [LatLng(39.74, -104.99), LatLng(40.80, -98.3), LatLng(41.26, -95.93)]
    result = provider.hourly(points, date(2026, 10, 22), date(2026, 10, 24))
    assert len(result) == 3
    series = result[0]
    assert len(series.times) > 0
    assert len(series.wind_mph) == len(series.times)
    assert all(v is None or v >= 0 for v in series.wind_mph)


@responses.activate
def test_live_shape_mocked_200_single_chunk():
    body = json.loads((FIXTURES / "open_meteo_denver_omaha.json").read_text())
    responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", json=body, status=200)
    provider = OpenMeteoWeather(limiter=_TokenBucket(100000))
    points = [LatLng(39.74, -104.99), LatLng(40.80, -98.3), LatLng(41.26, -95.93)]
    result = provider.hourly(points, date(2026, 10, 22), date(2026, 10, 24))
    assert len(result) == 3
    # request URL carries the mandatory unit/time-format params (docs/03 §2.2)
    req_url = responses.calls[0].request.url
    assert "wind_speed_unit=mph" in req_url
    assert "precipitation_unit=inch" in req_url
    assert "timeformat=unixtime" in req_url


@responses.activate
def test_live_mocked_location_count_mismatch_raises_weather_unavailable():
    responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", json=[{"hourly": {}}], status=200)
    provider = OpenMeteoWeather(limiter=_TokenBucket(100000))
    points = [LatLng(39.74, -104.99), LatLng(40.80, -98.3)]
    with pytest.raises(ProviderError) as exc_info:
        provider.hourly(points, date(2026, 10, 22), date(2026, 10, 24))
    assert exc_info.value.kind == "WEATHER_UNAVAILABLE"


@responses.activate
def test_live_mocked_chunking_splits_over_100_locations():
    body_single = {"hourly": {"time": [], "wind_speed_10m": [], "rain": [], "showers": [], "snowfall": []}}
    # 150 points -> 2 chunks of <=100
    responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", json=[body_single] * 100, status=200)
    responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", json=[body_single] * 50, status=200)
    provider = OpenMeteoWeather(limiter=_TokenBucket(100000))
    points = [LatLng(float(i), 0.0) for i in range(150)]
    result = provider.hourly(points, date(2026, 10, 22), date(2026, 10, 24))
    assert len(result) == 150
    assert len(responses.calls) == 2


@responses.activate
def test_live_mocked_partial_chunk_failure_returns_remaining_results():
    body_single = {"hourly": {"time": [], "wind_speed_10m": [], "rain": [], "showers": [], "snowfall": []}}
    responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", json=[body_single] * 100, status=200)
    for _ in range(3):
        responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", status=500)
    provider = OpenMeteoWeather(limiter=_TokenBucket(100000))
    points = [LatLng(float(i), 0.0) for i in range(150)]
    result = provider.hourly(points, date(2026, 10, 22), date(2026, 10, 24))
    # first chunk (100) succeeds; second chunk (50) fails after retries -> absent, not raised
    assert len(result) == 100


@responses.activate
def test_live_mocked_total_failure_raises_weather_unavailable():
    for _ in range(3):
        responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", status=500)
    provider = OpenMeteoWeather(limiter=_TokenBucket(100000))
    points = [LatLng(1.0, 1.0)]
    with pytest.raises(ProviderError) as exc_info:
        provider.hourly(points, date(2026, 10, 22), date(2026, 10, 24))
    assert exc_info.value.kind == "WEATHER_UNAVAILABLE"


def test_hourly_empty_points_returns_empty_dict():
    provider = OpenMeteoWeather(limiter=_TokenBucket(100000))
    assert provider.hourly([], date(2026, 10, 22), date(2026, 10, 24)) == {}


def test_token_bucket_blocks_when_exceeding_rate():
    import time
    bucket = _TokenBucket(rate_per_minute=600)  # 10/sec
    start = time.monotonic()
    bucket.consume(5)  # within capacity, no wait
    bucket.consume(600)  # exceeds remaining tokens, must wait
    elapsed = time.monotonic() - start
    assert elapsed > 0
