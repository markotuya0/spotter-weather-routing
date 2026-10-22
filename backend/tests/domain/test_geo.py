
import pytest
from hypothesis import given, strategies as st

from domain.geo import (
    cumulative_distances_mi,
    encode_polyline,
    haversine_mi,
    point_at_distance,
    points_between_distances,
    rdp_simplify,
    scale_to_distance,
)
from domain.models import LatLng


def test_haversine_known_distance_nyc_la():
    nyc = LatLng(40.7128, -74.0060)
    la = LatLng(34.0522, -118.2437)
    d = haversine_mi(nyc, la)
    assert 2440 < d < 2460  # well-known ~2451 mi great-circle distance


def test_haversine_zero_for_identical_points():
    p = LatLng(10.0, 20.0)
    assert haversine_mi(p, p) == 0.0


def test_cumulative_distances_empty():
    assert cumulative_distances_mi([]) == []


def test_cumulative_distances_single_point():
    assert cumulative_distances_mi([LatLng(1, 1)]) == [0.0]


def test_cumulative_distances_duplicate_consecutive_points_zero_length_segment():
    p = LatLng(10.0, 20.0)
    q = LatLng(10.0, 21.0)
    cum = cumulative_distances_mi([p, p, q])
    assert cum[0] == 0.0
    assert cum[1] == 0.0  # zero-length segment contributes nothing
    assert cum[2] > 0.0


def test_scale_to_distance_rescales_last_value_to_target():
    cum = [0.0, 10.0, 25.0, 40.0]
    scaled = scale_to_distance(cum, 100.0)
    assert scaled[-1] == pytest.approx(100.0)
    assert scaled[0] == 0.0


def test_scale_to_distance_zero_length_geometry_returns_zeros():
    assert scale_to_distance([0.0, 0.0, 0.0], 50.0) == [0.0, 0.0, 0.0]


def test_scale_to_distance_empty():
    assert scale_to_distance([], 50.0) == []


def test_point_at_distance_two_point_geometry_midpoint():
    points = [LatLng(0.0, 0.0), LatLng(0.0, 10.0)]
    cum = scale_to_distance(cumulative_distances_mi(points), 100.0)
    mid = point_at_distance(points, cum, 50.0)
    assert mid.lat == pytest.approx(0.0)
    assert 0.0 < mid.lng < 10.0


def test_point_at_distance_before_start_clamped_to_first_point():
    points = [LatLng(0.0, 0.0), LatLng(0.0, 10.0)]
    cum = scale_to_distance(cumulative_distances_mi(points), 100.0)
    assert point_at_distance(points, cum, -5.0) == points[0]


def test_point_at_distance_after_end_clamped_to_last_point():
    points = [LatLng(0.0, 0.0), LatLng(0.0, 10.0)]
    cum = scale_to_distance(cumulative_distances_mi(points), 100.0)
    assert point_at_distance(points, cum, 500.0) == points[-1]


def test_point_at_distance_single_point_geometry():
    points = [LatLng(5.0, 5.0)]
    assert point_at_distance(points, [0.0], 0.0) == points[0]


def test_point_at_distance_skips_zero_length_segment():
    # Duplicate vertex produces a zero-length segment in cum; interpolation
    # must not divide by zero and must land on the correct endpoint.
    points = [LatLng(0.0, 0.0), LatLng(0.0, 0.0), LatLng(0.0, 10.0)]
    raw_cum = cumulative_distances_mi(points)
    cum = scale_to_distance(raw_cum, 100.0)
    pos = point_at_distance(points, cum, 0.0)
    assert pos == points[0]


def test_points_between_distances_keeps_interior_vertices_not_a_straight_chord():
    # A right-angle route: straight chord from 0 to 100 would cut the corner,
    # but the real geometry bends at the middle vertex (lat jumps 0 -> 5).
    points = [LatLng(0.0, 0.0), LatLng(0.0, 10.0), LatLng(5.0, 10.0)]
    raw_cum = cumulative_distances_mi(points)
    cum = scale_to_distance(raw_cum, 100.0)
    seg = points_between_distances(points, cum, 0.0, 100.0)
    assert len(seg) == 3
    assert seg[0] == points[0]
    assert seg[1] == points[1]
    assert seg[-1] == points[-1]


def test_points_between_distances_sub_range_excludes_vertices_outside_bounds():
    points = [LatLng(0.0, 0.0), LatLng(0.0, 5.0), LatLng(0.0, 10.0)]
    raw_cum = cumulative_distances_mi(points)
    cum = scale_to_distance(raw_cum, 100.0)
    # [60, 100] should not include the vertex at ~50 (cum index 1).
    seg = points_between_distances(points, cum, 60.0, 100.0)
    assert len(seg) == 2
    assert seg[-1] == points[-1]


