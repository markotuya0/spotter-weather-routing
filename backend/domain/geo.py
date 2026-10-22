"""Geometry primitives: haversine distance, cumulative distance, point-at-distance.

Pure math, no provider/network code (docs/03-architecture.md §4 rule 1).
"""
from __future__ import annotations

import math
from bisect import bisect_right
from typing import List, Sequence

from .models import LatLng

EARTH_RADIUS_MI = 3958.7613

__all__ = [
    "haversine_mi",
    "cumulative_distances_mi",
    "scale_to_distance",
    "point_at_distance",
    "points_between_distances",
    "rdp_simplify",
    "encode_polyline",
]


def haversine_mi(a: LatLng, b: LatLng) -> float:
    """Great-circle distance between two points, in miles."""
    lat1, lng1 = math.radians(a.lat), math.radians(a.lng)
    lat2, lng2 = math.radians(b.lat), math.radians(b.lng)
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    )
    h = min(1.0, max(0.0, h))
    return 2 * EARTH_RADIUS_MI * math.asin(math.sqrt(h))


def cumulative_distances_mi(points: Sequence[LatLng]) -> List[float]:
    """Cumulative haversine distance along `points`, starting at 0.0.

    Zero-length segments (duplicate consecutive vertices) contribute 0 and are
    not skipped from the list — they simply do not advance the cumulative sum
    (docs/05 §3.4 "zero-length segments are skipped" refers to interpolation,
    not list construction).
    """
    if not points:
        return []
    cum = [0.0]
    for prev, cur in zip(points, points[1:]):
        cum.append(cum[-1] + haversine_mi(prev, cur))
    return cum


def scale_to_distance(cum: Sequence[float], target_distance: float) -> List[float]:
    """Rescale a cumulative-distance list so its last value equals `target_distance`.

    docs/05 §3.1: all cumulative values are scaled by D / geometry_length so the
    last vertex sits exactly at D. If the geometry has zero length (single point,
    or all-duplicate points), every scaled value is 0.0.
    """
    if not cum:
        return []
    geometry_length = cum[-1]
    if geometry_length <= 0.0:
        return [0.0 for _ in cum]
    factor = target_distance / geometry_length
    return [c * factor for c in cum]


def point_at_distance(points: Sequence[LatLng], cum: Sequence[float], d: float) -> LatLng:
    """Position at scaled cumulative distance `d` along `points`/`cum`.

    `cum` must be non-decreasing and already scaled (see scale_to_distance).
    Binary-searches the containing segment, then linearly interpolates lat/lng
    (docs/05 §3.4). Zero-length segments are skipped by construction: bisect
    lands on the first vertex whose cumulative distance is >= d, and when that
    segment has zero length the interpolation fraction is simply 0 (endpoint).
    """
    if len(points) == 1:
        return points[0]
    if d <= cum[0]:
        return points[0]
    if d >= cum[-1]:
        return points[-1]

    i = bisect_right(cum, d) - 1
    i = max(0, min(i, len(points) - 2))
    seg_start, seg_end = cum[i], cum[i + 1]
    # bisect_right always skips past a run of equal cumulative values, so the
    # segment selected here (given cum[0] < d < cum[-1], checked above) can
    # never itself be zero-length: dividing by seg_len is always safe.
    frac = (d - seg_start) / (seg_end - seg_start)
    p0, p1 = points[i], points[i + 1]
    return LatLng(
        lat=p0.lat + (p1.lat - p0.lat) * frac,
        lng=p0.lng + (p1.lng - p0.lng) * frac,
    )


def points_between_distances(
    points: Sequence[LatLng], cum: Sequence[float], lo: float, hi: float
) -> List[LatLng]:
    """Boundary points at `lo`/`hi` plus every original vertex strictly between
    them, in route order.

    Used to build a sub-segment's polyline that follows the real route shape
    (rather than a straight chord from `lo` to `hi`) — e.g. a risk-colored
    overlay segment of the full route geometry.
    """
    if len(points) <= 1:
        return list(points)
    start = point_at_distance(points, cum, lo)
    end = point_at_distance(points, cum, hi)
    middle = [p for p, c in zip(points, cum) if lo < c < hi]
    return [start, *middle, end]


def _perpendicular_distance_mi(p: LatLng, a: LatLng, b: LatLng) -> float:
    """Approximate perpendicular distance from `p` to segment `a`-`b`, in miles.

    Uses an equirectangular projection local to `a` (valid at route-geometry
    scales, a few miles between vertices) rather than true great-circle
    cross-track distance — sufficient for a simplification tolerance test,
    not for authoritative distance (that remains haversine_mi throughout).
    """
    lat0 = math.radians(a.lat)
    scale = math.cos(lat0) * EARTH_RADIUS_MI
    ax, ay = 0.0, 0.0
    bx = (b.lng - a.lng) * math.radians(1.0) * scale
    by = (b.lat - a.lat) * math.radians(1.0) * EARTH_RADIUS_MI
    px = (p.lng - a.lng) * math.radians(1.0) * scale
    py = (p.lat - a.lat) * math.radians(1.0) * EARTH_RADIUS_MI

    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0.0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len_sq))
    proj_x, proj_y = ax + t * dx, ay + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def rdp_simplify(points: Sequence[LatLng], epsilon_mi: float) -> List[LatLng]:
    """Ramer-Douglas-Peucker simplification, tolerance in miles.

    Endpoints are always kept. A point is dropped only if every point between
    the current endpoints is within `epsilon_mi` of the straight line joining
    them (docs/03 §4/§5: ~50 m tolerance in production use).
    """
    n = len(points)
    if n < 3 or epsilon_mi <= 0:
        return list(points)

    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]

    while stack:
        start, end = stack.pop()
        if end - start < 2:
            continue
        a, b = points[start], points[end]
        max_dist = -1.0
        max_idx = -1
        for i in range(start + 1, end):
            dist = _perpendicular_distance_mi(points[i], a, b)
            if dist > max_dist:
                max_dist, max_idx = dist, i
        if max_dist > epsilon_mi:
            keep[max_idx] = True
            stack.append((start, max_idx))
            stack.append((max_idx, end))

    return [p for p, k in zip(points, keep) if k]


def encode_polyline(points: Sequence[LatLng], precision: int = 5) -> str:
    """Google encoded-polyline algorithm (default precision 5, i.e. 1e-5 deg)."""
    factor = 10 ** precision

    def _encode_value(value: int) -> str:
        value = value << 1
        if value < 0:
            value = ~value
        chunks = []
        while value >= 0x20:
            chunks.append((value & 0x1F) | 0x20)
            value >>= 5
        chunks.append(value)
        return "".join(chr(c + 63) for c in chunks)

    out = []
    prev_lat, prev_lng = 0, 0
    for p in points:
        lat = round(p.lat * factor)
        lng = round(p.lng * factor)
        out.append(_encode_value(lat - prev_lat))
        out.append(_encode_value(lng - prev_lng))
        prev_lat, prev_lng = lat, lng
    return "".join(out)
