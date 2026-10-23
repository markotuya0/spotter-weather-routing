"""Open-Meteo via the Cloudflare Worker proxy: configurable base URL, shared
secret header, no retries on confirmed daily/hourly quota exhaustion, and
weather-provider failures surfaced as WEATHER_UNAVAILABLE (never RATE_LIMITED)."""
import logging
from datetime import date

import pytest
import responses

import providers.http as http
from domain.models import LatLng
from providers.http import ProviderError
from providers.weather.open_meteo import BASE_URL, OpenMeteoWeather, _TokenBucket

WORKER_URL = "https://spotter-open-meteo-proxy.example.workers.dev/v1/forecast"
POINTS = [LatLng(39.7, -105.0)]
DAILY = {"error": True, "reason": "Daily API request limit exceeded. Please try again tomorrow."}
HOURLY = {"error": True, "reason": "Hourly API request limit exceeded. Please try again in the next hour."}
MINUTELY = {"error": True, "reason": "Minutely API request limit exceeded. Please try again in one minute."}


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(http.time, "sleep", lambda _s: None)


def _provider(**kw):
    return OpenMeteoWeather(limiter=_TokenBucket(100000), **kw)


def _hourly(provider):
    return provider.hourly(POINTS, date(2026, 10, 24), date(2026, 10, 27))


OK_BODY = {"hourly": {"time": [1792800000], "wind_speed_10m": [10.0], "rain": [0.0], "showers": [0.0], "snowfall": [0.0]}}


@responses.activate
def test_default_base_url_is_open_meteo_and_sends_no_secret_header():
    responses.add(responses.GET, BASE_URL, json=OK_BODY, status=200)
    _hourly(_provider())
    assert BASE_URL == "https://api.open-meteo.com/v1/forecast"
    assert "X-Proxy-Secret" not in responses.calls[0].request.headers


@responses.activate
def test_custom_base_url_receives_the_request_with_secret_header():
    responses.add(responses.GET, WORKER_URL, json=OK_BODY, status=200)
    result = _hourly(_provider(base_url=WORKER_URL, proxy_secret="s3cret"))
    assert 0 in result
    request = responses.calls[0].request
    assert request.url.startswith(WORKER_URL)
    assert request.headers["X-Proxy-Secret"] == "s3cret"
    assert "wind_speed_unit=mph" in request.url  # same params as the direct call


@responses.activate
def test_proxy_secret_is_never_logged(caplog):
    caplog.set_level(logging.DEBUG)
    responses.add(responses.GET, WORKER_URL, json=OK_BODY, status=200)
    _hourly(_provider(base_url=WORKER_URL, proxy_secret="s3cret-do-not-log"))
    assert "s3cret-do-not-log" not in caplog.text
    assert "provider=spotter-open-meteo-proxy.example.workers.dev" in caplog.text


@pytest.mark.parametrize("body", [DAILY, HOURLY])
@responses.activate
def test_daily_and_hourly_quota_are_not_retried(body, caplog):
    caplog.set_level(logging.INFO, logger="providers.http")
    responses.add(responses.GET, WORKER_URL, json=body, status=429)
    with pytest.raises(ProviderError) as err:
        _hourly(_provider(base_url=WORKER_URL))
    assert len(responses.calls) == 1
    assert err.value.kind == "WEATHER_UNAVAILABLE"
    assert err.value.upstream_status == 429
    assert "category=quota_exhausted" in caplog.text and "will_retry=false" in caplog.text


@responses.activate
def test_minutely_limit_is_still_retried_with_backoff():
    responses.add(responses.GET, WORKER_URL, json=MINUTELY, status=429)
    responses.add(responses.GET, WORKER_URL, json=OK_BODY, status=200)
    assert 0 in _hourly(_provider(base_url=WORKER_URL))
    assert len(responses.calls) == 2


@responses.activate
def test_persistent_minutely_limit_exhausts_retries_then_maps_to_weather_unavailable():
    responses.add(responses.GET, WORKER_URL, json=MINUTELY, status=429)
    with pytest.raises(ProviderError) as err:
        _hourly(_provider(base_url=WORKER_URL))
    assert len(responses.calls) == 3
    assert err.value.kind == "WEATHER_UNAVAILABLE"


@responses.activate
def test_worker_auth_failure_is_weather_unavailable_not_a_client_error():
    responses.add(responses.GET, WORKER_URL, json={"error": True, "reason": "Unauthorized."}, status=401)
    with pytest.raises(ProviderError) as err:
        _hourly(_provider(base_url=WORKER_URL, proxy_secret="wrong"))
    assert err.value.kind == "WEATHER_UNAVAILABLE"
    assert len(responses.calls) == 1


def test_service_builds_weather_provider_from_settings(settings):
    import trips.service as service

    settings.OPEN_METEO_BASE_URL = WORKER_URL
    settings.OPEN_METEO_PROXY_SECRET = "abc"
    provider = service.get_weather_provider()
    assert provider._base_url == WORKER_URL
    assert provider._headers == {"X-Proxy-Secret": "abc"}


def test_settings_default_to_open_meteo_when_env_unset():
    from django.conf import settings

    assert settings.OPEN_METEO_BASE_URL == "https://api.open-meteo.com/v1/forecast"


@responses.activate
def test_analyze_returns_502_weather_unavailable_envelope_not_429(settings):
    from rest_framework.test import APIClient

    from tests.trips.test_analyze import _valid_payload
    import trips.service as service

    from tests.trips.test_analyze import FIXTURES
    from providers.routing.fixture import FixtureRouting

    routing = FixtureRouting(str(FIXTURES / "tomtom_route_denver_omaha.json"))
    settings.OPEN_METEO_BASE_URL = WORKER_URL
    responses.add(responses.GET, WORKER_URL, json=DAILY, status=429)
    orig = service.get_routing_provider
    service.get_routing_provider = lambda: routing
    try:
        response = APIClient().post("/api/trips/analyze", _valid_payload(), format="json")
    finally:
        service.get_routing_provider = orig
    assert response.status_code == 502, response.content
    assert response.json()["error"]["code"] == "WEATHER_UNAVAILABLE"
