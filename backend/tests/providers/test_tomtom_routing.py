import json
from pathlib import Path

import pytest
import responses

from domain.models import LatLng
from providers.http import ProviderError
from providers.routing.fixture import FixtureRouting
from providers.routing.tomtom import TomTomRouting

FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_fixture_routing_parses_real_recorded_response():
    provider = FixtureRouting(str(FIXTURES / "tomtom_route_denver_omaha.json"))
    routes = provider.routes(
        LatLng(39.7392, -104.9903), LatLng(41.2565, -95.9345), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z"
    )
    assert len(routes) == 4
    assert routes[0].distance_mi == pytest.approx(870993 / 1609.344, rel=1e-6)
    assert routes[0].duration_s > 0
    assert len(routes[0].points) > 2
    assert all(isinstance(p, LatLng) for p in routes[0].points)


def test_fixture_routing_no_drivable_route_raises_no_route():
    provider = FixtureRouting(str(FIXTURES / "tomtom_route_no_route.json"), http_status=400)
    with pytest.raises(ProviderError) as exc_info:
        provider.routes(LatLng(40, -40), LatLng(41, -41), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z")
    assert exc_info.value.kind == "NO_ROUTE"
    assert exc_info.value.retryable is False


@responses.activate
def test_live_shape_mocked_200_with_routes():
    body = json.loads((FIXTURES / "tomtom_route_denver_omaha.json").read_text())
    responses.add(
        responses.GET,
        "https://api.tomtom.com/routing/1/calculateRoute/39.7392,-104.9903:41.2565,-95.9345/json",
        json=body,
        status=200,
    )
    provider = TomTomRouting(api_key="fake-key-for-test")
    routes = provider.routes(
        LatLng(39.7392, -104.9903), LatLng(41.2565, -95.9345), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z"
    )
    assert len(routes) == 4
    # key never appears in the request URL log representation
    assert "fake-key-for-test" not in repr(provider)


@responses.activate
def test_live_mocked_401_unauthorized_raises_not_retryable():
    responses.add(
        responses.GET,
        "https://api.tomtom.com/routing/1/calculateRoute/39.7392,-104.9903:41.2565,-95.9345/json",
        json={"detailedError": {"code": "Unauthorized", "message": "bad key"}},
        status=401,
    )
    provider = TomTomRouting(api_key="fake-key")
    with pytest.raises(ProviderError) as exc_info:
        provider.routes(
            LatLng(39.7392, -104.9903), LatLng(41.2565, -95.9345), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z"
        )
    assert exc_info.value.kind == "ROUTING_UNAVAILABLE"
    assert exc_info.value.retryable is False
    assert exc_info.value.upstream_status == 401


@responses.activate
def test_live_mocked_400_map_matching_failure_raises_no_route():
    responses.add(
        responses.GET,
        "https://api.tomtom.com/routing/1/calculateRoute/40,-40:41,-41/json",
        json={"detailedError": {"code": "MAP_MATCHING_FAILURE", "message": "Engine error"}},
        status=400,
    )
    provider = TomTomRouting(api_key="fake-key")
    with pytest.raises(ProviderError) as exc_info:
        provider.routes(LatLng(40, -40), LatLng(41, -41), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z")
    assert exc_info.value.kind == "NO_ROUTE"


@responses.activate
def test_live_mocked_400_bad_input_raises_routing_unavailable():
    responses.add(
        responses.GET,
        "https://api.tomtom.com/routing/1/calculateRoute/999,999:41.2565,-95.9345/json",
        json={"detailedError": {"code": "BAD_INPUT", "message": "Invalid coordinate"}},
        status=400,
    )
    provider = TomTomRouting(api_key="fake-key")
    with pytest.raises(ProviderError) as exc_info:
        provider.routes(LatLng(999, 999), LatLng(41.2565, -95.9345), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z")
    assert exc_info.value.kind == "ROUTING_UNAVAILABLE"


@responses.activate
def test_live_mocked_500_retries_then_raises_after_max_retries():
    url = "https://api.tomtom.com/routing/1/calculateRoute/39.7392,-104.9903:41.2565,-95.9345/json"
    responses.add(responses.GET, url, json={"detailedError": {"code": "SERVER_ERROR"}}, status=500)
    responses.add(responses.GET, url, json={"detailedError": {"code": "SERVER_ERROR"}}, status=500)
    responses.add(responses.GET, url, json={"detailedError": {"code": "SERVER_ERROR"}}, status=500)
    provider = TomTomRouting(api_key="fake-key")
    with pytest.raises(ProviderError) as exc_info:
        provider.routes(
            LatLng(39.7392, -104.9903), LatLng(41.2565, -95.9345), max_alternatives=5, departure_iso="2026-10-22T14:00:00Z"
        )
    assert exc_info.value.kind == "ROUTING_UNAVAILABLE"
    assert exc_info.value.retryable is True
    assert len(responses.calls) == 3  # 1 initial + 2 retries (docs/04 §5.3)
