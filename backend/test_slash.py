import asyncio
from fastapi.testclient import TestClient
from app.main import create_app

def test():
    app = create_app()
    client = TestClient(app)
    response = client.get('/api/v1/items/')
    print("With slash:", response.status_code)
    
    response = client.get('/api/v1/items')
    print("Without slash:", response.status_code)

if __name__ == "__main__":
    test()
