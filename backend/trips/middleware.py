"""Attaches a request id to every request/response (docs/04 §2: "Every
response includes header X-Request-ID"), success or error.
"""
from __future__ import annotations

import uuid

from providers.http import request_id_var


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = str(uuid.uuid4())
        token = request_id_var.set(request.request_id)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response.setdefault("X-Request-ID", request.request_id)
        return response
