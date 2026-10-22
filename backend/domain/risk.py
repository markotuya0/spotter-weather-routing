"""Risk thresholds, classification, load rules, checkpoint-level decision.

docs/05 §4.4-§7. Classification and load rules operate on raw, full-precision
values via Decimal(repr(raw_float)) comparisons — never on a rounded value,
and never via round()/float ==.
"""
from __future__ import annotations

from decimal import Decimal
from typing import List, Tuple

from .models import RISK_ORDER, CheckpointRisk, RiskLevel, UNKNOWN, WeatherSample

__all__ = [
    "classify_wind",
    "classify_rain",
    "classify_snow",
    "apply_load_rules",
    "checkpoint_risk",
    "format_display",
    "RISK_THRESHOLDS",
]

# docs/05 §5. Each tuple is (moderate, high, severe, no_travel) — the lower bound
# at which that level begins. Wind bounds are inclusive-lower ("tiling" ranges);
# rain/snow bounds read as inclusive-upper per docs/05 §5's ASSUMPTION A-02, which
# is equivalent here to "inclusive lower bound of the NEXT level is the upper
# bound value plus nothing" — see _classify() below for the exact comparison.
RISK_THRESHOLDS = {
    "wind": (Decimal("25"), Decimal("35"), Decimal("45"), Decimal("55")),
    "rain": (Decimal("0.10"), Decimal("0.25"), Decimal("0.50"), Decimal("1.00")),
    "snow": (Decimal("0.5"), Decimal("1.0"), Decimal("2.0"), Decimal("3.0")),
}

_LEVELS_ASCENDING = (
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)

# docs/05 §6: names for the two load-weight override rules, used in the API's
# risk.load_rule.rule field (docs/04 §4). Lives here, not in trips/service.py,
# so the rule names stay next to the rule logic they describe (M2 W-1).
_LOAD_RULE_NAMES = {
    RiskLevel.NO_TRAVEL: "wind_45_54_over_30000",
    RiskLevel.SEVERE: "wind_35_44_over_40000",
}


def _to_decimal(raw: float) -> Decimal:
    return Decimal(repr(raw))


def _classify(raw: float, kind: str) -> RiskLevel:
    """Evaluate from No Travel downward; first satisfied bound wins (docs/05 §5).

    Both wind ("≥ lower") and rain/snow ("inclusive upper bound", i.e.
    strictly-greater for the boundary it shares with the next band up except
    the Moderate entry point which the PDF states as "≥") reduce to the same
    comparison once you evaluate top-down: a value is in level L or above iff
    it is >= L's threshold, EXCEPT that for rain/snow the boundary value itself
    belongs to the band BELOW the next one up (e.g. rain 0.25 is High, not
    Moderate) — i.e. rain/snow use strictly-greater for the high/severe/no_travel
    thresholds and >= only for the moderate entry point (docs/05 §5, §11).
    """
    if raw != raw:  # NaN != NaN is the portable way to detect it without math.isnan
        raise ValueError(f"invalid {kind} value: {raw} (NaN)")
    if raw < 0:
        raise ValueError(f"invalid {kind} value: {raw} (negative)")
    value = _to_decimal(raw)
    moderate, high, severe, no_travel = RISK_THRESHOLDS[kind]

    if kind == "wind":
        if value >= no_travel:
            return RiskLevel.NO_TRAVEL
        if value >= severe:
            return RiskLevel.SEVERE
        if value >= high:
            return RiskLevel.HIGH
        if value >= moderate:
            return RiskLevel.MODERATE
        return RiskLevel.LOW

    # rain / snow: upper bounds inclusive to the band below (strictly-greater
    # to enter the next band up), moderate entry point is >=.
    if value > no_travel:
        return RiskLevel.NO_TRAVEL
    if value > severe:
        return RiskLevel.SEVERE
    if value > high:
        return RiskLevel.HIGH
    if value >= moderate:
        return RiskLevel.MODERATE
    return RiskLevel.LOW


def classify_wind(raw: float) -> RiskLevel:
    return _classify(raw, "wind")


def classify_rain(raw: float) -> RiskLevel:
    return _classify(raw, "rain")


