"""Diagnostic logging for provider calls: which provider/operation failed,
with what status, and how many attempts each logical call made. Logs must
never contain API keys, URLs/queries, or client identity."""
import logging

import responses

import providers.http as http
from providers.http import ProviderError, request_id_var, request_with_retry

import pytest


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(http.time, "sleep", lambda _s: None)


def _lines(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "providers.http"]


@responses.activate
def test_success_logs_provider_operation_status_and_request_id(caplog):
    caplog.set_level(logging.INFO, logger="providers.http")
    responses.add(responses.GET, "https://api.open-meteo.com/v1/forecast", json={}, status=200)
    token = request_id_var.set("req-123")
    try:
        request_with_retry("GET", "https://api.open-meteo.com/v1/forecast", provider_kind="weather", operation="forecast")
    finally:
        request_id_var.reset(token)
    (line,) = _lines(caplog)
    assert "request_id=req-123" in line
    assert "provider=api.open-meteo.com" in line
    assert "operation=forecast" in line
    assert "attempt=1/3" in line
    assert "status=200" in line
    assert "category=ok" in line
    assert "will_retry=false" in line


@responses.activate
def test_429_retries_are_each_logged_with_retry_after_and_reason(caplog):
    caplog.set_level(logging.INFO, logger="providers.http")
    responses.add(
        responses.GET, "https://api.open-meteo.com/v1/forecast",
        json={"error": True, "reason": "Minutely API request limit exceeded"},
        status=429, headers={"Retry-After": "3"},
    )
    with pytest.raises(ProviderError) as err:
        request_with_retry("GET", "https://api.open-meteo.com/v1/forecast", provider_kind="weather", operation="forecast")
    assert err.value.kind == "RATE_LIMITED"
    lines = _lines(caplog)
    # One logical call fans out to 3 upstream requests: retries multiply provider traffic.
    assert len(responses.calls) == 3
    assert len(lines) == 3
    assert "attempt=1/3" in lines[0] and "will_retry=true" in lines[0]
    assert "attempt=3/3" in lines[2] and "will_retry=false" in lines[2]
    for line in lines:
        assert "status=429" in line
        assert "retry_after=3" in line
        assert "category=rate_limited" in line
        assert "reason=Minutely API request limit exceeded" in line


@responses.activate
def test_logs_never_contain_api_key_or_query(caplog):
    caplog.set_level(logging.INFO, logger="providers.http")
    url = "https://api.tomtom.com/routing/1/calculateRoute/39.7392,-104.9903:41.2565,-95.9345/json"
    responses.add(responses.GET, url, json={"detailedError": {"code": "key=SECRET99"}}, status=403)
    request_with_retry(
        "GET", url, params={"key": "SECRET99", "departAt": "2026-10-24T09:00:00"},
        provider_kind="routing", operation="calculateRoute",
    )
    text = "\n".join(_lines(caplog))
    assert "SECRET99" not in text
    assert "39.7392" not in text
    assert "departAt" not in text
    assert "operation=calculateRoute" in text
    assert "category=client_error" in text


@responses.activate
def test_timeout_and_5xx_categories(caplog):
    caplog.set_level(logging.INFO, logger="providers.http")
    import requests as rq
    responses.add(responses.GET, "https://api.tomtom.com/a", body=rq.Timeout("slow"))
    responses.add(responses.GET, "https://api.tomtom.com/a", status=503)
    responses.add(responses.GET, "https://api.tomtom.com/a", json={}, status=200)
    request_with_retry("GET", "https://api.tomtom.com/a", provider_kind="routing", operation="calculateRoute")
    cats = [l.split("category=")[1].split()[0] for l in _lines(caplog)]
    assert cats == ["timeout", "upstream_5xx", "ok"]


def test_request_id_middleware_sets_and_resets_context_var():
    from django.test import Client

    seen = {}
    import trips.views as views

    orig = views.HealthView.get

    def spy(self, request):
        seen["rid"] = request_id_var.get()
        return orig(self, request)

    views.HealthView.get = spy
    try:
        response = Client().get("/api/health")
    finally:
        views.HealthView.get = orig
    assert seen["rid"] == response["X-Request-ID"]
    assert request_id_var.get() is None


def test_provider_error_is_logged_with_request_id_and_status(caplog):
    from rest_framework.test import APIClient

    caplog.set_level(logging.WARNING, logger="trips.errors")
    import trips.service as service

    class Boom:
        def routes(self, *a, **k):
            raise ProviderError("RATE_LIMITED", "x", retryable=True, upstream_status=429)

    orig = service.get_routing_provider
    service.get_routing_provider = lambda: Boom()
    try:
        from tests.trips.test_analyze import _valid_payload

        body = _valid_payload()
        response = APIClient().post("/api/trips/analyze", body, format="json")
    finally:
        service.get_routing_provider = orig
    msgs = [r.getMessage() for r in caplog.records if r.name == "trips.errors"]
    assert any(
        f"request_id={response['X-Request-ID']}" in m and "kind=RATE_LIMITED" in m and "upstream_status=429" in m
        for m in msgs
    ), (response.status_code, msgs)
