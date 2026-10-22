"""Orchestration: routes -> select -> checkpoints -> weather -> risk -> rank ->
heatmap (docs/03 §4 rule 3, §5). The only place that wires provider output
into domain functions; views contain no logic beyond this call (docs/03 §4
rule 4). Risk calculations are reused from domain/, never duplicated here.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

import requests
from django.conf import settings
from django.core.cache import cache

from domain import aggregate, checkpoints, eligibility, eta as eta_mod, heatmap as heatmap_mod, ranking, risk, selection
from domain.geo import (
    cumulative_distances_mi,
    encode_polyline,
    points_between_distances,
    rdp_simplify,
    scale_to_distance,
)
from domain.models import LatLng, RankedRoute, RiskLevel, Route, UNKNOWN, WeatherSample
from domain.weather_match import ForecastSeries, sample_at

from providers.geocoding.base import GeocodingProvider
from providers.geocoding.tomtom import TomTomGeocoding
from providers.http import ProviderError
from providers.routing.base import ProviderRoute, RoutingProvider
from providers.routing.tomtom import TomTomRouting
from providers.weather.base import WeatherProvider
from providers.weather.open_meteo import OpenMeteoWeather

from .errors import DomainApiError

_WEATHER_GRID = 0.05
_RISK_LEVEL_BY_VALUE = {level.value: level for level in RiskLevel}


# --- Provider wiring (docs/03 §2.4: provider selection by env var) ---

_session = requests.Session()


def get_routing_provider() -> RoutingProvider:
    if settings.ROUTING_PROVIDER == "tomtom":
        return TomTomRouting(settings.TOMTOM_API_KEY, session=_session)
    raise DomainApiError(
        "INTERNAL_ERROR", f"Unknown ROUTING_PROVIDER: {settings.ROUTING_PROVIDER}", http_status=500
    )


def get_weather_provider() -> WeatherProvider:
    return OpenMeteoWeather(session=_session)


def get_geocoding_provider() -> GeocodingProvider:
    return TomTomGeocoding(settings.TOMTOM_API_KEY, session=_session)


# --- Small pure helpers (presentation glue over already-computed domain results) ---


def _snap(p: LatLng, grid: float = _WEATHER_GRID) -> LatLng:
    return LatLng(lat=round(p.lat / grid) * grid, lng=round(p.lng / grid) * grid)


def _snap_key(p: LatLng) -> str:
    snapped = _snap(p)
    return f"{snapped.lat:.2f},{snapped.lng:.2f}"


def _weather_sample_id(p: LatLng, h1: datetime) -> str:
    snapped = _snap(p)
    return f"ws_{snapped.lat:.2f}_{snapped.lng:.2f}_{h1.strftime('%Y-%m-%dT%H')}"


def _cache_key(prefix: str, *parts: str) -> str:
    return f"spotter:{prefix}:" + ":".join(parts)


def _fetch_weather_series(
    weather: WeatherProvider, unique_points: List[LatLng], start: date, end: date
) -> Tuple[Dict[str, ForecastSeries], int]:
    """Caches ForecastSeries by (snapped point, date range) — docs/03 §6.
    Only cache misses are sent to the provider, in one batched call. Returns
    (series_by_key, cache_hit_count) for the response's `meta.cache_hits`.
    """
    ttl = settings.PROVIDER_CACHE_TTL_S["weather"]
    by_key: Dict[str, ForecastSeries] = {}
    misses: List[Tuple[str, LatLng]] = []
    cache_hits = 0

    for p in unique_points:
        key = _snap_key(p)
        cache_key = _cache_key("weather", key, start.isoformat(), end.isoformat())
        cached = cache.get(cache_key)
        if cached is not None:
            by_key[key] = cached
            cache_hits += 1
        else:
            misses.append((key, p))

    if misses:
        miss_points = [p for _, p in misses]
        fetched = weather.hourly(miss_points, start, end)
        for i, (key, _) in enumerate(misses):
            series = fetched.get(i)
            if series is not None:
                by_key[key] = series
                cache_key = _cache_key("weather", key, start.isoformat(), end.isoformat())
                cache.set(cache_key, series, ttl)

    return by_key, cache_hits


def _checkpoint_risk_detail(cp_risk, unknown_reason: Optional[str]) -> Dict[str, Any]:
    """Builds the API's full `risk` object for one checkpoint purely by
    reading fields off the single CheckpointRisk that risk.checkpoint_risk()
    already computed — no independent classification pass here (docs/04 §4,
    M2 security closeout W-1: single source of truth for risk).
    """
    if cp_risk.level == UNKNOWN:
        return {"level": "unknown", "reason": unknown_reason, "raw_value": None,
                "by_condition": None, "load_rule": {"applied": False, "rule": None}, "drivers": []}

    load_rule: Dict[str, Any] = {"applied": cp_risk.load_rule_applied, "rule": None}
    if cp_risk.load_rule_applied:
        load_rule["rule"] = cp_risk.load_rule_name
        load_rule["from"] = cp_risk.load_rule_from.value
        load_rule["to"] = cp_risk.load_rule_to.value

    return {
        "level": cp_risk.level.value,
        "reason": None,
        "raw_value": cp_risk.raw_value,
        # by_condition.wind is always the BASE (pre-load-override) classification,
        # matching load_rule.from — docs/04 §4's worked example shows a checkpoint
        # with load_rule.applied=true where by_condition.wind ("high") differs from
        # the final level ("severe"); the override is visible via load_rule, not here.
        "by_condition": {k: v.value for k, v in cp_risk.by_condition.items()},
        "load_rule": load_rule,
        "drivers": list(cp_risk.drivers),
    }


def _min_feasible_interval(routes: List[Route], requested_interval: int) -> Optional[int]:
    intervals = sorted(settings.TRIP_LIMITS["CHECKPOINT_INTERVALS_MI"])
    budget = settings.ENGINE_SETTINGS["WEATHER_MAX_UNIQUE_POINTS"]
    for interval in intervals:
        if interval < requested_interval:
            continue
        unique_keys = set()
        for route in routes:
            cps = checkpoints.generate(route.points, route.distance_mi, interval)
            for cp in cps:
                unique_keys.add(_snap_key(cp.position))
        if len(unique_keys) <= budget:
            return interval
    return None


def analyze(
    data: Dict[str, Any],
    *,
    routing: Optional[RoutingProvider] = None,
    weather: Optional[WeatherProvider] = None,
) -> Dict[str, Any]:
    routing = routing or get_routing_provider()
    weather = weather or get_weather_provider()

    origin = LatLng(data["origin"]["lat"], data["origin"]["lng"])
    destination = LatLng(data["destination"]["lat"], data["destination"]["lng"])
    departure: datetime = data["departure_time"]
    load_lb: float = data["load_weight_lb"]
    interval_mi: int = int(data["checkpoint_interval_miles"])

    max_alt = settings.ENGINE_SETTINGS["MAX_ALTERNATIVES"]
    provider_routes: List[ProviderRoute] = routing.routes(
        origin, destination, max_alternatives=max_alt, departure_iso=departure.isoformat()
    )

    domain_routes = [
        Route(provider_index=pr.provider_index, points=pr.points, distance_mi=pr.distance_mi, duration_s=pr.duration_s)
        for pr in provider_routes
    ]
    names_by_index = {pr.provider_index: (pr.name, pr.via) for pr in provider_routes}

    sel = selection.choose_three_distinct(domain_routes)
    if not sel.selected:
        raise DomainApiError("NO_ROUTE", "No drivable route was found.", http_status=422)

    warnings: List[Dict[str, str]] = [{"code": "ETA_ESTIMATED", "message": "ETAs assume continuous driving."}]
    if sel.warning == "ROUTES_FEWER_THAN_3":
        warnings.append({
            "code": "ROUTES_FEWER_THAN_3",
            "message": f"Only {len(sel.selected)} distinct route(s) are available for this trip.",
        })

    # --- budget check before fetching any weather (docs/03 §6) ---
    budget = settings.ENGINE_SETTINGS["WEATHER_MAX_UNIQUE_POINTS"]
    all_unique_keys = set()
    checkpoints_by_route: Dict[str, List] = {}
    for route_id, route in zip(sel.route_ids, sel.selected):
        cps = checkpoints.generate(route.points, route.distance_mi, interval_mi)
        checkpoints_by_route[route_id] = cps
        for cp in cps:
            all_unique_keys.add(_snap_key(cp.position))

    if len(all_unique_keys) > budget:
        feasible = _min_feasible_interval(list(sel.selected), interval_mi)
        raise DomainApiError(
            "TOO_MANY_CHECKPOINTS",
            "This trip needs a coarser checkpoint spacing.",
            http_status=422,
            details={"min_interval_miles": feasible if feasible is not None else max(settings.TRIP_LIMITS["CHECKPOINT_INTERVALS_MI"])},
        )

    # --- ETAs, per route ---
    etas_by_route: Dict[str, List[datetime]] = {}
    for route_id, route in zip(sel.route_ids, sel.selected):
        cps = checkpoints_by_route[route_id]
        etas_by_route[route_id] = [
            eta_mod.eta_at_distance(departure, route.distance_mi, route.duration_s, cp.distance_mi) for cp in cps
        ]

    last_eta = max(
        (e for etas in etas_by_route.values() for e in etas), default=departure
    )

    # --- fetch weather once per unique snapped location (docs/05 §10) ---
    unique_points_by_key: Dict[str, LatLng] = {}
    for route_id, route in zip(sel.route_ids, sel.selected):
        for cp in checkpoints_by_route[route_id]:
            unique_points_by_key.setdefault(_snap_key(cp.position), cp.position)

    start_date = departure.date()
    end_date = (max(departure + timedelta(hours=48), last_eta) + timedelta(hours=1)).date()

    series_by_key, cache_hits = _fetch_weather_series(weather, list(unique_points_by_key.values()), start_date, end_date)

    weather_partial = len(series_by_key) < len(unique_points_by_key)
    if weather_partial:
        warnings.append({"code": "WEATHER_PARTIAL", "message": "Some checkpoints are missing weather data."})

    # --- per-checkpoint risk, eligibility inputs, weather_samples dedup ---
    weather_samples: Dict[str, Dict[str, Any]] = {}
    routes_payload: List[Dict[str, Any]] = []
    ranked_inputs: Dict[str, RankedRoute] = {}
    checkpoint_levels_by_route: Dict[str, List] = {}

    for route_id, route in zip(sel.route_ids, sel.selected):
        cps = checkpoints_by_route[route_id]
        etas = etas_by_route[route_id]
        checkpoint_payloads = []
        levels = []
        distances = [cp.distance_mi for cp in cps]
        bounds = aggregate.checkpoint_coverage_bounds(distances)

        for cp, cp_eta, (lo, hi) in zip(cps, etas, bounds):
            key = _snap_key(cp.position)
            series = series_by_key.get(key)
            if series is None:
                sample = _unknown_sample("provider_error")
            else:
                sample = sample_at(series, cp_eta)

            cp_risk = risk.checkpoint_risk(sample, load_lb)
            levels.append(cp_risk.level)

            if sample.unknown or cp_risk.level == UNKNOWN:
                weather_sample_id = None
            else:
                weather_sample_id = _weather_sample_id(cp.position, sample.precip_bucket_end)
                if weather_sample_id not in weather_samples:
                    weather_samples[weather_sample_id] = {
                        "wind_mph": float(risk.format_display(sample.wind_mph, "wind")),
                        "rain_in_per_hr": float(risk.format_display(sample.rain_in_per_hr, "rain")),
                        "snow_in_per_hr": float(risk.format_display(sample.snow_in_per_hr, "snow")),
                        "wind_time_used": [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in sample.wind_time_used],
                        "precip_bucket_end": sample.precip_bucket_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    }

            risk_detail = _checkpoint_risk_detail(cp_risk, sample.unknown_reason)
            checkpoint_payloads.append({
                "index": cp.index,
                "distance_miles": round(cp.distance_mi, 1),
                "lat": cp.position.lat,
                "lng": cp.position.lng,
                "eta": cp_eta.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "weather_sample_id": weather_sample_id,
                "risk": {
                    "level": risk_detail["level"],
                    "raw_value": risk_detail["raw_value"],
                    "by_condition": risk_detail["by_condition"],
                    "load_rule": risk_detail["load_rule"],
                    "drivers": risk_detail["drivers"],
                    "covers_miles": {"from": round(lo, 1), "to": round(hi, 1)},
                    **({"reason": risk_detail["reason"]} if risk_detail["level"] == "unknown" else {}),
                },
            })

        checkpoint_levels_by_route[route_id] = levels
        agg = aggregate.aggregate(distances, levels)
        elig = eligibility.assess(levels)

        ranked_inputs[route_id] = RankedRoute(
            route_id=route_id,
            provider_index=route.provider_index,
            severe_miles=agg["severe_miles"],
            high_miles=agg["high_miles"],
            average_risk=agg["average_risk"] if agg["average_risk"] is not None else None,
            duration_s=route.duration_s,
        )

        name, via = names_by_index.get(route.provider_index, (None, None))
        simplified = _simplify_for_wire(route.points, route.distance_mi)
        routes_payload.append({
            "id": route_id,
            "name": name or f"Route {route_id[1:]}",
            "via": via,
            "geometry": _geometry_payload(simplified),
            "eligibility": {"status": elig["status"], "reason": elig["reason"]},
            "summary": {
                "distance_miles": round(route.distance_mi, 1),
                "duration_seconds": int(route.duration_s),
                "departure_time": departure.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "arrival_time": (departure + timedelta(seconds=route.duration_s)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "max_level": _max_level_str(levels),
                "average_risk": round(agg["average_risk"], 2) if agg["average_risk"] is not None else None,
                "miles_by_level": _miles_by_level_payload(agg["miles_by_level"]),
                "blocked": elig["status"] == "blocked",
                "complete": elig["status"] == "eligible",
            },
            "ranking_keys": {
                "no_travel_miles": round(agg["no_travel_miles"], 1),
                "severe_miles": round(agg["severe_miles"], 1),
                "high_miles": round(agg["high_miles"], 1),
                "average_risk": round(agg["average_risk"], 2) if agg["average_risk"] is not None else None,
                "duration_seconds": int(route.duration_s),
            },
            "risk_segments": _risk_segments(cps, levels, route.points, route.distance_mi),
            "checkpoints": checkpoint_payloads,
        })

    # --- eligibility partition + ranking (docs/05 §8-9: separate steps) ---
    partition = eligibility.partition_by_eligibility(
        [(route_id, checkpoint_levels_by_route[route_id]) for route_id in sel.route_ids]
    )
    fallback_level = "none"
    recommended_group = "eligible"
    if partition["eligible"]:
        recommended_group = "eligible"
    elif partition["incomplete"]:
        recommended_group = "incomplete"
        fallback_level = "incomplete_data"
        warnings.append({"code": "INCOMPLETE_DATA_FALLBACK", "message": "No route has complete weather data; showing the best available with partial data."})
    else:
        recommended_group = "blocked"
        fallback_level = "no_safe_route"
        warnings.append({"code": "ALL_ROUTES_BLOCKED", "message": "No safe route for this departure time and load."})

    full_ranking: List[str] = []
    rank_counter = 0
    recommendation_route_id = None
    recommendation_reasons: List[Dict[str, Any]] = []
    for group_name in ("eligible", "incomplete", "blocked"):
        group_route_ids = partition[group_name]
        group_ranked = ranking.rank([ranked_inputs[rid] for rid in group_route_ids])
        for ranked in group_ranked:
            rank_counter += 1
            route_payload = next(r for r in routes_payload if r["id"] == ranked.route_id)
            route_payload["rank"] = rank_counter
            route_payload["recommended"] = False
            full_ranking.append(ranked.route_id)
            if group_name == recommended_group and ranked.rank == 1:
                recommendation_route_id = ranked.route_id
                route_payload["recommended"] = True
                if fallback_level == "none" and ranked.reason:
                    recommendation_reasons = [{"key": _reason_key(ranked.reason), "text": ranked.reason, "decisive": True}]

    if fallback_level != "none":
        recommendation_reasons = [{
            "key": "fallback",
            "text": {
                "incomplete_data": "No route has complete weather data; showing the best available with partial data.",
                "no_safe_route": "No safe route for this departure time and load.",
            }[fallback_level],
            "decisive": True,
        }]

    routes_payload.sort(key=lambda r: r["rank"])

    # --- heatmap (docs/05 §10): same unique checkpoint locations, 0..48h ---
    heatmap_points_input = []
    route_ids_by_key: Dict[str, List[str]] = {}
    for route_id in sel.route_ids:
        for cp in checkpoints_by_route[route_id]:
            key = _snap_key(cp.position)
            route_ids_by_key.setdefault(key, [])
            if route_id not in route_ids_by_key[key]:
                route_ids_by_key[key].append(route_id)

    series_for_heatmap = {key: series_by_key[key] for key in route_ids_by_key if key in series_by_key}
    heatmap_input = [(key, tuple(route_ids_by_key[key])) for key in series_for_heatmap]
    heatmap_points_raw = heatmap_mod.build(heatmap_input, series_for_heatmap, load_lb, departure)

    hm_points = []
    for hp in heatmap_points_raw:
        lat_str, lng_str = hp.point_id.split(",")
        hm_points.append({
            "lat": float(lat_str),
            "lng": float(lng_str),
            "route_ids": list(hp.route_ids),
            "risk": list(hp.scores),
        })

    return {
        "inputs": {
            "origin": data["origin"],
            "destination": data["destination"],
            "departure_time": departure.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "load_weight_lb": load_lb,
            "checkpoint_interval_miles": interval_mi,
        },
        "recommendation": {
            "route_id": recommendation_route_id,
            "fallback_level": fallback_level,
            "blocked": fallback_level == "no_safe_route",
            "reasons": recommendation_reasons,
            "ranking": full_ranking,
        },
        "routes": routes_payload,
        "heatmap": {
            "start_time": departure.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "hours": settings.ENGINE_SETTINGS["HEATMAP_HOURS"],
            "legend": ["low", "moderate", "high", "severe", "no_travel"],
            "encoding": {"risk": "0-4 = low..no_travel, 255 = unknown"},
            "points": hm_points,
        },
        "warnings": warnings,
        "weather_samples": weather_samples,
        "weather": {
            "provider": "open-meteo",
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)",
            "notes": ["Forecast model data, not observations."],
        },
        "meta": {
            "routing_provider": settings.ROUTING_PROVIDER,
            "unique_weather_points": len(unique_points_by_key),
            "cache_hits": cache_hits,
        },
    }


def _reason_key(reason_text: str) -> str:
    """Maps ranking.rank()'s free-text reason back to the PDF key it names
    (docs/05 §9), for the API's structured `reasons[].key` field."""
    text = reason_text.lower()
    if "severe miles" in text:
        return "severe_miles"
    if "high miles" in text:
        return "high_miles"
    if "average risk" in text:
        return "average_risk"
    if "duration" in text:
        return "duration_seconds"
    return "tie"


