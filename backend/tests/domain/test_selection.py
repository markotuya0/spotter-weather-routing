import pytest

from domain.models import LatLng, Route
from domain.selection import choose_three_distinct, overlap

# ~0.0144 deg longitude ~= 1 mile at the equator; build simple east-west lines.
def _line(lat_offset: float, n_points: int, length_mi: float, provider_index: int, duration_s: float) -> Route:
    step = (length_mi * 0.0144) / (n_points - 1)
    points = tuple(LatLng(lat_offset, i * step) for i in range(n_points))
    return Route(provider_index=provider_index, points=points, distance_mi=length_mi, duration_s=duration_s)


def test_overlap_identical_routes_is_one():
    a = _line(0.0, 20, 100.0, 0, 5000)
    assert overlap(a, a) == pytest.approx(1.0)


def test_overlap_far_apart_routes_is_zero():
    a = _line(0.0, 20, 100.0, 0, 5000)
    b = _line(5.0, 20, 100.0, 1, 5000)  # ~345 mi away in latitude
    assert overlap(a, b) == pytest.approx(0.0)


def test_duplicate_removed_at_095_overlap():
    a = _line(0.0, 50, 100.0, 0, 5000)
    near_duplicate = _line(0.0001, 50, 100.0, 1, 5001)  # ~0.007 mi offset, within 0.5mi radius
    distinct = _line(1.0, 50, 100.0, 2, 5010)
    result = choose_three_distinct([a, near_duplicate, distinct])
    assert len(result.selected) == 2
    ids = {r.provider_index for r in result.selected}
    assert ids == {0, 2}


def test_detour_removed_when_duration_exceeds_1_5x_fastest():
    fast = _line(0.0, 10, 100.0, 0, 3600)
    detour = _line(1.0, 10, 100.0, 1, 3600 * 2)  # 2x fastest's duration
    result = choose_three_distinct([fast, detour])
    assert len(result.selected) == 1
    assert result.selected[0].provider_index == 0
    assert result.warning == "ROUTES_FEWER_THAN_3"


def test_detour_removed_when_distance_exceeds_1_5x_shortest():
    short = _line(0.0, 10, 100.0, 0, 3600)
    long_detour = _line(1.0, 10, 200.0, 1, 3700)  # 2x shortest's distance
    result = choose_three_distinct([short, long_detour])
    assert len(result.selected) == 1


def test_exactly_three_distinct_candidates_all_kept():
    a = _line(0.0, 10, 100.0, 0, 3600)
    b = _line(1.0, 10, 100.0, 1, 3700)
    c = _line(2.0, 10, 100.0, 2, 3800)
    result = choose_three_distinct([a, b, c])
    assert len(result.selected) == 3
    assert result.warning is None
    assert result.route_ids == ("r1", "r2", "r3")


def test_two_candidates_warning_fewer_than_3():
    a = _line(0.0, 10, 100.0, 0, 3600)
    b = _line(1.0, 10, 100.0, 1, 3700)
    result = choose_three_distinct([a, b])
    assert len(result.selected) == 2
    assert result.warning == "ROUTES_FEWER_THAN_3"


def test_one_candidate_warning_fewer_than_3():
    a = _line(0.0, 10, 100.0, 0, 3600)
    result = choose_three_distinct([a])
    assert len(result.selected) == 1
    assert result.warning == "ROUTES_FEWER_THAN_3"


def test_zero_candidates_no_route():
    result = choose_three_distinct([])
    assert result.selected == ()
    assert result.warning == "NO_ROUTE"


def test_greedy_adds_lowest_max_overlap_first():
    provider_best = _line(0.0, 20, 100.0, 0, 3600)
    close_to_best = _line(0.05, 20, 100.0, 1, 3610)  # moderate overlap with best
    far_from_best = _line(3.0, 20, 100.0, 2, 3620)  # no overlap with best
    result = choose_three_distinct([provider_best, close_to_best, far_from_best])
    # far_from_best has the lowest max-overlap against the selected set at each
    # greedy step, so it should be preferred as the 2nd pick when both qualify.
    selected_indices = [r.provider_index for r in result.selected]
    assert 2 in selected_indices


def test_more_than_three_distinct_candidates_caps_at_three():
    routes = [_line(float(i), 10, 100.0, i, 3600 + i * 10) for i in range(5)]
    result = choose_three_distinct(routes)
    assert len(result.selected) == 3


