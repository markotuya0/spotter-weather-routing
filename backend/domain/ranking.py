"""Ranking within one eligibility tier — the PDF's exact four keys (docs/05 §9)."""
from __future__ import annotations

from dataclasses import replace
from decimal import ROUND_HALF_UP, Decimal
from typing import List, Sequence

from .models import RankedRoute

__all__ = ["rank"]


def _round_miles(value: float) -> Decimal:
    return Decimal(repr(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def _round_risk(value: float) -> Decimal:
    return Decimal(repr(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _sort_key(route: RankedRoute):
    # average_risk=None sorts last within the tier (docs/05 §9): a (has_value, value)
    # pair where "no value" (1, ...) always compares greater than "has value" (0, ...).
    if route.average_risk is None:
        risk_key = (1, Decimal(0))
    else:
        risk_key = (0, _round_risk(route.average_risk))
    return (
        _round_miles(route.severe_miles),
        _round_miles(route.high_miles),
        risk_key,
        int(route.duration_s),
        route.provider_index,
    )


def _reason_for_pair(winner: RankedRoute, runner_up: RankedRoute) -> str:
    """First key where winner and runner-up differ decides the stated reason
    (docs/05 §9). Falls through to the "same risk and time" text if all tie.
    """
    w_key = _sort_key(winner)
    r_key = _sort_key(runner_up)

    if w_key[0] != r_key[0]:
        return f"{w_key[0]} Severe miles vs {r_key[0]} on {runner_up.route_id}"
    if w_key[1] != r_key[1]:
        return f"{w_key[1]} High miles vs {r_key[1]} on {runner_up.route_id}"
    if w_key[2] != r_key[2]:
        w_risk = "no data" if winner.average_risk is None else w_key[2]
        r_risk = "no data" if runner_up.average_risk is None else r_key[2]
        return f"average risk {w_risk} vs {r_risk} on {runner_up.route_id}"
    if w_key[3] != r_key[3]:
        return f"duration {winner.duration_s:.0f}s vs {runner_up.duration_s:.0f}s on {runner_up.route_id}"
    return f"Same risk and time as {runner_up.route_id}"


def rank(routes: Sequence[RankedRoute]) -> List[RankedRoute]:
    """Sort ascending by (severe_miles, high_miles, average_risk, duration_s,
    provider_index) — the PDF's exact four keys plus a deterministic tie-break
    (docs/05 §9). `routes` must already belong to a single eligibility tier;
    this function never sees or infers tier membership.
    """
    if not routes:
        return []

    ordered = sorted(routes, key=_sort_key)
    result: List[RankedRoute] = []
    for i, route in enumerate(ordered):
        rank_num = i + 1
        if i == 0:
            reason = (
                _reason_for_pair(route, ordered[1])
                if len(ordered) > 1
                else ""
            )
        else:
            reason = _reason_for_pair(ordered[0], route)
        result.append(replace(route, rank=rank_num, reason=reason))
    return result
