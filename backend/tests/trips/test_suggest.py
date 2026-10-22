from pathlib import Path

from rest_framework.test import APIClient

from providers.geocoding.fixture import FixtureGeocoding
from trips import service

FIXTURES = Path(__file__).parent.parent / "fixtures"


def test_suggest_returns_places(monkeypatch):
    monkeypatch.setattr(
        service, "get_geocoding_provider", lambda: FixtureGeocoding(str(FIXTURES / "tomtom_suggest_denver.json"))
    )
    client = APIClient()
    response = client.get("/api/places/suggest", {"q": "Denver"})
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) >= 1
    assert body["results"][0]["label"] == "Denver, CO"
    assert "lat" in body["results"][0] and "lng" in body["results"][0]


def test_suggest_q_too_short_returns_validation_error():
    client = APIClient()
    response = client.get("/api/places/suggest", {"q": "D"})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_suggest_missing_q_returns_validation_error():
    client = APIClient()
    response = client.get("/api/places/suggest")
    assert response.status_code == 400


def test_suggest_empty_results_is_valid_200(monkeypatch):
    class EmptyProvider:
        def suggest(self, q, *, limit):
            return []

    monkeypatch.setattr(service, "get_geocoding_provider", lambda: EmptyProvider())
    client = APIClient()
    response = client.get("/api/places/suggest", {"q": "zzzzzzz"})
    assert response.status_code == 200
    assert response.json()["results"] == []
