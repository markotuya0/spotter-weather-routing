"""Plain-data types shared across backend/domain/.

No Django, no network, no provider imports (see docs/03-architecture.md §4 rule 1).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class RiskLevel(Enum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    SEVERE = "severe"
    NO_TRAVEL = "no_travel"


# Total order low < moderate < high < severe < no_travel (docs/05 §5-7).
# UNKNOWN is deliberately not a RiskLevel member: it short-circuits classification
# rather than participating in max()/scoring (docs/05 §4.3, §7).
RISK_ORDER = [
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
]

RISK_SCORE = {
    RiskLevel.LOW: 0,
    RiskLevel.MODERATE: 1,
    RiskLevel.HIGH: 2,
    RiskLevel.SEVERE: 3,
    RiskLevel.NO_TRAVEL: 4,
}

UNKNOWN = "unknown"


@dataclass(frozen=True)
class LatLng:
    lat: float
    lng: float


@dataclass(frozen=True)
class CheckpointPoint:
    """A checkpoint's geometric/distance identity, before weather is attached."""

    index: int
    distance_mi: float
    position: LatLng


@dataclass(frozen=True)
class WeatherSample:
    """Result of weather_match.sample_at() — raw, full-precision values only.

    `unknown=True` means one or more inputs were missing/out-of-series (docs/05 §4.3);
    in that case wind/rain/snow carry no meaning and must not be read.
    """

    wind_mph: Optional[float]
    rain_in_per_hr: Optional[float]
    snow_in_per_hr: Optional[float]
    wind_time_used: Optional[tuple] = None
    precip_bucket_end: Optional[datetime] = None
    unknown: bool = False
    unknown_reason: Optional[str] = None


@dataclass(frozen=True)
class CheckpointRisk:
    """Result of risk.checkpoint_risk(): the decided level plus its drivers.

    The optional fields below are the full classification breakdown (raw
    driving value, each condition's base level, load-rule detail) needed for
    API display (docs/04 §4) — populated by the same single classification
    pass that decides `level`/`drivers`, so aggregation/eligibility/ranking
    and API display can never see a different answer than each other (M2
    security closeout W-1: single source of truth for risk). They are None
    only for an unknown sample, where no condition was classified at all.
    """

    level: object  # RiskLevel, or the string UNKNOWN
    drivers: tuple = field(default_factory=tuple)
    raw_value: Optional[float] = None
    by_condition: Optional[dict] = None  # {"wind": RiskLevel, "rain": RiskLevel, "snow": RiskLevel} — base levels, pre-load-override
    load_rule_applied: bool = False
    load_rule_name: Optional[str] = None
    load_rule_from: object = None  # base wind RiskLevel, only set when load_rule_applied
    load_rule_to: object = None  # overridden wind RiskLevel, only set when load_rule_applied


@dataclass(frozen=True)
class Route:
    """A single candidate route as domain functions see it.

    `points` is full/simplified geometry (lat/lng only); `distance_mi` and
    `duration_s` are provider-authoritative (docs/05 §2.7). `provider_index` is
    the route's position in the provider's own response, used as the final
    ranking tie-break (docs/05 §9).
    """

    provider_index: int
    points: tuple
    distance_mi: float
    duration_s: float


@dataclass(frozen=True)
class RankedRoute:
    route_id: str
    provider_index: int
    severe_miles: float
    high_miles: float
    average_risk: Optional[float]
    duration_s: float
    rank: int = 0
    reason: str = ""
