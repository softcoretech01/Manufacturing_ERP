import asyncio
from fastapi.testclient import TestClient
from app.main import create_app

def test():
    app = create_app()
    client = TestClient(app)
    response = client.get('/api/v1/items')
    print("Status:", response.status_code)
    try:
        print("Response:", response.json())
    except Exception as e:
        print("Error parsing json:", e)

if __name__ == "__main__":
    test()
