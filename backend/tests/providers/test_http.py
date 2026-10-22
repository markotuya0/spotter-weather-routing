import time

import pytest
import requests
import responses

from providers.http import (
    MAX_RETRY_AFTER_S,
    MAX_TOTAL_WAIT_BUDGET_S,
    ProviderError,
    _parse_retry_after,
    redact_url,
    request_with_retry,
)


def test_redact_url_strips_key_param():
    url = "https://api.tomtom.com/search?query=Denver&key=SUPERSECRET123&limit=5"
    redacted = redact_url(url)
    assert "SUPERSECRET123" not in redacted
    assert "key=REDACTED" in redacted
    assert "query=Denver" in redacted


def test_redact_url_strips_apikey_case_insensitive():
    url = "https://example.com?apiKey=abc123&x=1"
    assert "abc123" not in redact_url(url)


def test_redact_url_no_key_param_unchanged():
    url = "https://example.com?x=1&y=2"
    assert redact_url(url) == url


@responses.activate
def test_request_with_retry_success_first_try():
    responses.add(responses.GET, "https://example.com/ok", json={"ok": True}, status=200)
    result = request_with_retry("GET", "https://example.com/ok", provider_kind="test")
    assert result.status_code == 200
    assert result.json == {"ok": True}


@responses.activate
def test_request_with_retry_never_retries_4xx_other_than_429():
    responses.add(responses.GET, "https://example.com/bad", json={"err": "bad"}, status=400)
    result = request_with_retry("GET", "https://example.com/bad", provider_kind="test")
    assert result.status_code == 400
    assert len(responses.calls) == 1


@responses.activate
def test_request_with_retry_429_respects_retry_after_then_succeeds():
    responses.add(
        responses.GET, "https://example.com/limited", json={}, status=429, headers={"Retry-After": "0"}
    )
    responses.add(responses.GET, "https://example.com/limited", json={"ok": True}, status=200)
    result = request_with_retry("GET", "https://example.com/limited", provider_kind="test")
    assert result.status_code == 200
    assert len(responses.calls) == 2


@responses.activate
def test_request_with_retry_429_exhausted_raises_rate_limited():
    for _ in range(3):
        responses.add(responses.GET, "https://example.com/limited", json={}, status=429, headers={"Retry-After": "0"})
    with pytest.raises(ProviderError) as exc_info:
        request_with_retry("GET", "https://example.com/limited", provider_kind="test")
    assert exc_info.value.kind == "RATE_LIMITED"
    assert exc_info.value.retryable is True


@responses.activate
def test_request_with_retry_timeout_raises_upstream_timeout():
    responses.add(responses.GET, "https://example.com/slow", body=requests.exceptions.Timeout())
    with pytest.raises(ProviderError) as exc_info:
        request_with_retry("GET", "https://example.com/slow", provider_kind="test")
    assert exc_info.value.kind == "UPSTREAM_TIMEOUT"


@responses.activate
def test_request_with_retry_connection_error_raises_unavailable():
    responses.add(responses.GET, "https://example.com/down", body=requests.exceptions.ConnectionError())
    with pytest.raises(ProviderError) as exc_info:
        request_with_retry("GET", "https://example.com/down", provider_kind="test")
    assert exc_info.value.kind == "TEST_UNAVAILABLE"


@responses.activate
def test_request_with_retry_accepts_custom_read_timeout(monkeypatch):
    # docs/09 §8: routing gets a longer read timeout than the 8s default for
    # large multi-route long-haul responses; verify the override actually
    # reaches requests.Session.request's `timeout` argument.
    captured = {}
    import providers.http as http_mod

    original_request = http_mod.requests.Session.request

    def spy(self, *args, **kwargs):
        captured["timeout"] = kwargs.get("timeout")
        return original_request(self, *args, **kwargs)

    monkeypatch.setattr(http_mod.requests.Session, "request", spy)
    responses.add(responses.GET, "https://example.com/ok", json={"ok": True}, status=200)
    request_with_retry("GET", "https://example.com/ok", provider_kind="test", read_timeout_s=20)
    assert captured["timeout"] == (3, 20)


@responses.activate
def test_request_with_retry_non_json_body_returns_none_json():
    responses.add(responses.GET, "https://example.com/text", body="not json", status=200, content_type="text/plain")
    result = request_with_retry("GET", "https://example.com/text", provider_kind="test")
    assert result.status_code == 200
    assert result.json is None


# --- M2 security closeout C-1: Retry-After robustness ---------------------


