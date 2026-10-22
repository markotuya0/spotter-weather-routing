"""Thin DRF views: validation + throttle + call the service (docs/03 §4 rule 4)."""
from __future__ import annotations

import time

from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from providers.geocoding.base import Place

from . import service
from .serializers import SuggestQuerySerializer, TripAnalyzeRequestSerializer


class AnalyzeThrottle(AnonRateThrottle):
    scope = "analyze"


class SuggestThrottle(AnonRateThrottle):
    scope = "suggest"


class HealthView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({"status": "ok"})


class SuggestView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_classes = [SuggestThrottle]

    def get(self, request):
        serializer = SuggestQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        provider = service.get_geocoding_provider()
        places = provider.suggest(serializer.validated_data["q"], limit=serializer.validated_data["limit"])
        return Response({"results": [
            {"id": p.id, "label": p.label, "lat": p.lat, "lng": p.lng} for p in places
        ]})


class AnalyzeView(APIView):
    authentication_classes = []
    permission_classes = []
    throttle_classes = [AnalyzeThrottle]

    def post(self, request):
        started = time.monotonic()
        serializer = TripAnalyzeRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = service.analyze(serializer.validated_data)
        result["request_id"] = getattr(request, "request_id", None)
        result["meta"]["duration_ms"] = int((time.monotonic() - started) * 1000)
        response = Response(result)
        response["Cache-Control"] = "no-store"
        return response
