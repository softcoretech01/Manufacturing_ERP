from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

response = client.post("/api/v1/auth/login", json={"login_id": "admin", "password": "password"})
print("Status:", response.status_code)
print("Response:", response.json())