def test_points_between_distances_single_point_geometry():
    points = [LatLng(5.0, 5.0)]
    assert points_between_distances(points, [0.0], 0.0, 0.0) == points


@given(
    st.lists(
        st.tuples(
            st.floats(min_value=-80, max_value=80, allow_nan=False),
            st.floats(min_value=-170, max_value=170, allow_nan=False),
        ),
        min_size=2,
        max_size=20,
    )
)
def test_cumulative_distances_monotonic_nondecreasing(coords):
    points = [LatLng(lat, lng) for lat, lng in coords]
    cum = cumulative_distances_mi(points)
    for a, b in zip(cum, cum[1:]):
        assert b >= a


# --- rdp_simplify ---

def test_rdp_simplify_fewer_than_three_points_returned_unchanged():
    points = [LatLng(0.0, 0.0), LatLng(1.0, 1.0)]
    assert rdp_simplify(points, 1.0) == points


def test_rdp_simplify_zero_epsilon_returned_unchanged():
    points = [LatLng(0.0, 0.0), LatLng(0.5, 0.0), LatLng(1.0, 0.0)]
    assert rdp_simplify(points, 0.0) == points


def test_rdp_simplify_collinear_midpoint_dropped():
    # Three points on a straight line: the midpoint is within any epsilon > 0
    # of the line joining the endpoints, so it is dropped.
    points = [LatLng(0.0, 0.0), LatLng(0.5, 0.0), LatLng(1.0, 0.0)]
    simplified = rdp_simplify(points, 0.01)
    assert simplified == [points[0], points[-1]]


def test_rdp_simplify_endpoints_always_kept():
    points = [LatLng(0.0, 0.0), LatLng(5.0, 5.0), LatLng(10.0, 0.0)]
    simplified = rdp_simplify(points, 0.001)
    assert simplified[0] == points[0]
    assert simplified[-1] == points[-1]


def test_rdp_simplify_large_deviation_point_kept():
    # Midpoint deviates far from the straight line -> must survive a small epsilon.
    points = [LatLng(0.0, 0.0), LatLng(5.0, 5.0), LatLng(10.0, 0.0)]
    simplified = rdp_simplify(points, 0.001)
    assert len(simplified) == 3


def test_rdp_simplify_second_candidate_closer_than_first_keeps_first_as_max():
    # Two interior points where the first examined has the larger perpendicular
    # distance and the second is smaller, exercising the "not a new max" branch
    # of the max-distance scan (the far point, not the near one, must win).
    points = [LatLng(0.0, 0.0), LatLng(5.0, 2.0), LatLng(1.0, 5.0), LatLng(0.0, 10.0)]
    simplified = rdp_simplify(points, 2.0)
    assert LatLng(5.0, 2.0) in simplified


def test_rdp_simplify_large_epsilon_drops_everything_but_endpoints():
    points = [LatLng(0.0, 0.0), LatLng(5.0, 5.0), LatLng(10.0, 0.0)]
    simplified = rdp_simplify(points, 1000.0)
    assert simplified == [points[0], points[-1]]


def test_rdp_simplify_zero_length_reference_segment():
    # Endpoints share the same coordinates (a == b), exercising the
    # seg_len_sq == 0 branch of the perpendicular-distance helper; the
    # far-away midpoint must still be measured (and kept) against that
    # degenerate segment rather than raising a division error.
    points = [LatLng(0.0, 0.0), LatLng(1.0, 1.0), LatLng(0.0, 0.0)]
    simplified = rdp_simplify(points, 0.001)
    assert len(simplified) == 3


# --- encode_polyline ---

def test_encode_polyline_known_example():
    # Classic Google polyline-algorithm worked example.
    points = [LatLng(38.5, -120.2), LatLng(40.7, -120.95), LatLng(43.252, -126.453)]
    assert encode_polyline(points) == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"


def test_encode_polyline_empty_returns_empty_string():
    assert encode_polyline([]) == ""


def test_encode_polyline_single_point_roundtrip_shape():
    points = [LatLng(0.0, 0.0)]
    encoded = encode_polyline(points)
    assert isinstance(encoded, str) and encoded != ""


def test_encode_polyline_negative_coordinates():
    points = [LatLng(-10.0, -20.0), LatLng(-10.5, -20.5)]
    encoded = encode_polyline(points)
    assert isinstance(encoded, str) and encoded != ""
