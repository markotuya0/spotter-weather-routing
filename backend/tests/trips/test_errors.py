"""M2 security closeout W-3: retry_after_seconds must always reach the client
sanitized — finite and non-negative — regardless of what produced it (our own
retry budget via ProviderError, or DRF's own Throttled.wait).
"""
import pytest

from trips.errors import _sanitize_retry_after


@pytest.mark.parametrize("value", [None, "not-a-number", object(), float("nan"), float("inf"), float("-inf")])
def test_sanitize_retry_after_rejects_invalid_values(value):
    assert _sanitize_retry_after(value) is None


def test_sanitize_retry_after_clamps_negative_to_zero():
    assert _sanitize_retry_after(-5) == 0.0


def test_sanitize_retry_after_passes_through_sane_value():
    assert _sanitize_retry_after(3.5) == 3.5
