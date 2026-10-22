"""Attaches a request id to every request/response (docs/04 §2: "Every
response includes header X-Request-ID"), success or error.
"""
from __future__ import annotations

import uuid


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        response = self.get_response(request)
        response.setdefault("X-Request-ID", request.request_id)
        return response
