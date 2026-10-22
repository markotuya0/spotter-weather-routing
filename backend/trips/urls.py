from django.urls import path

from .views import AnalyzeView, HealthView, SuggestView

urlpatterns = [
    path("health", HealthView.as_view(), name="health"),
    path("places/suggest", SuggestView.as_view(), name="places-suggest"),
    path("trips/analyze", AnalyzeView.as_view(), name="trips-analyze"),
]
