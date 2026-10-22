"""Django settings (docs/03 §9, docs/04 §5). Stateless API, no DB, no auth."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR.parent / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure-secret-key-do-not-use-in-production")
# M2 security closeout C-2: fail-safe defaults. DEBUG must be explicitly
# turned on for local dev (.env.example documents DEBUG=1); production
# (Render) must explicitly set ALLOWED_HOSTS to its real hostname(s) — the
# default is restricted to loopback, never "*", so a misconfigured deploy
# fails closed (Django raises DisallowedHost) instead of accepting any Host.
DEBUG = os.environ.get("DEBUG", "0") == "1"
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "trips",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.gzip.GZipMiddleware",
    "trips.middleware.RequestIdMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# No persistence (docs/03 §1): this DB is never migrated/used; Django just
# requires one configured to boot contenttypes/auth (unused apps, no models).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "spotter-provider-cache",
    }
}

CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "trips.errors.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [],
    "DEFAULT_THROTTLE_RATES": {
        "analyze": "20/min",
        "suggest": "60/min",
    },
    # M2 security closeout W-2: DRF's default (NUM_PROXIES=None) blindly
    # trusts the entire client-supplied X-Forwarded-For header as the
    # throttle identity, so any client can spoof a distinct IP per request
    # and bypass per-client throttling entirely. Render's standard web
    # service puts exactly one reverse proxy in front of the app (its edge
    # load balancer), which appends the real client IP as the LAST entry of
    # XFF — NUM_PROXIES=1 makes DRF key off that last (trusted-hop) entry and
    # ignore anything a client prepends. This is an ASSUMPTION about Render's
    # topology (docs/09-decisions.md) rather than a confirmed fact; it is the
    # conservative choice because trusting one hop is safer than trusting the
    # unbounded default, and it is overridable via NUM_PROXIES if the actual
    # topology turns out to need more hops.
    "NUM_PROXIES": int(os.environ.get("NUM_PROXIES", "1")),
}

USE_TZ = True
TIME_ZONE = "UTC"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# --- Provider configuration (docs/03 §9) ---
TOMTOM_API_KEY = os.environ.get("TOMTOM_API_KEY", "")
HERE_API_KEY = os.environ.get("HERE_API_KEY", "")
ROUTING_PROVIDER = os.environ.get("ROUTING_PROVIDER", "tomtom")

# --- Trip limits (docs/04 §5.1: "all bounds from settings.TRIP_LIMITS, single place") ---
TRIP_LIMITS = {
    "LOAD_WEIGHT_LB_MIN": 1,
    "LOAD_WEIGHT_LB_MAX": 100000,
    "CHECKPOINT_INTERVALS_MI": (10, 25, 50),
    "CHECKPOINT_INTERVAL_DEFAULT_MI": 25,
    "DEPARTURE_MIN_HOURS_BEFORE_NOW": 1,
    "DEPARTURE_MAX_DAYS_AFTER_NOW": 7,
    "LABEL_MAX_LEN": 120,
    "ORIGIN_DESTINATION_MIN_DISTANCE_MI": 1.0,
    "US_BOUNDING_BOX": {"lat_min": 18.0, "lat_max": 72.0, "lng_min": -180.0, "lng_max": -65.0},
    "SUGGEST_Q_MIN_LEN": 3,
    "SUGGEST_Q_MAX_LEN": 100,
    "SUGGEST_LIMIT_MIN": 1,
    "SUGGEST_LIMIT_MAX": 8,
    "SUGGEST_LIMIT_DEFAULT": 5,
}

# --- Weather/routing engine config (docs/05 §12, docs/03 §6) ---
ENGINE_SETTINGS = {
    "MAX_ALTERNATIVES": 5,
    "HEATMAP_HOURS": 49,
    "WEATHER_MAX_UNIQUE_POINTS": 450,
    "WEATHER_GRID_SNAP_DEG": 0.05,
    "RDP_SIMPLIFY_EPSILON_MI": 0.031,  # ~50 m, docs/03 §5
}

PROVIDER_CACHE_TTL_S = {
    "weather": 30 * 60,
    "geocode": 24 * 60 * 60,
    "routes": 30 * 60,
}
