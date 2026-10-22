from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from providers.routing.fixture import FixtureRouting
from providers.weather.fixture import FixtureWeather
from trips import service

FIXTURES = Path(__file__).parent.parent / "fixtures"


@pytest.fixture(autouse=True)
def clear_provider_cache():
    # The weather/route cache (docs/03 §6) is process-wide (LocMemCache); each
    # test must start cold so one test's successful fetch can't silently mask
    # a sibling test's simulated provider failure via a cache hit.
    cache.clear()
    yield
    cache.clear()


def _valid_payload(**overrides):
    departure = datetime.now(timezone.utc) + timedelta(hours=2)
    payload = {
        "origin": {"label": "Denver, CO", "lat": 39.7392, "lng": -104.9903},
        "destination": {"label": "Omaha, NE", "lat": 41.2565, "lng": -95.9345},
        "departure_time": departure.isoformat(),
        "load_weight_lb": 38000,
        "checkpoint_interval_miles": 25,
    }
    payload.update(overrides)
    return payload


@pytest.fixture
def fixture_providers(monkeypatch):
    routing = FixtureRouting(str(FIXTURES / "tomtom_route_denver_omaha.json"))
    weather = FixtureWeather(str(FIXTURES / "open_meteo_denver_omaha.json"))
    monkeypatch.setattr(service, "get_routing_provider", lambda: routing)
    monkeypatch.setattr(service, "get_weather_provider", lambda: weather)
    return routing, weather


def test_analyze_full_request_response_flow(fixture_providers):
    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(), format="json")
    assert response.status_code == 200
    body = response.json()

    assert "request_id" in body
    assert "X-Request-ID" in response.headers
    assert response.headers["Cache-Control"] == "no-store"

    assert len(body["routes"]) >= 1
    assert len(body["routes"]) <= 3
    for route in body["routes"]:
        assert route["id"].startswith("r")
        assert route["eligibility"]["status"] in ("eligible", "incomplete", "blocked")
        assert route["summary"]["distance_miles"] > 0
        assert route["geometry"]["encoding"] == "polyline5"
        assert len(route["geometry"]["points"]) > 0
        for cp in route["checkpoints"]:
            assert cp["risk"]["level"] in ("low", "moderate", "high", "severe", "no_travel", "unknown")
            if cp["weather_sample_id"] is not None:
                assert cp["weather_sample_id"] in body["weather_samples"]

    # ranks are a permutation of 1..N
    ranks = sorted(r["rank"] for r in body["routes"])
    assert ranks == list(range(1, len(body["routes"]) + 1))

    # exactly one recommended route, matching recommendation.route_id
    recommended = [r for r in body["routes"] if r["recommended"]]
    assert len(recommended) == 1
    assert recommended[0]["id"] == body["recommendation"]["route_id"]
    assert body["recommendation"]["fallback_level"] in ("none", "incomplete_data", "no_safe_route")

    assert body["heatmap"]["hours"] == 49
    for hp in body["heatmap"]["points"]:
        assert len(hp["risk"]) == 49

    # weather_samples dedup invariant (docs/04 §4): every entry is referenced
    referenced_ids = {
        cp["weather_sample_id"]
        for route in body["routes"]
        for cp in route["checkpoints"]
        if cp["weather_sample_id"] is not None
    }
    assert referenced_ids == set(body["weather_samples"].keys())

    assert body["weather"]["provider"] == "open-meteo"
    assert body["weather"]["attribution"] == "Weather data by Open-Meteo.com (CC BY 4.0)"
    assert body["meta"]["routing_provider"] == "tomtom"
    assert "duration_ms" in body["meta"]


def test_analyze_idempotent_ranking_keys_same_input(fixture_providers):
    client = APIClient()
    payload = _valid_payload()
    r1 = client.post("/api/trips/analyze", payload, format="json").json()
    r2 = client.post("/api/trips/analyze", payload, format="json").json()
    keys1 = {r["id"]: r["ranking_keys"] for r in r1["routes"]}
    keys2 = {r["id"]: r["ranking_keys"] for r in r2["routes"]}
    assert keys1 == keys2