def _unknown_sample(reason: str) -> WeatherSample:
    return WeatherSample(wind_mph=None, rain_in_per_hr=None, snow_in_per_hr=None, unknown=True, unknown_reason=reason)


def _max_level_str(levels: Sequence) -> str:
    known = [l for l in levels if l != UNKNOWN]
    if not known:
        return "unknown"
    return max(known, key=lambda l: list(RiskLevel).index(l)).value


def _miles_by_level_payload(miles_by_level: Dict) -> Dict[str, float]:
    out = {}
    for level in RiskLevel:
        out[level.value] = round(miles_by_level[level], 1)
    out["unknown"] = round(miles_by_level[UNKNOWN], 1)
    return out


def _simplify_for_wire(points, distance_mi: float):
    epsilon = settings.ENGINE_SETTINGS["RDP_SIMPLIFY_EPSILON_MI"]
    return rdp_simplify(list(points), epsilon)


def _geometry_payload(points) -> Dict[str, Any]:
    if not points:
        return {"encoding": "polyline5", "points": "", "bbox": [0, 0, 0, 0]}
    lats = [p.lat for p in points]
    lngs = [p.lng for p in points]
    return {
        "encoding": "polyline5",
        "points": encode_polyline(points),
        "bbox": [min(lngs), min(lats), max(lngs), max(lats)],
    }


