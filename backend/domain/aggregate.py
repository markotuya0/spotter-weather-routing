"""Mile attribution and risk aggregation (docs/05 §7)."""
from __future__ import annotations

from typing import Dict, List, Sequence, Tuple

from .models import RISK_SCORE, RiskLevel, UNKNOWN

__all__ = ["checkpoint_coverage_bounds", "mile_attribution", "aggregate"]


def checkpoint_coverage_bounds(distances_mi: Sequence[float]) -> List[Tuple[float, float]]:
    """docs/05 §7: the (lo, hi) mile interval each checkpoint is attributed,
    via the midpoint-to-neighbours rule. `covers_miles` in the API (docs/04
    §4 Checkpoint) is this value directly, not re-derived from miles alone.
    """
    n = len(distances_mi)
    if n == 0:
        return []
    if n == 1:
        return [(0.0, 0.0)]

    total = distances_mi[-1]
    bounds: List[Tuple[float, float]] = []
    for i in range(n):
        lo = 0.0 if i == 0 else (distances_mi[i - 1] + distances_mi[i]) / 2.0
        hi = total if i == n - 1 else (distances_mi[i] + distances_mi[i + 1]) / 2.0
        bounds.append((lo, hi))
    return bounds


def mile_attribution(distances_mi: Sequence[float]) -> List[float]:
    """docs/05 §7: half-interval coverage per checkpoint. Σ miles_i == D."""
    return [hi - lo for lo, hi in checkpoint_coverage_bounds(distances_mi)]


def aggregate(distances_mi: Sequence[float], levels: Sequence) -> Dict:
    """docs/05 §7. `levels` are RiskLevel members or the UNKNOWN sentinel, one
    per checkpoint, same length/order as `distances_mi`.

    Returns {"miles_by_level": {level_or_unknown: miles}, "average_risk": float|None,
    "severe_miles": float, "high_miles": float, "no_travel_miles": float}.
    """
    miles = mile_attribution(distances_mi)
    miles_by_level: Dict = {level: 0.0 for level in RiskLevel}
    miles_by_level[UNKNOWN] = 0.0

    weighted_score_sum = 0.0
    known_miles_sum = 0.0

    for m, level in zip(miles, levels):
        miles_by_level[level] += m
        if level != UNKNOWN:
            weighted_score_sum += RISK_SCORE[level] * m
            known_miles_sum += m

    average_risk = weighted_score_sum / known_miles_sum if known_miles_sum > 0 else None

    return {
        "miles_by_level": miles_by_level,
        "average_risk": average_risk,
        "severe_miles": miles_by_level[RiskLevel.SEVERE],
        "high_miles": miles_by_level[RiskLevel.HIGH],
        "no_travel_miles": miles_by_level[RiskLevel.NO_TRAVEL],
    }