def test_analyze_unknown_field_rejected(fixture_providers):
    client = APIClient()
    payload = _valid_payload(extra_field="not allowed")
    response = client.post("/api/trips/analyze", payload, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "extra_field" in response.json()["error"]["details"]


def test_analyze_origin_too_close_to_destination_rejected(fixture_providers):
    client = APIClient()
    payload = _valid_payload(destination={"label": "Near Denver", "lat": 39.7395, "lng": -104.9905})
    response = client.post("/api/trips/analyze", payload, format="json")
    assert response.status_code == 400


def test_analyze_naive_departure_time_rejected(fixture_providers):
    client = APIClient()
    payload = _valid_payload(departure_time=(datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S"))
    response = client.post("/api/trips/analyze", payload, format="json")
    assert response.status_code == 400


def test_analyze_load_weight_out_of_range_rejected(fixture_providers):
    client = APIClient()
    payload = _valid_payload(load_weight_lb=200000)
    response = client.post("/api/trips/analyze", payload, format="json")
    assert response.status_code == 400
    assert "load_weight_lb" in response.json()["error"]["details"]


def test_analyze_bad_checkpoint_interval_rejected(fixture_providers):
    client = APIClient()
    payload = _valid_payload(checkpoint_interval_miles=15)
    response = client.post("/api/trips/analyze", payload, format="json")
    assert response.status_code == 400


def test_analyze_outside_us_bounding_box_rejected(fixture_providers):
    client = APIClient()
    payload = _valid_payload(origin={"label": "Paris", "lat": 48.8566, "lng": 2.3522})
    response = client.post("/api/trips/analyze", payload, format="json")
    assert response.status_code == 400


def test_analyze_routing_provider_no_route_returns_422(monkeypatch):
    from providers.http import ProviderError

    class FailingRouting:
        def routes(self, *a, **kw):
            raise ProviderError("NO_ROUTE", "no route", retryable=False)

    monkeypatch.setattr(service, "get_routing_provider", lambda: FailingRouting())
    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(), format="json")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "NO_ROUTE"


def test_analyze_weather_total_failure_returns_502(monkeypatch):
    from providers.http import ProviderError

    routing = FixtureRouting(str(FIXTURES / "tomtom_route_denver_omaha.json"))

    class FailingWeather:
        def hourly(self, *a, **kw):
            raise ProviderError("WEATHER_UNAVAILABLE", "down", retryable=True)

    monkeypatch.setattr(service, "get_routing_provider", lambda: routing)
    monkeypatch.setattr(service, "get_weather_provider", lambda: FailingWeather())
    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(), format="json")
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "WEATHER_UNAVAILABLE"
    assert response.json()["error"]["retryable"] is True


def test_analyze_weather_partial_failure_marks_checkpoints_unknown(monkeypatch):
    routing = FixtureRouting(str(FIXTURES / "tomtom_route_denver_omaha.json"))

    class PartialWeather:
        def hourly(self, points, start, end):
            # only the first point's weather resolves; rest are "missing"
            from providers.weather.fixture import FixtureWeather
            real = FixtureWeather(str(FIXTURES / "open_meteo_denver_omaha.json"))
            full = real.hourly(points, start, end)
            return {0: full[0]} if full else {}

    monkeypatch.setattr(service, "get_routing_provider", lambda: routing)
    monkeypatch.setattr(service, "get_weather_provider", lambda: PartialWeather())
    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(), format="json")
    assert response.status_code == 200
    body = response.json()
    codes = {w["code"] for w in body["warnings"]}
    assert "WEATHER_PARTIAL" in codes
    unknown_checkpoints = [
        cp for route in body["routes"] for cp in route["checkpoints"] if cp["risk"]["level"] == "unknown"
    ]
    assert len(unknown_checkpoints) > 0
    for cp in unknown_checkpoints:
        assert cp["weather_sample_id"] is None


