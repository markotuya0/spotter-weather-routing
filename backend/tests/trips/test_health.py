from rest_framework.test import APIClient


def test_health_returns_200_ok():
    client = APIClient()
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_response_has_request_id_header():
    client = APIClient()
    response = client.get("/api/health")
    assert "X-Request-ID" in response.headers
