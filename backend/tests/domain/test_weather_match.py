from datetime import datetime, timedelta, timezone

import pytest

from domain.weather_match import ForecastSeries, sample_at

UTC = timezone.utc


def _hourly_series(start: datetime, hours: int, wind_fn, rain_fn, showers_fn, snow_fn):
    times = [start + timedelta(hours=i) for i in range(hours)]
    return ForecastSeries(
        times=times,
        wind_mph=[wind_fn(i) for i in range(hours)],
        rain_in=[rain_fn(i) for i in range(hours)],
        showers_in=[showers_fn(i) for i in range(hours)],
        snow_in=[snow_fn(i) for i in range(hours)],
    )


BASE = datetime(2026, 6, 1, 10, 0, tzinfo=UTC)


def test_worked_example_14_20_wind_interpolation():
    # wind(14:00)=30.0, wind(15:00)=36.0 -> 32.0 mph at 14:20 (docs/05 §4.3)
    series = _hourly_series(
        datetime(2026, 6, 1, 14, 0, tzinfo=UTC),
        hours=2,
        wind_fn=lambda i: [30.0, 36.0][i],
        rain_fn=lambda i: 0.0,
        showers_fn=lambda i: 0.0,
        snow_fn=lambda i: 0.0,
    )
    sample = sample_at(series, datetime(2026, 6, 1, 14, 20, tzinfo=UTC))
    assert not sample.unknown
    assert sample.wind_mph == pytest.approx(32.0)
    assert sample.wind_time_used == (datetime(2026, 6, 1, 14, 0, tzinfo=UTC), datetime(2026, 6, 1, 15, 0, tzinfo=UTC))
    assert sample.precip_bucket_end == datetime(2026, 6, 1, 15, 0, tzinfo=UTC)


def test_exactly_on_the_hour_h0_equals_h1():
    series = _hourly_series(BASE, hours=3, wind_fn=lambda i: 10.0 * (i + 1), rain_fn=lambda i: 0.1, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE + timedelta(hours=1))
    assert sample.wind_mph == pytest.approx(20.0)
    assert sample.wind_time_used == (BASE + timedelta(hours=1), BASE + timedelta(hours=1))


def test_14_59_59_near_ceiling():
    series = _hourly_series(
        datetime(2026, 6, 1, 14, 0, tzinfo=UTC),
        hours=2,
        wind_fn=lambda i: [30.0, 36.0][i],
        rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0,
    )
    t = datetime(2026, 6, 1, 14, 59, 59, tzinfo=UTC)
    sample = sample_at(series, t)
    frac = timedelta(minutes=59, seconds=59).total_seconds() / 3600.0
    assert sample.wind_mph == pytest.approx(30.0 + (36.0 - 30.0) * frac)


def test_first_hour_of_series():
    series = _hourly_series(BASE, hours=3, wind_fn=lambda i: 5.0 * (i + 1), rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE)
    assert sample.wind_mph == pytest.approx(5.0)


def test_last_hour_of_series():
    series = _hourly_series(BASE, hours=3, wind_fn=lambda i: 5.0 * (i + 1), rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE + timedelta(hours=2))
    assert sample.wind_mph == pytest.approx(15.0)


def test_rain_showers_summed_at_ceil_hour_bucket():
    series = _hourly_series(
        datetime(2026, 6, 1, 14, 0, tzinfo=UTC), hours=2,
        wind_fn=lambda i: 0.0,
        rain_fn=lambda i: [0.0, 0.2][i],
        showers_fn=lambda i: [0.0, 0.05][i],
        snow_fn=lambda i: 0.0,
    )
    sample = sample_at(series, datetime(2026, 6, 1, 14, 20, tzinfo=UTC))
    assert sample.rain_in_per_hr == pytest.approx(0.25)  # from the 15:00 bucket


def test_missing_wind_is_unknown_provider_error():
    series = _hourly_series(BASE, hours=2, wind_fn=lambda i: [None, 10.0][i], rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE)
    assert sample.unknown
    assert sample.unknown_reason == "provider_error"


def test_missing_rain_is_unknown_provider_error():
    # The null is at index1 (the h1 bucket rain/snow actually read) — index0's
    # value is irrelevant to rain/snow, only to wind, so it must sit at h1 to test this.
    series = _hourly_series(BASE, hours=2, wind_fn=lambda i: 10.0, rain_fn=lambda i: [0.1, None][i], showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE + timedelta(minutes=30))
    assert sample.unknown
    assert sample.unknown_reason == "provider_error"


def test_missing_snow_is_unknown_provider_error():
    series = _hourly_series(BASE, hours=2, wind_fn=lambda i: 10.0, rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: [0.1, None][i])
    sample = sample_at(series, BASE + timedelta(minutes=30))
    assert sample.unknown
    assert sample.unknown_reason == "provider_error"


def test_eta_beyond_forecast_series_end_is_unknown_beyond_forecast():
    series = _hourly_series(BASE, hours=2, wind_fn=lambda i: 10.0, rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE + timedelta(hours=10))
    assert sample.unknown
    assert sample.unknown_reason == "beyond_forecast"


def test_never_zero_on_missing_data_distinguishes_unknown_from_calm():
    series = _hourly_series(BASE, hours=2, wind_fn=lambda i: [None, 0.0][i], rain_fn=lambda i: 0.0, showers_fn=lambda i: 0.0, snow_fn=lambda i: 0.0)
    sample = sample_at(series, BASE)
    assert sample.unknown is True
    assert sample.wind_mph is None  # never silently coerced to 0.0
