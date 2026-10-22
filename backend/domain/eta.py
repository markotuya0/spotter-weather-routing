"""ETA computation (docs/05 §4.1)."""
from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timedelta
from typing import Optional, Sequence, Tuple

__all__ = ["time_at", "eta_at_distance"]


def time_at(d: float, distance_mi: float, duration_s: float, knots: Optional[Sequence[Tuple[float, float]]] = None) -> float:
    """Seconds elapsed from departure to reach distance `d` along the route.

    Default profile: constant average speed, time_at(d) = T * d / D.
    If `knots` (cumulative (distance_mi, seconds) pairs) are supplied, time_at is
    piecewise-linear over them, with (0, 0) and (distance_mi, duration_s) enforced
    as the first/last knots regardless of what was passed in.
    """
    if distance_mi == 0:
        return 0.0
    if knots is None:
        return duration_s * d / distance_mi

    full_knots = list(knots)
    if not full_knots or full_knots[0] != (0.0, 0.0):
        full_knots = [(0.0, 0.0)] + full_knots
    if full_knots[-1] != (distance_mi, duration_s):
        full_knots = full_knots + [(distance_mi, duration_s)]

    distances = [k[0] for k in full_knots]
    if d <= distances[0]:
        return full_knots[0][1]
    if d >= distances[-1]:
        return full_knots[-1][1]

    i = bisect_right(distances, d) - 1
    i = max(0, min(i, len(full_knots) - 2))
    d0, t0 = full_knots[i]
    d1, t1 = full_knots[i + 1]
    # Mirrors domain.geo.point_at_distance: bisect_right skips past a run of
    # equal distances, so the selected knot pair (distances[0] < d < distances[-1],
    # checked above) can never itself be zero-length.
    frac = (d - d0) / (d1 - d0)
    return t0 + (t1 - t0) * frac


def eta_at_distance(
    departure: datetime,
    distance_mi: float,
    duration_s: float,
    d: float,
    knots: Optional[Sequence[Tuple[float, float]]] = None,
) -> datetime:
    """ETA(d) = departure + time_at(d). All times are UTC (docs/05 §4.1)."""
    elapsed = time_at(d, distance_mi, duration_s, knots)
    return departure + timedelta(seconds=elapsed)