def _risk_segments(cps, levels, route_points, distance_mi: float) -> List[Dict[str, Any]]:
    """Merges adjacent same-level checkpoint coverage into segments with their
    own polyline geometry (docs/04 §4: "server produces them so the client
    never re-implements distance math").
    """
    if not cps:
        return []

    raw_cum = cumulative_distances_mi(route_points)
    cum = scale_to_distance(raw_cum, distance_mi)
    bounds = aggregate.checkpoint_coverage_bounds([cp.distance_mi for cp in cps])

    segments: List[Dict[str, Any]] = []
    seg_start, seg_level = bounds[0][0], levels[0]
    seg_end = bounds[0][1]
    for (lo, hi), level in list(zip(bounds, levels))[1:]:
        if level == seg_level:
            seg_end = hi
            continue
        segments.append((seg_start, seg_end, seg_level))
        seg_start, seg_end, seg_level = lo, hi, level
    segments.append((seg_start, seg_end, seg_level))

    out = []
    for lo, hi, level in segments:
        seg_points = points_between_distances(route_points, cum, lo, hi)
        out.append({
            "level": level if level == UNKNOWN else level.value,
            "from_miles": round(lo, 1),
            "to_miles": round(hi, 1),
            "points": encode_polyline(seg_points),
        })
    return out