def test_selected_route_ids_assigned_in_provider_order():
    a = _line(0.0, 10, 100.0, 2, 3600)
    b = _line(1.0, 10, 100.0, 0, 3700)
    c = _line(2.0, 10, 100.0, 1, 3800)
    result = choose_three_distinct([a, b, c])
    assert [r.provider_index for r in result.selected] == [0, 1, 2]
    assert result.route_ids == ("r1", "r2", "r3")


def test_overlap_single_point_route_far_from_other_returns_zero():
    single = Route(provider_index=0, points=(LatLng(10.0, 10.0),), distance_mi=0.0, duration_s=1.0)
    other = _line(0.0, 10, 100.0, 1, 3600)
    assert overlap(single, other) == 0.0
    assert overlap(other, single) == 0.0


def test_overlap_empty_geometry_returns_zero():
    empty = Route(provider_index=0, points=(), distance_mi=0.0, duration_s=1.0)
    other = _line(0.0, 10, 100.0, 1, 3600)
    assert overlap(empty, other) == 0.0
    assert overlap(other, empty) == 0.0


def test_overlap_zero_length_geometry_returns_zero():
    # All points identical -> total haversine length is 0, a degenerate route.
    zero_len = Route(
        provider_index=0,
        points=(LatLng(1.0, 1.0), LatLng(1.0, 1.0), LatLng(1.0, 1.0)),
        distance_mi=0.0,
        duration_s=1.0,
    )
    other = _line(0.0, 10, 100.0, 1, 3600)
    assert overlap(zero_len, other) == 0.0
    assert overlap(other, zero_len) == 0.0


def test_detour_fastest_reference_uses_full_original_pool_not_deduped_pool():
    # docs/05 §2.3: fastest/shortest are measured across the FULL original
    # candidate pool, before duplicates are dropped. A very fast near-duplicate
    # that gets removed in the dedup step must still tighten the detour bound
    # for the surviving candidates — using the deduped-only pool would silently
    # loosen the filter (docs/05 §2 "Filtering policy" note, M1 closeout review).
    provider_best = _line(0.0, 10, 100.0, 0, 5000)
    superfast_duplicate = _line(0.0001, 10, 100.0, 1, 1000)  # removed as a duplicate of provider_best
    candidate = _line(2.0, 10, 100.0, 2, 1600)  # 1.6x the removed duplicate's duration -> detour

    result = choose_three_distinct([provider_best, superfast_duplicate, candidate])

    selected_indices = {r.provider_index for r in result.selected}
    assert 2 not in selected_indices, (
        "candidate should be excluded as a detour relative to the full pool's "
        "fastest duration (1000s from the removed duplicate), not the deduped "
        "pool's fastest (5000s from provider_best), which would wrongly spare it"
    )


def test_overlap_matches_across_a_grid_cell_boundary():
    # A point placed exactly on a grid cell boundary (docs/05 §2.2 _CELL_DEG)
    # must still match a point just across that boundary that lies within
    # _MATCH_RADIUS_MI (0.5 mi) — guards the grid-hash optimisation against
    # under-counting at cell edges (M2 closeout performance fix, docs/09 §8).
    from domain.selection import _CELL_DEG

    boundary_lat = 10 * _CELL_DEG  # exact multiple -> sits on a cell edge
    a = Route(provider_index=0, points=(LatLng(boundary_lat, 0.0),), distance_mi=0.0, duration_s=1.0)
    # ~0.3 mi away, just across the boundary into the neighbouring cell.
    b = Route(provider_index=1, points=(LatLng(boundary_lat - 0.0045, 0.0),), distance_mi=0.0, duration_s=1.0)
    assert overlap(a, b) == pytest.approx(1.0)


def test_overlap_realistic_route_length_completes_quickly():
    # Regression guard for the O(n*m) brute-force scan this grid-hash
    # replaced (M2 closeout, docs/09 §8): a ~500-mile route with mile-spaced
    # sampling must resolve well under a second, not tens of seconds.
    import time

    a = _line(0.0, 500, 500.0, 0, 500 * 60)
    b = _line(0.0001, 500, 500.0, 1, 500 * 61)
    started = time.monotonic()
    overlap(a, b)
    assert time.monotonic() - started < 2.0


def test_provider_best_always_kept_even_if_it_would_be_a_detour_outlier():
    # provider_index=0 is exempt from the detour filter (docs/05 §2.4: it is
    # unconditionally kept as the seed).
    provider_best = _line(0.0, 10, 500.0, 0, 50000)  # would exceed 1.5x if compared to itself-excluded set
    short_alt = _line(1.0, 10, 100.0, 1, 3600)
    result = choose_three_distinct([provider_best, short_alt])
    assert 0 in [r.provider_index for r in result.selected]