def test_analyze_displayed_risk_consistent_with_ranking_risk(monkeypatch, fixture_providers):
    """M2 security closeout W-1 regression: the checkpoint risk level/drivers
    shown to the client must come from the exact same CheckpointRisk used to
    aggregate severe_miles/max_level for ranking — not a second, independently
    computed classification. Forcing every checkpoint's classification to a
    single known result and asserting both the display and the aggregated
    ranking numbers agree with it proves there is only one source of truth.
    """
    from domain.models import CheckpointRisk, RiskLevel

    forced = CheckpointRisk(
        level=RiskLevel.SEVERE,
        drivers=("wind (load rule)",),
        raw_value=38.2,
        by_condition={"wind": RiskLevel.HIGH, "rain": RiskLevel.LOW, "snow": RiskLevel.LOW},
        load_rule_applied=True,
        load_rule_name="wind_35_44_over_40000",
        load_rule_from=RiskLevel.HIGH,
        load_rule_to=RiskLevel.SEVERE,
    )
    monkeypatch.setattr(service.risk, "checkpoint_risk", lambda sample, load_lb: forced)

    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(), format="json")
    assert response.status_code == 200
    body = response.json()

    for route in body["routes"]:
        assert route["summary"]["max_level"] == "severe"
        assert route["ranking_keys"]["severe_miles"] == pytest.approx(route["summary"]["distance_miles"], abs=0.2)
        for cp in route["checkpoints"]:
            assert cp["risk"]["level"] == "severe"
            assert cp["risk"]["drivers"] == ["wind (load rule)"]
            assert cp["risk"]["raw_value"] == 38.2
            assert cp["risk"]["by_condition"] == {"wind": "high", "rain": "low", "snow": "low"}
            assert cp["risk"]["load_rule"] == {
                "applied": True, "rule": "wind_35_44_over_40000", "from": "high", "to": "severe",
            }


def test_analyze_rate_limited_provider_error_returns_retry_after_seconds(monkeypatch):
    """M2 security closeout W-3: an upstream 429 (surfaced as a RATE_LIMITED
    ProviderError) must carry a sane retry_after_seconds through to the
    client error envelope.
    """
    from providers.http import ProviderError

    class RateLimitedRouting:
        def routes(self, *a, **kw):
            raise ProviderError("RATE_LIMITED", "rate limited", retryable=True, upstream_status=429, retry_after_seconds=7.0)

    monkeypatch.setattr(service, "get_routing_provider", lambda: RateLimitedRouting())
    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(), format="json")
    assert response.status_code == 429
    body = response.json()
    assert body["error"]["code"] == "RATE_LIMITED"
    assert body["error"]["retry_after_seconds"] == 7.0


def test_analyze_application_throttling_returns_retry_after_seconds(monkeypatch):
    """M2 security closeout W-3: DRF's own application-level throttle (not an
    upstream provider) must map to the same RATE_LIMITED envelope shape with a
    finite, non-negative retry_after_seconds — not fall through to a generic
    VALIDATION_ERROR.
    """
    from trips.views import AnalyzeThrottle

    # SimpleRateThrottle.THROTTLE_RATES is bound from api_settings at class
    # definition time, so overriding Django's REST_FRAMEWORK setting at
    # runtime has no effect on it; the throttle class attribute itself must
    # be patched directly.
    monkeypatch.setattr(AnalyzeThrottle, "THROTTLE_RATES", {"analyze": "1/min"})
    from django.core.cache import cache as throttle_cache
    throttle_cache.clear()

    # DRF's throttle check runs before serializer validation, so an invalid
    # payload is enough to exercise the throttle counter without touching
    # any real/fixture provider.
    client = APIClient()
    first = client.post("/api/trips/analyze", {}, format="json")
    assert first.status_code in (400, 429)
    second = client.post("/api/trips/analyze", {}, format="json")
    assert second.status_code == 429
    body = second.json()
    assert body["error"]["code"] == "RATE_LIMITED"
    assert isinstance(body["error"]["retry_after_seconds"], (int, float))
    assert body["error"]["retry_after_seconds"] >= 0


def test_analyze_too_many_checkpoints_returns_422_with_min_interval(monkeypatch, settings):
    routing = FixtureRouting(str(FIXTURES / "tomtom_route_denver_omaha.json"))
    weather = FixtureWeather(str(FIXTURES / "open_meteo_denver_omaha.json"))
    monkeypatch.setattr(service, "get_routing_provider", lambda: routing)
    monkeypatch.setattr(service, "get_weather_provider", lambda: weather)
    settings.ENGINE_SETTINGS = {**settings.ENGINE_SETTINGS, "WEATHER_MAX_UNIQUE_POINTS": 5}
    client = APIClient()
    response = client.post("/api/trips/analyze", _valid_payload(checkpoint_interval_miles=10), format="json")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "TOO_MANY_CHECKPOINTS"
    assert "min_interval_miles" in response.json()["error"]["details"]
