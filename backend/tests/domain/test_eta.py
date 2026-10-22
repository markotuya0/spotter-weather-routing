from datetime import datetime, timedelta, timezone


from domain.eta import eta_at_distance, time_at

UTC = timezone.utc


def test_linear_profile_eta_at_d():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    eta = eta_at_distance(dep, distance_mi=100.0, duration_s=36000, d=25.0)  # 10h total
    assert eta == dep + timedelta(hours=2.5)


def test_eta_at_destination_equals_departure_plus_duration_exactly():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    eta = eta_at_distance(dep, distance_mi=321.0, duration_s=54321, d=321.0)
    assert eta == dep + timedelta(seconds=54321)


def test_eta_at_origin_equals_departure():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    eta = eta_at_distance(dep, distance_mi=100.0, duration_s=3600, d=0.0)
    assert eta == dep


def test_odd_seconds_duration():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    eta = eta_at_distance(dep, distance_mi=100.0, duration_s=12345, d=50.0)
    assert eta == dep + timedelta(seconds=12345 / 2)


def test_knots_profile_equals_linear_profile_when_knots_are_collinear():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    knots = [(0.0, 0.0), (50.0, 18000.0), (100.0, 36000.0)]  # collinear with linear T=36000,D=100
    eta_knots = eta_at_distance(dep, 100.0, 36000.0, d=25.0, knots=knots)
    eta_linear = eta_at_distance(dep, 100.0, 36000.0, d=25.0)
    assert eta_knots == eta_linear


def test_knots_profile_nonlinear_interpolates_between_knots():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    # Slow first half (0-50mi takes 30000s), fast second half (50-100mi takes 6000s)
    knots = [(0.0, 0.0), (50.0, 30000.0), (100.0, 36000.0)]
    eta = eta_at_distance(dep, 100.0, 36000.0, d=25.0, knots=knots)
    assert eta == dep + timedelta(seconds=15000)


def test_knots_enforces_endpoints_even_if_not_supplied():
    dep = datetime(2026, 6, 1, 8, 0, tzinfo=UTC)
    knots = [(50.0, 18000.0)]  # missing explicit (0,0) and (D,T)
    eta_d = eta_at_distance(dep, 100.0, 36000.0, d=100.0, knots=knots)
    assert eta_d == dep + timedelta(seconds=36000)
    eta_0 = eta_at_distance(dep, 100.0, 36000.0, d=0.0, knots=knots)
    assert eta_0 == dep


def test_crossing_midnight_utc():
    dep = datetime(2026, 6, 1, 23, 0, tzinfo=UTC)
    eta = eta_at_distance(dep, distance_mi=10.0, duration_s=7200, d=10.0)
    assert eta == datetime(2026, 6, 2, 1, 0, tzinfo=UTC)


def test_crossing_dst_boundary_is_pure_utc_arithmetic():
    # DST only affects local display (A-10); internal UTC math must be a plain
    # offset regardless of any local-time DST transition on the same date.
    dep = datetime(2026, 3, 8, 6, 0, tzinfo=UTC)  # around US spring-forward date
    eta = eta_at_distance(dep, distance_mi=24.0, duration_s=86400, d=12.0)
    assert eta == dep + timedelta(hours=12)


def test_time_at_zero_distance_route_is_zero():
    assert time_at(0.0, distance_mi=0.0, duration_s=100.0) == 0.0
