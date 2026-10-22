"""M2 security closeout W-2: DRF throttling must not blindly trust an
arbitrary client-supplied X-Forwarded-For header as the rate-limit identity,
or any client could spoof a distinct IP per request and bypass per-client
throttling entirely. NUM_PROXIES=1 (config/settings.py, docs/09-decisions.md
ASSUMPTION) makes DRF key off the LAST X-Forwarded-For entry — the one
appended by Render's single trusted edge proxy — and ignore anything a
client prepends before it.
"""
from django.test import RequestFactory

from trips.views import AnalyzeThrottle


def _throttle_request(**meta):
    rf = RequestFactory()
    django_request = rf.post("/api/trips/analyze", **meta)
    return django_request


def test_num_proxies_configured_not_none(settings):
    assert settings.REST_FRAMEWORK.get("NUM_PROXIES") == 1


def test_throttle_ident_uses_last_xff_entry_ignoring_spoofed_prefix(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    throttle = AnalyzeThrottle()
    request = _throttle_request(
        REMOTE_ADDR="10.0.0.1",
        HTTP_X_FORWARDED_FOR="9.9.9.9, 203.0.113.5",
    )
    # 203.0.113.5 is the entry Render's own trusted proxy appended; 9.9.9.9 is
    # whatever the client put in front of it and must be ignored.
    ident = throttle.get_ident(request)
    assert ident == "203.0.113.5"


def test_throttle_ident_two_clients_spoofing_same_prefix_are_not_merged(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    throttle = AnalyzeThrottle()
    request_a = _throttle_request(REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="1.2.3.4, 203.0.113.5")
    request_b = _throttle_request(REMOTE_ADDR="10.0.0.1", HTTP_X_FORWARDED_FOR="5.6.7.8, 203.0.113.9")
    # Both attackers prepend arbitrary spoofed first hops, but the real
    # (trusted-proxy-appended) client IPs differ, so they must not collide
    # into the same throttle bucket.
    assert throttle.get_ident(request_a) != throttle.get_ident(request_b)


def test_throttle_ident_falls_back_to_remote_addr_without_xff(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
    throttle = AnalyzeThrottle()
    request = _throttle_request(REMOTE_ADDR="198.51.100.7")
    assert throttle.get_ident(request) == "198.51.100.7"
