def test_unknown_api_route_returns_json_404(client):
    response = client.get("/api/v1/not-found")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["detail"] == "接口不存在"