def classify_snow(raw: float) -> RiskLevel:
    return _classify(raw, "snow")


def _level_index(level: RiskLevel) -> int:
    return RISK_ORDER.index(level)


def apply_load_rules(wind_level: RiskLevel, wind_raw: float, load_lb: float) -> Tuple[RiskLevel, bool]:
    """docs/05 §6. Returns (final_wind_level, override_applied).

    Weight comparisons are strict (`>`): exactly 30,000/40,000 lb never trigger.
    Overrides only raise the level, never lower it (max(base, override)).
    Evaluated on the raw wind value, so e.g. 44.996 mph stays in the 35-44 band.
    """
    if wind_raw != wind_raw:
        raise ValueError(f"invalid wind_raw value: {wind_raw} (NaN)")
    if load_lb != load_lb:
        raise ValueError(f"invalid load_lb value: {load_lb} (NaN)")
    if load_lb < 0:
        raise ValueError(f"invalid load_lb value: {load_lb} (negative)")
    value = _to_decimal(wind_raw)
    override_level = None

    if value >= Decimal("55"):
        override_level = RiskLevel.NO_TRAVEL  # already the base result; explicit per spec
    elif Decimal("45") <= value < Decimal("55") and load_lb > 30000:
        override_level = RiskLevel.NO_TRAVEL
    elif Decimal("35") <= value < Decimal("45") and load_lb > 40000:
        override_level = RiskLevel.SEVERE

    if override_level is None:
        return wind_level, False

    if _level_index(override_level) > _level_index(wind_level):
        return override_level, True
    return wind_level, False


def checkpoint_risk(sample: WeatherSample, load_lb: float) -> CheckpointRisk:
    """docs/05 §6-7. `level` is a RiskLevel, or the UNKNOWN sentinel.

    An unknown sample short-circuits: level is UNKNOWN, drivers is empty — the
    three conditions are never individually classified when any input is missing.

    This is the ONLY place the three conditions are classified and the
    max/drivers decision is made (M2 security closeout W-1) — aggregation,
    eligibility, ranking, and API display all read fields off the single
    CheckpointRisk this returns, rather than any of them re-deriving the
    same decision independently.
    """
    if sample.unknown:
        return CheckpointRisk(level=UNKNOWN, drivers=())

    wind_level = classify_wind(sample.wind_mph)
    rain_level = classify_rain(sample.rain_in_per_hr)
    snow_level = classify_snow(sample.snow_in_per_hr)

    final_wind_level, override_applied = apply_load_rules(wind_level, sample.wind_mph, load_lb)

    candidates: List[Tuple[RiskLevel, str, str]] = [
        (final_wind_level, "wind (load rule)" if override_applied else "wind", "wind"),
        (rain_level, "rain", "rain"),
        (snow_level, "snow", "snow"),
    ]
    max_level = max((level for level, _, _ in candidates), key=_level_index)
    drivers = tuple(name for level, name, _ in candidates if level == max_level)
    first_condition = next(cond for level, _, cond in candidates if level == max_level)
    raw_value = {"wind": sample.wind_mph, "rain": sample.rain_in_per_hr, "snow": sample.snow_in_per_hr}[first_condition]

    return CheckpointRisk(
        level=max_level,
        drivers=drivers,
        raw_value=raw_value,
        by_condition={"wind": wind_level, "rain": rain_level, "snow": snow_level},
        load_rule_applied=override_applied,
        load_rule_name=_LOAD_RULE_NAMES.get(final_wind_level) if override_applied else None,
        load_rule_from=wind_level if override_applied else None,
        load_rule_to=final_wind_level if override_applied else None,
    )


def format_display(raw: float, kind: str) -> str:
    """Display-only rounding (docs/05 §4.4). Never feeds back into classification.

    wind -> 0.1 mph, rain/snow -> handled by caller's precision; rain -> 0.01,
    snow -> 0.1. Half-up rounding via Decimal quantize.
    """
    from decimal import ROUND_HALF_UP

    precision = {"wind": "0.1", "rain": "0.01", "snow": "0.1"}[kind]
    value = _to_decimal(raw).quantize(Decimal(precision), rounding=ROUND_HALF_UP)
    return str(value)
