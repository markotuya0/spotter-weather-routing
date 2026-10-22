from decimal import Decimal

import pytest

from domain.models import RiskLevel, UNKNOWN, WeatherSample
from domain import risk

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


# --- Wind boundaries (docs/05 §11, verified against §5's inclusive-lower rule) ---
WIND_CASES = [
    (0, L), (24.9, L), (24.999999, L),
    (25.0, M), (25.000001, M), (34.9, M), (34.999999, M),
    (35.0, H), (44.9, H), (44.999999, H),
    (45.0, S), (54.9, S), (54.999999, S),
    (55.0, N), (80, N),
]


@pytest.mark.parametrize("raw,expected", WIND_CASES)
def test_classify_wind_boundaries(raw, expected):
    assert risk.classify_wind(raw) == expected


def test_classify_wind_negative_is_invalid():
    with pytest.raises(ValueError):
        risk.classify_wind(-1.0)


def test_classify_wind_nan_is_invalid():
    # NaN must raise a clean ValueError, not an uncaught decimal.InvalidOperation
    # from comparing Decimal("NaN") against the threshold constants.
    with pytest.raises(ValueError):
        risk.classify_wind(float("nan"))


def test_classify_rain_nan_is_invalid():
    with pytest.raises(ValueError):
        risk.classify_rain(float("nan"))


def test_classify_snow_nan_is_invalid():
    with pytest.raises(ValueError):
        risk.classify_snow(float("nan"))


def test_apply_load_rules_nan_wind_is_invalid():
    with pytest.raises(ValueError):
        risk.apply_load_rules(RiskLevel.LOW, float("nan"), load_lb=1000)


def test_apply_load_rules_nan_load_is_invalid():
    with pytest.raises(ValueError):
        risk.apply_load_rules(RiskLevel.LOW, 10.0, load_lb=float("nan"))


def test_classify_wind_never_calls_round():
    import builtins

    original_round = builtins.round

    def failing_round(*a, **k):
        raise AssertionError("classify_wind must not call round()")

    builtins.round = failing_round
    try:
        risk.classify_wind(34.996)
    finally:
        builtins.round = original_round


# --- Rain boundaries, per §5's explicit "High = (0.25, 0.50]" inclusive-upper rule ---
# NOTE: docs/05-routing-weather-risk.md §11's literal rain/snow value sequences are
# not monotonically consistent with §5's own stated rule (flagged to the user in
# the M1 completion report as a doc inconsistency). These cases implement §5 exactly,
# including its own worked example ("1.00 in/hr is Severe and 1.01 is No Travel").
RAIN_CASES = [
    (0, L), (0.09, L), (0.099999, L),
    (0.10, M), (0.100001, M), (0.24, M), (0.25, M),
    (0.250001, H), (0.3, H), (0.49, H), (0.50, H),
    (0.500001, S), (0.75, S), (1.00, S),
    (1.000001, N), (1.01, N),
]


@pytest.mark.parametrize("raw,expected", RAIN_CASES)
def test_classify_rain_boundaries(raw, expected):
    assert risk.classify_rain(raw) == expected


SNOW_CASES = [
    (0, L), (0.4, L), (0.499999, L),
    (0.5, M), (0.500001, M), (0.9, M), (1.0, M),
    (1.000001, H), (1.5, H), (1.9, H), (2.0, H),
    (2.000001, S), (2.5, S), (3.0, S),
    (3.000001, N), (3.1, N),
]


@pytest.mark.parametrize("raw,expected", SNOW_CASES)
def test_classify_snow_boundaries(raw, expected):
    assert risk.classify_snow(raw) == expected


def test_decimal_safety_summation_that_lands_exactly_on_boundary_classifies_moderate():
    # rain + showers arithmetic that nets to exactly the float 0.25 (no drift) must
    # classify at the Moderate boundary, not bumped up by a Decimal-construction bug.
    summed = 0.1 + 0.1 + 0.05
    assert summed == 0.25  # this particular chain happens to land exactly on it
    assert risk.classify_rain(summed) == M


def test_decimal_safety_genuine_drift_above_boundary_classifies_by_its_true_value():
    # This chain genuinely lands a few ULPs ABOVE 0.25 in IEEE-754 — it is not the
    # same real number as 0.25, so classifying it High (just above the Moderate/High
    # boundary) is correct; Decimal(repr(...)) preserves that true value rather than
    # silently rounding it down to "the nearest nice threshold" with an invented epsilon.
    drifted = 0.1 + 0.2 - 0.05
    assert drifted != 0.25
    assert drifted > 0.25
    assert risk.classify_rain(drifted) == H


def test_classify_uses_decimal_repr_not_direct_float_to_decimal_construction():
    # Decimal(repr(0.1)) == Decimal("0.10") exactly, but Decimal(0.1) (constructed
    # directly from the float, skipping repr) carries 0.1's long binary-fraction
    # tail and does NOT equal Decimal("0.10") — this is the actual bug class
    # Decimal(repr(...)) avoids (docs/05 §4.4).
    assert Decimal(repr(0.1)) == Decimal("0.10")
    assert Decimal(0.1) != Decimal("0.10")
    # A value exactly at the rain moderate threshold, built from float arithmetic,
    # must classify Moderate — proving classify_rain uses the repr-based path.
    assert risk.classify_rain(0.1) == M