def test_parse_retry_after_delta_seconds():
    assert _parse_retry_after("5") == 5.0


def test_parse_retry_after_http_date_future():
    from email.utils import format_datetime
    from datetime import datetime, timedelta, timezone

    future = datetime.now(timezone.utc) + timedelta(seconds=10)
    value = _parse_retry_after(format_datetime(future, usegmt=True))
    assert value is not None
    assert 0 <= value <= 11


def test_parse_retry_after_http_date_past_clamps_to_zero():
    from email.utils import format_datetime
    from datetime import datetime, timedelta, timezone

    past = datetime.now(timezone.utc) - timedelta(hours=1)
    assert _parse_retry_after(format_datetime(past, usegmt=True)) == 0.0


@pytest.mark.parametrize(
    "value",
    ["not-a-number", "", "   ", "Not, A, Valid, Date", "\x00", "NaN-ish garbage 123abc"],
)
def test_parse_retry_after_malformed_returns_none(value):
    assert _parse_retry_after(value) is None


def test_parse_retry_after_negative_clamps_to_zero():
    assert _parse_retry_after("-100") == 0.0


def test_parse_retry_after_nan_returns_none():
    assert _parse_retry_after("nan") is None


def test_parse_retry_after_infinite_returns_none():
    assert _parse_retry_after("inf") is None
    assert _parse_retry_after("-inf") is None


def test_parse_retry_after_excessively_large_clamps_to_max():
    assert _parse_retry_after("99999999999999999999999999") == MAX_RETRY_AFTER_S


def test_parse_retry_after_http_date_without_timezone_treated_as_utc():
    # RFC 7231 HTTP-dates always carry GMT, but a malformed upstream could
    # omit it; parsedate_to_datetime then returns a naive datetime, which
    # must not crash the subtraction against an aware "now".
    value = _parse_retry_after("Wed, 21 Oct 2099 07:28:00")
    assert value == MAX_RETRY_AFTER_S  # far-future date, clamped


@responses.activate
def test_request_with_retry_never_sleeps_past_total_wait_budget(monkeypatch):
    # A malicious upstream sends a huge-but-finite Retry-After on every
    # attempt; the total time we actually sleep across the whole call must
    # never exceed MAX_TOTAL_WAIT_BUDGET_S, and we must still end up raising
    # a controlled RATE_LIMITED rather than retrying forever.
    sleeps = []
    monkeypatch.setattr("providers.http.time.sleep", lambda s: sleeps.append(s))

    for _ in range(5):
        responses.add(
            responses.GET, "https://example.com/limited", json={}, status=429,
            headers={"Retry-After": "999999999"},
        )
    with pytest.raises(ProviderError) as exc_info:
        request_with_retry("GET", "https://example.com/limited", provider_kind="test", max_retries=4)

    assert exc_info.value.kind == "RATE_LIMITED"
    assert sum(sleeps) <= MAX_TOTAL_WAIT_BUDGET_S
    assert exc_info.value.retry_after_seconds == MAX_RETRY_AFTER_S


@responses.activate
def test_request_with_retry_rate_limited_error_carries_retry_after_seconds():
    responses.add(
        responses.GET, "https://example.com/limited", json={}, status=429, headers={"Retry-After": "3"}
    )
    with pytest.raises(ProviderError) as exc_info:
        request_with_retry("GET", "https://example.com/limited", provider_kind="test", max_retries=0)
    assert exc_info.value.retry_after_seconds == 3.0


# --- M2 security closeout C-2: credential redaction ------------------------


@responses.activate
def test_request_with_retry_connection_error_never_leaks_api_key(monkeypatch):
    secret = "SUPERSECRET123"
    monkeypatch.setattr("providers.http.time.sleep", lambda s: None)

    def raise_with_secret(*args, **kwargs):
        raise requests.exceptions.ConnectionError(
            f"HTTPSConnectionPool(host='api.tomtom.com', port=443): Max retries exceeded "
            f"with url: /routing/1/calculateRoute/1,2:3,4/json?key={secret}&travelMode=truck"
        )

    monkeypatch.setattr("providers.http.requests.Session.request", raise_with_secret)
    with pytest.raises(ProviderError) as exc_info:
        request_with_retry("GET", "https://api.tomtom.com/x", params={"key": secret}, provider_kind="routing", max_retries=0)

    assert secret not in str(exc_info.value)
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__suppress_context__ is True

    import traceback
    formatted = "".join(traceback.format_exception(type(exc_info.value), exc_info.value, exc_info.value.__traceback__))
    assert secret not in formatted
