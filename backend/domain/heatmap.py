"""Heatmap builder: 0-48h risk grid per unique point (docs/05 §10)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict, List, Sequence, Tuple

from .models import RISK_SCORE, UNKNOWN
from .risk import checkpoint_risk
from .weather_match import ForecastSeries, sample_at

__all__ = ["HeatmapPoint", "build"]

UNKNOWN_CODE = 255
HEATMAP_HOURS = 49  # h = 0..48 inclusive


@dataclass(frozen=True)
class HeatmapPoint:
    point_id: str
    route_ids: Tuple[str, ...]
    scores: Tuple[int, ...]  # length 49; UNKNOWN_CODE (255) for unknown hours


def build(
    points: Sequence[Tuple[str, Tuple[str, ...]]],
    series_by_point: Dict[str, ForecastSeries],
    load_lb: float,
    departure: datetime,
    hours: int = HEATMAP_HOURS,
) -> List[HeatmapPoint]:
    """docs/05 §10. `points` is [(point_id, route_ids), ...] for each unique,
    deduplicated checkpoint location. `series_by_point` maps point_id to its
    forecast series. Uses the identical classification function as checkpoints
    (same raw-value rule, thresholds, load rules) so the two surfaces can never
    silently disagree (docs/05 §10).
    """
    results: List[HeatmapPoint] = []
    for point_id, route_ids in points:
        series = series_by_point[point_id]
        scores: List[int] = []
        for h in range(hours):
            t = departure + timedelta(hours=h)
            sample = sample_at(series, t)
            result = checkpoint_risk(sample, load_lb)
            scores.append(UNKNOWN_CODE if result.level == UNKNOWN else RISK_SCORE[result.level])
        results.append(HeatmapPoint(point_id=point_id, route_ids=route_ids, scores=tuple(scores)))
    return results
