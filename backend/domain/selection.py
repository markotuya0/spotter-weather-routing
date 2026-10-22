"""Route selection: dedup, detour removal, greedy distinctness (docs/05 §2)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from .geo import cumulative_distances_mi, haversine_mi, point_at_distance, scale_to_distance
from .models import LatLng, Route

__all__ = ["overlap", "choose_three_distinct", "SelectionResult"]

DUPLICATE_OVERLAP = 0.95
DETOUR_FACTOR = 1.5
_DENSIFY_STEP_MI = 0.25
_SAMPLE_STEP_MI = 1.0
_MATCH_RADIUS_MI = 0.5

# Grid cell size for the hashed nearest-vertex test (docs/05 §2.2). Sized so a
# 3x3 neighbourhood around any query point's own cell is guaranteed to cover
# the full _MATCH_RADIUS_MI in both axes even at the US bounding box's
# northernmost latitude (72N, Alaska — a degree of longitude there is only
# ~21.4 mi, its tightest margin): 0.03 deg * cos(72deg) * 69.17 mi/deg =~ 0.64
# mi > 0.5 mi, with room to spare. This makes the grid filter exact (a point
# genuinely within the radius is never missed), not just a fast approximation.
_CELL_DEG = 0.03
_MI_PER_LAT_DEG = 69.17


@dataclass(frozen=True)
class SelectionResult:
    selected: Tuple[Route, ...]
    route_ids: Tuple[str, ...]
    warning: Optional[str]


def _densify(points: Sequence[LatLng], distance_mi: float, step_mi: float = _DENSIFY_STEP_MI) -> List[LatLng]:
    if len(points) < 2:
        return list(points)
    cum = scale_to_distance(cumulative_distances_mi(points), distance_mi)
    total = cum[-1]
    if total <= 0:
        return list(points)
    n_steps = max(1, int(total / step_mi))
    out = []
    for i in range(n_steps + 1):
        d = min(total, i * step_mi)
        out.append(point_at_distance(points, cum, d))
    return out


def _sample_every_mile(points: Sequence[LatLng], distance_mi: float, step_mi: float = _SAMPLE_STEP_MI) -> List[LatLng]:
    return _densify(points, distance_mi, step_mi)


def _cell_key(p: LatLng, cell_deg: float = _CELL_DEG) -> Tuple[int, int]:
    return (math.floor(p.lat / cell_deg), math.floor(p.lng / cell_deg))


def _build_grid_index(points: Sequence[LatLng], cell_deg: float = _CELL_DEG) -> Dict[Tuple[int, int], List[LatLng]]:
    index: Dict[Tuple[int, int], List[LatLng]] = {}
    for p in points:
        index.setdefault(_cell_key(p, cell_deg), []).append(p)
    return index


def overlap(x: Route, y: Route) -> float:
    """Fraction of x's length (sampled every mile) whose points lie within
    0.5 mi of y's polyline — grid-hashed nearest-vertex test on y densified to
    <= 0.25 mi (docs/05 §2.2). The grid is sized so a brute-force scan is
    never needed for correctness (see _CELL_DEG): on real provider geometry
    (hundreds of route-miles, thousands of raw points) a full O(samples *
    y_dense) scan took tens of seconds per call (measured in M2 integration,
    docs/09 §8); hashing y_dense into _CELL_DEG buckets and only scanning the
    3x3 neighbourhood around each sample point's own cell reduces this to
    ~O(samples) while returning the identical ratio.
    """
    x_samples = _sample_every_mile(x.points, x.distance_mi)
    y_dense = _densify(y.points, y.distance_mi)
    if not x_samples or not y_dense:
        return 0.0

    index = _build_grid_index(y_dense)
    matched = 0
    for p in x_samples:
        cx, cy = _cell_key(p)
        candidates: List[LatLng] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                candidates.extend(index.get((cx + dx, cy + dy), ()))
        if not candidates:
            continue
        nearest = min(haversine_mi(p, q) for q in candidates)
        if nearest <= _MATCH_RADIUS_MI:
            matched += 1
    return matched / len(x_samples)


def choose_three_distinct(routes: Sequence[Route]) -> SelectionResult:
    """docs/05 §2. Returns up to 3 distinct routes, ids assigned in provider
    order of the selected routes, plus a warning if fewer than 3 remain.
    """
    if not routes:
        return SelectionResult(selected=(), route_ids=(), warning="NO_ROUTE")

    provider_best = min(routes, key=lambda r: r.provider_index)
    ordered = sorted(routes, key=lambda r: r.provider_index)

    # Step 2 (docs/05 §2.2): drop duplicates in provider order — a candidate is
    # dropped if it duplicates an already-kept (earlier, by provider order) one.
    deduped: List[Route] = []
    for candidate in ordered:
        if any(overlap(candidate, k) >= DUPLICATE_OVERLAP for k in deduped):
            continue
        deduped.append(candidate)

    # Step 3 (docs/05 §2.3): drop detours, fastest/shortest measured across the
    # full original candidate pool.
    fastest = min(r.duration_s for r in routes)
    shortest = min(r.distance_mi for r in routes)

    def is_detour(r: Route) -> bool:
        return r.duration_s > DETOUR_FACTOR * fastest or r.distance_mi > DETOUR_FACTOR * shortest

    pool = [r for r in deduped if r is not provider_best and not is_detour(r)]

    # Step 4 (docs/05 §2.4): provider best is unconditionally kept as the seed.
    selected: List[Route] = [provider_best]
    remaining = list(pool)

    while len(selected) < 3 and remaining:
        def max_overlap_against_selected(r: Route) -> float:
            return max(overlap(r, s) for s in selected)

        remaining.sort(key=lambda r: (max_overlap_against_selected(r), r.duration_s, r.provider_index))
        best = remaining[0]
        selected.append(best)
        remaining = [r for r in remaining if r is not best]

    selected_in_provider_order = sorted(selected, key=lambda r: r.provider_index)
    route_ids = tuple(f"r{i + 1}" for i in range(len(selected_in_provider_order)))

    warning = None
    if len(selected_in_provider_order) < 3:
        warning = "ROUTES_FEWER_THAN_3"

    return SelectionResult(
        selected=tuple(selected_in_provider_order),
        route_ids=route_ids,
        warning=warning,
    )
