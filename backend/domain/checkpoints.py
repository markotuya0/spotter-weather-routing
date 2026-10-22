"""Checkpoint generation along a route's geometry (docs/05 §3)."""
from __future__ import annotations

from typing import List, Sequence

from .geo import cumulative_distances_mi, point_at_distance, scale_to_distance
from .models import CheckpointPoint, LatLng

__all__ = ["generate"]

_EPSILON = 1e-9


def generate(points: Sequence[LatLng], distance_mi: float, interval_mi: float) -> List[CheckpointPoint]:
    """Generate checkpoints at `interval_mi` spacing plus the destination.

    docs/05 §3: index 0 is the origin, the last checkpoint is the destination;
    if `distance_mi` is an exact multiple of `interval_mi` the final regular
    checkpoint IS the destination (no duplicate appended).
    """
    if interval_mi <= 0:
        raise ValueError("interval_mi must be positive")
    if distance_mi < 0:
        raise ValueError("distance_mi must be non-negative")
    if not points:
        raise ValueError("points must be non-empty")

    raw_cum = cumulative_distances_mi(points)
    cum = scale_to_distance(raw_cum, distance_mi)

    distances: List[float] = []
    k = 0
    while k * interval_mi < distance_mi - _EPSILON:
        distances.append(k * interval_mi)
        k += 1
    # The loop invariant guarantees the last generated value (if any) is always
    # strictly less than distance_mi - _EPSILON, so the destination is never a
    # duplicate of it — appending it here is always required, never conditional.
    distances.append(distance_mi)

    checkpoints: List[CheckpointPoint] = []
    for idx, d in enumerate(distances):
        position = point_at_distance(points, cum, d)
        checkpoints.append(CheckpointPoint(index=idx, distance_mi=d, position=position))
    return checkpoints