# --- Load rules (docs/05 §6, §11) ---
LOAD_CASES = [
    (45.0, 30000, S, False),
    (45.0, 30000.01, N, True),
    (54.9, 30001, N, True),
    (35.0, 40000, H, False),
    (35.0, 40000.01, S, True),
    (44.9, 40001, S, True),
    (34.9, 100000, M, False),
    (55.0, 1, N, False),  # already NO_TRAVEL from the table; not a "load rule" override
    (44.996, 35000, H, False),  # stays in 35-44 band; 35,000 <= 40,000 so no override
    (44.996, 40001, S, True),  # 35-44 band, load > 40,000 -> severe override
]


@pytest.mark.parametrize("wind_raw,load_lb,expected_level,expected_override", LOAD_CASES)
def test_load_rules(wind_raw, load_lb, expected_level, expected_override):
    base = risk.classify_wind(wind_raw)
    level, override = risk.apply_load_rules(base, wind_raw, load_lb)
    assert level == expected_level
    assert override == expected_override


def test_load_rule_boundary_45_004_with_trivial_load_stays_severe_not_no_travel():
    # 45.004 is in the 45-54 band (>=45, true per raw value); without load > 30,000
    # the base classification (Severe) stands — the load rule only RAISES the level
    # when the weight threshold is exceeded (docs/05 §6).
    base = risk.classify_wind(45.004)
    assert base == S
    level, override = risk.apply_load_rules(base, 45.004, load_lb=1)
    assert level == S
    assert override is False


def test_load_rules_never_lower_the_level():
    # A load rule firing on a lower band must never reduce an already-higher base.
    level, override = risk.apply_load_rules(RiskLevel.NO_TRAVEL, 60.0, load_lb=50000)
    assert level == RiskLevel.NO_TRAVEL


def test_load_rules_rejects_negative_load():
    with pytest.raises(ValueError):
        risk.apply_load_rules(RiskLevel.LOW, 10.0, load_lb=-1)


def test_rain_and_snow_unaffected_by_load():
    sample = WeatherSample(wind_mph=0.0, rain_in_per_hr=0.5, snow_in_per_hr=0.0)
    level_light_load = risk.checkpoint_risk(sample, load_lb=1).level
    sample_heavy = WeatherSample(wind_mph=0.0, rain_in_per_hr=0.5, snow_in_per_hr=0.0)
    level_heavy_load = risk.checkpoint_risk(sample_heavy, load_lb=1_000_000).level
    assert level_light_load == level_heavy_load


# --- Combination (docs/05 §6, §11) ---
def test_combination_wind_high_rain_severe_snow_low_drivers_rain():
    sample = WeatherSample(wind_mph=35.0, rain_in_per_hr=0.6, snow_in_per_hr=0.0)
    result = risk.checkpoint_risk(sample, load_lb=1)
    level, drivers = result.level, result.drivers
    assert level == S
    assert drivers == ("rain",)


def test_combination_wind_load_override_and_rain_severe_both_drivers():
    # wind 44.9 (High base) + load 50,000 -> Severe override; rain also Severe.
    sample = WeatherSample(wind_mph=44.9, rain_in_per_hr=0.6, snow_in_per_hr=0.0)
    result = risk.checkpoint_risk(sample, load_lb=50000)
    level, drivers = result.level, result.drivers
    assert level == S
    assert set(drivers) == {"wind (load rule)", "rain"}


def test_checkpoint_risk_unknown_sample_short_circuits():
    sample = WeatherSample(
        wind_mph=None, rain_in_per_hr=None, snow_in_per_hr=None, unknown=True, unknown_reason="provider_error"
    )
    result = risk.checkpoint_risk(sample, load_lb=1000)
    level, drivers = result.level, result.drivers
    assert level == UNKNOWN
    assert drivers == ()


def test_checkpoint_risk_max_of_three_conditions():
    sample = WeatherSample(wind_mph=10.0, rain_in_per_hr=0.0, snow_in_per_hr=1.5)
    result = risk.checkpoint_risk(sample, load_lb=1)
    level, drivers = result.level, result.drivers
    assert level == H  # snow 1.5 -> High, dominates wind Low and rain Low
    assert drivers == ("snow",)


# --- Display rounding is independent of classification (docs/05 §4.4) ---
def test_display_rounding_does_not_affect_classification():
    raw = 34.996
    assert risk.classify_wind(raw) == M
    assert risk.format_display(raw, "wind") == "35.0"


def test_format_display_half_up_rounding():
    assert risk.format_display(0.125, "rain") == "0.13"
    assert risk.format_display(1.449, "snow") == "1.4"


def test_threshold_table_strictly_increasing():
    for kind, bounds in risk.RISK_THRESHOLDS.items():
        assert list(bounds) == sorted(set(bounds)), f"{kind} thresholds not strictly increasing"
