import json
from pathlib import Path

import pytest
import responses

from providers.geocoding.fixture import FixtureGeocoding
from providers.geocoding.tomtom import TomTomGeocoding
from providers.http import ProviderError

FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_fixture_geocoding_parses_real_recorded_response():
    provider = FixtureGeocoding(str(FIXTURES / "tomtom_suggest_denver.json"))
    results = provider.suggest("Denver", limit=5)
    assert len(results) >= 1
    assert results[0].label == "Denver, CO"
    assert results[0].lat == pytest.approx(39.738453)
    assert results[0].lng == pytest.approx(-104.984853)
    assert results[0].id.startswith("tt:")


def test_fixture_geocoding_respects_limit():
    provider = FixtureGeocoding(str(FIXTURES / "tomtom_suggest_denver.json"))
    results = provider.suggest("Denver", limit=1)
    assert len(results) == 1


@responses.activate
def test_live_shape_mocked_200():
    body = json.loads((FIXTURES / "tomtom_suggest_denver.json").read_text())
    responses.add(responses.GET, "https://api.tomtom.com/search/2/search/Denver.json", json=body, status=200)
    provider = TomTomGeocoding(api_key="fake-key")
    results = provider.suggest("Denver", limit=5)
    assert len(results) >= 1


@responses.activate
def test_live_mocked_empty_results_is_valid():
    responses.add(responses.GET, "https://api.tomtom.com/search/2/search/zzzzz.json", json={"results": []}, status=200)
    provider = TomTomGeocoding(api_key="fake-key")
    results = provider.suggest("zzzzz", limit=5)
    assert results == []


@responses.activate
def test_live_mocked_401_raises_routing_unavailable():
    responses.add(
        responses.GET,
        "https://api.tomtom.com/search/2/search/Denver.json",
        json={"detailedError": {"code": "Unauthorized"}},
        status=401,
    )
    provider = TomTomGeocoding(api_key="fake-key")
    with pytest.raises(ProviderError) as exc_info:
        provider.suggest("Denver", limit=5)
    assert exc_info.value.kind == "ROUTING_UNAVAILABLE"
