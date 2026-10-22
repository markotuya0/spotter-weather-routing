import pytest
from hypothesis import given, strategies as st

from domain import aggregate
from domain.models import RiskLevel, UNKNOWN

L, M, H, S, N = (
    RiskLevel.LOW,
    RiskLevel.MODERATE,
    RiskLevel.HIGH,
    RiskLevel.SEVERE,
    RiskLevel.NO_TRAVEL,
)


def test_coverage_example_d100_i25():
    distances = [0, 25, 50, 75, 100]
    miles = aggregate.mile_attribution(distances)
    assert miles == pytest.approx([12.5, 25, 25, 25, 12.5])
    assert sum(miles) == pytest.approx(100.0)


def test_single_checkpoint_pair_route():
    distances = [0, 100]
    miles = aggregate.mile_attribution(distances)
    assert miles == pytest.approx([50.0, 50.0])


def test_single_checkpoint_route():
    assert aggregate.mile_attribution([0]) == [0.0]


def test_empty_route():
    assert aggregate.mile_attribution([]) == []


def test_checkpoint_coverage_bounds_d100_i25():
    bounds = aggregate.checkpoint_coverage_bounds([0, 25, 50, 75, 100])
    assert bounds == [(0.0, 12.5), (12.5, 37.5), (37.5, 62.5), (62.5, 87.5), (87.5, 100.0)]


def test_checkpoint_coverage_bounds_single_checkpoint():
    assert aggregate.checkpoint_coverage_bounds([0]) == [(0.0, 0.0)]


def test_checkpoint_coverage_bounds_empty():
    assert aggregate.checkpoint_coverage_bounds([]) == []


@given(
    st.lists(st.floats(min_value=0, max_value=5000, allow_nan=False), min_size=2, max_size=30)
    .map(sorted)
    .filter(lambda xs: len(set(xs)) == len(xs))
)
def test_sum_of_miles_equals_total_distance_property(distances):
    miles = aggregate.mile_attribution(distances)
    assert sum(miles) == pytest.approx(distances[-1])


def test_average_risk_weighted_by_miles():
    distances = [0, 25, 50, 75, 100]
    levels = [L, M, H, S, L]
    result = aggregate.aggregate(distances, levels)
    miles = [12.5, 25, 25, 25, 12.5]
    scores = [0, 1, 2, 3, 0]
    expected = sum(m * s for m, s in zip(miles, scores)) / sum(miles)
    assert result["average_risk"] == pytest.approx(expected)


def test_severe_and_high_miles_extracted():
    distances = [0, 50, 100]
    levels = [S, H, L]
    result = aggregate.aggregate(distances, levels)
    assert result["severe_miles"] == pytest.approx(25.0)  # checkpoint 0 covers 0-25
    assert result["high_miles"] == pytest.approx(50.0)  # checkpoint 1 covers 25-75


def test_unknown_miles_tracked_separately_and_excluded_from_average():
    distances = [0, 50, 100]
    levels = [L, UNKNOWN, L]
    result = aggregate.aggregate(distances, levels)
    assert result["miles_by_level"][UNKNOWN] == pytest.approx(50.0)
    # average computed over known checkpoints only: checkpoint0 (0-25mi, L=0),
    # checkpoint2 (75-100mi, L=0) -> average 0
    assert result["average_risk"] == pytest.approx(0.0)


def test_average_risk_null_when_all_checkpoints_unknown():
    distances = [0, 50, 100]
    levels = [UNKNOWN, UNKNOWN, UNKNOWN]
    result = aggregate.aggregate(distances, levels)
    assert result["average_risk"] is None


def test_no_travel_miles_not_added_to_severe_miles():
    distances = [0, 50, 100]
    levels = [N, S, L]
    result = aggregate.aggregate(distances, levels)
    assert result["no_travel_miles"] == pytest.approx(25.0)
    assert result["severe_miles"] == pytest.approx(50.0)
    assert result["no_travel_miles"] != result["severe_miles"]
