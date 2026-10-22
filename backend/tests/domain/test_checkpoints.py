import pytest

from domain import checkpoints
from domain.models import LatLng

STRAIGHT_LINE_100 = [LatLng(0.0, 0.0), LatLng(0.0, 1.443)]  # ~100 mi at equator-ish scale


def _distances(cps):
    return [cp.distance_mi for cp in cps]


def test_d100_i25_gives_five_checkpoints():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=100.0, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25, 50, 75, 100])


def test_d101_i25_appends_destination_without_duplicate():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=101.0, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25, 50, 75, 100, 101])


def test_d_less_than_i():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=8.0, interval_mi=10.0)
    assert _distances(cps) == pytest.approx([0, 8])


def test_d_exact_multiple_of_i_no_duplicate_final_checkpoint():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=50.0, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25, 50])
    assert len(cps) == 3


def test_d_equals_i():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=25.0, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25])


def test_d_multiple_plus_small_epsilon():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=50.01, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25, 50, 50.01])


def test_huge_distance_401_checkpoints_at_10mi():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=4000.0, interval_mi=10.0)
    assert len(cps) == 401
    assert _distances(cps)[-1] == pytest.approx(4000.0)


def test_origin_and_destination_are_first_and_last():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=100.0, interval_mi=25.0)
    assert cps[0].distance_mi == 0.0
    assert cps[0].position == STRAIGHT_LINE_100[0]
    assert cps[-1].distance_mi == pytest.approx(100.0)


def test_destination_position_matches_last_geometry_point():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=100.0, interval_mi=25.0)
    last = cps[-1].position
    assert last.lat == pytest.approx(STRAIGHT_LINE_100[-1].lat)
    assert last.lng == pytest.approx(STRAIGHT_LINE_100[-1].lng)


def test_duplicate_vertices_do_not_crash_and_still_scale_to_d():
    points = [LatLng(0.0, 0.0), LatLng(0.0, 0.0), LatLng(0.0, 1.443)]
    cps = checkpoints.generate(points, distance_mi=100.0, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25, 50, 75, 100])


def test_geometry_shorter_than_provider_distance_is_scaled_up():
    short_geom = [LatLng(0.0, 0.0), LatLng(0.0, 0.1443)]  # ~10 mi raw
    cps = checkpoints.generate(short_geom, distance_mi=100.0, interval_mi=25.0)
    assert _distances(cps) == pytest.approx([0, 25, 50, 75, 100])


def test_two_point_geometry():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=50.0, interval_mi=10.0)
    assert len(cps) == 6


def test_rejects_non_positive_interval():
    with pytest.raises(ValueError):
        checkpoints.generate(STRAIGHT_LINE_100, distance_mi=100.0, interval_mi=0.0)


def test_rejects_negative_distance():
    with pytest.raises(ValueError):
        checkpoints.generate(STRAIGHT_LINE_100, distance_mi=-1.0, interval_mi=10.0)


def test_rejects_empty_points():
    with pytest.raises(ValueError):
        checkpoints.generate([], distance_mi=100.0, interval_mi=10.0)


def test_positions_are_within_geometry_bounding_box():
    cps = checkpoints.generate(STRAIGHT_LINE_100, distance_mi=100.0, interval_mi=25.0)
    lats = [p.lat for p in STRAIGHT_LINE_100]
    lngs = [p.lng for p in STRAIGHT_LINE_100]
    for cp in cps:
        assert min(lats) - 1e-9 <= cp.position.lat <= max(lats) + 1e-9
        assert min(lngs) - 1e-9 <= cp.position.lng <= max(lngs) + 1e-9
