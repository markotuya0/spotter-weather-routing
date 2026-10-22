"""Request validation (docs/04 §4, §5.1: bounds from settings.TRIP_LIMITS)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from django.conf import settings
from rest_framework import serializers


class PlaceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=settings.TRIP_LIMITS["LABEL_MAX_LEN"], required=False, allow_blank=True)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)

    def validate(self, attrs):
        box = settings.TRIP_LIMITS["US_BOUNDING_BOX"]
        if not (box["lat_min"] <= attrs["lat"] <= box["lat_max"] and box["lng_min"] <= attrs["lng"] <= box["lng_max"]):
            raise serializers.ValidationError("Must be within the United States bounding box.")
        return attrs


class StrictSerializer(serializers.Serializer):
    """Rejects any top-level field not declared on the serializer (docs/04 §4:
    "unknown fields — rejected").
    """

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            unknown = set(data.keys()) - set(self.fields.keys())
            if unknown:
                raise serializers.ValidationError({f: ["Unknown field."] for f in sorted(unknown)})
        return super().to_internal_value(data)


class StrictDateTimeField(serializers.DateTimeField):
    """Rejects naive datetimes outright (docs/04 §4: "naive datetimes are
    rejected") instead of DRF's default of silently assuming the server
    timezone when USE_TZ=True.
    """

    def enforce_timezone(self, value):
        if value.tzinfo is None:
            raise serializers.ValidationError("Naive datetimes are rejected; include a UTC offset.")
        return super().enforce_timezone(value)


class TripAnalyzeRequestSerializer(StrictSerializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure_time = StrictDateTimeField()
    load_weight_lb = serializers.FloatField(
        min_value=settings.TRIP_LIMITS["LOAD_WEIGHT_LB_MIN"],
        max_value=settings.TRIP_LIMITS["LOAD_WEIGHT_LB_MAX"],
    )
    checkpoint_interval_miles = serializers.ChoiceField(
        choices=settings.TRIP_LIMITS["CHECKPOINT_INTERVALS_MI"],
        default=settings.TRIP_LIMITS["CHECKPOINT_INTERVAL_DEFAULT_MI"],
    )

    def validate_departure_time(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise serializers.ValidationError("Naive datetimes are rejected; include a UTC offset.")
        now = datetime.now(timezone.utc)
        earliest = now - timedelta(hours=settings.TRIP_LIMITS["DEPARTURE_MIN_HOURS_BEFORE_NOW"])
        latest = now + timedelta(days=settings.TRIP_LIMITS["DEPARTURE_MAX_DAYS_AFTER_NOW"])
        if not (earliest <= value <= latest):
            raise serializers.ValidationError("departure_time must be within [now - 1h, now + 7 days].")
        return value.astimezone(timezone.utc)

    def validate(self, attrs):
        origin, destination = attrs["origin"], attrs["destination"]
        from domain.geo import haversine_mi
        from domain.models import LatLng

        distance = haversine_mi(LatLng(origin["lat"], origin["lng"]), LatLng(destination["lat"], destination["lng"]))
        min_distance = settings.TRIP_LIMITS["ORIGIN_DESTINATION_MIN_DISTANCE_MI"]
        if distance <= min_distance:
            raise serializers.ValidationError(
                {"destination": [f"Must be more than {min_distance} mile from origin."]}
            )
        return attrs


class SuggestQuerySerializer(serializers.Serializer):
    q = serializers.CharField(
        min_length=settings.TRIP_LIMITS["SUGGEST_Q_MIN_LEN"],
        max_length=settings.TRIP_LIMITS["SUGGEST_Q_MAX_LEN"],
        trim_whitespace=True,
    )
    limit = serializers.IntegerField(
        min_value=settings.TRIP_LIMITS["SUGGEST_LIMIT_MIN"],
        max_value=settings.TRIP_LIMITS["SUGGEST_LIMIT_MAX"],
        default=settings.TRIP_LIMITS["SUGGEST_LIMIT_DEFAULT"],
        required=False,
    )
