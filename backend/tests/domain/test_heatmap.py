from datetime import datetime, timedelta, timezone


from domain import heatmap
from domain.risk import checkpoint_risk
from domain.weather_match import ForecastSeries, sample_at

UTC = timezone.utc
DEP = datetime(2026, 6, 1, 0, 0, tzinfo=UTC)


def _constant_series(hours: int, wind: float, rain: float, snow: float) -> ForecastSeries:
    times = [DEP + timedelta(hours=i) for i in range(hours)]
    return ForecastSeries(
        times=times,
        wind_mph=[wind] * hours,
        rain_in=[rain] * hours,
        showers_in=[0.0] * hours,
        snow_in=[snow] * hours,
    )


def test_heatmap_length_49_per_point():
    series = _constant_series(hours=50, wind=10.0, rain=0.0, snow=0.0)
    result = heatmap.build([("p1", ("r1",))], {"p1": series}, load_lb=1000, departure=DEP)
    assert len(result[0].scores) == 49


def test_heatmap_hour_value_equals_single_point_classification():
    series = _constant_series(hours=50, wind=40.0, rain=0.0, snow=0.0)
    result = heatmap.build([("p1", ("r1",))], {"p1": series}, load_lb=1000, departure=DEP)
    expected_sample = sample_at(series, DEP + timedelta(hours=5))
    expected_level = checkpoint_risk(expected_sample, load_lb=1000).level
    from domain.models import RISK_SCORE

    assert result[0].scores[5] == RISK_SCORE[expected_level]


def test_heatmap_unknown_encoded_255():
    series = _constant_series(hours=10, wind=10.0, rain=0.0, snow=0.0)  # too short for h=0..48
    result = heatmap.build([("p1", ("r1",))], {"p1": series}, load_lb=1000, departure=DEP)
    assert result[0].scores[20] == 255  # beyond the 10-hour series
    assert result[0].scores[0] != 255


def test_heatmap_shared_points_merge_route_ids():
    series = _constant_series(hours=50, wind=10.0, rain=0.0, snow=0.0)
    result = heatmap.build(
        [("p1", ("r1", "r2"))], {"p1": series}, load_lb=1000, departure=DEP
    )
    assert result[0].route_ids == ("r1", "r2")


def test_heatmap_uses_same_load_rules_as_checkpoints():
    # wind 44.996 with load 50,000 -> load-rule severe override, identical to
    # risk.checkpoint_risk's own behaviour (docs/05 §10's "never silently disagree").
    series = _constant_series(hours=50, wind=44.996, rain=0.0, snow=0.0)
    result = heatmap.build([("p1", ("r1",))], {"p1": series}, load_lb=50000, departure=DEP)
    from domain.models import RiskLevel, RISK_SCORE

    assert result[0].scores[0] == RISK_SCORE[RiskLevel.SEVERE]


def test_heatmap_multiple_points_independent():
    calm = _constant_series(hours=50, wind=0.0, rain=0.0, snow=0.0)
    severe = _constant_series(hours=50, wind=50.0, rain=0.0, snow=0.0)
    result = heatmap.build(
        [("calm", ("r1",)), ("severe", ("r2",))],
        {"calm": calm, "severe": severe},
        load_lb=1000,
        departure=DEP,
    )
    by_id = {p.point_id: p for p in result}
    assert by_id["calm"].scores[0] == 0
    assert by_id["severe"].scores[0] == 3
