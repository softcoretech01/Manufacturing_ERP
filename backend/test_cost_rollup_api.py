import asyncio
import httpx

async def main():
    async with httpx.AsyncClient() as client:
        # Assuming the app runs on localhost:8000
        # Wait, the app is not running. I'll just write a script that instantiates the app or test client
        from fastapi.testclient import TestClient
        from app.main import create_app
        app = create_app()
        client = TestClient(app)
        
        # Test item_code
        item_code = "FG-0001"
        response = client.post(f"/api/v1/engineering/cost-rollup/{item_code}")
        print("Status:", response.status_code)
        print("Response:", response.json())

if __name__ == "__main__":
    asyncio.run(main())
