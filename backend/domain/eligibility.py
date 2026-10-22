"""Eligibility/safety policy — separate from ranking (docs/05 §8)."""
from __future__ import annotations

from typing import Dict, List, Sequence

from .models import RiskLevel, UNKNOWN

__all__ = ["assess", "partition_by_eligibility"]

BLOCKED = "blocked"
INCOMPLETE = "incomplete"
ELIGIBLE = "eligible"


def assess(checkpoint_levels: Sequence) -> Dict:
    """docs/05 §8.1. `checkpoint_levels` is one RiskLevel/UNKNOWN per checkpoint
    on a single route. Checked in order: blocked beats incomplete.
    """
    if any(level == RiskLevel.NO_TRAVEL for level in checkpoint_levels):
        return {"status": BLOCKED, "reason": "no_travel_checkpoint"}
    if any(level == UNKNOWN for level in checkpoint_levels):
        return {"status": INCOMPLETE, "reason": "unknown_checkpoint"}
    return {"status": ELIGIBLE, "reason": None}


def partition_by_eligibility(routes: Sequence) -> Dict[str, List]:
    """docs/05 §8.2. `routes` is a sequence of (route, checkpoint_levels) pairs,
    or any object with a `.checkpoint_levels` attribute — this function only
    needs the status, so it accepts anything `assess()` can read.

    Pure grouping: order within each group is preserved from the input order.
    """
    groups: Dict[str, List] = {ELIGIBLE: [], INCOMPLETE: [], BLOCKED: []}
    for route, checkpoint_levels in routes:
        status = assess(checkpoint_levels)["status"]
        groups[status].append(route)
    return groups
