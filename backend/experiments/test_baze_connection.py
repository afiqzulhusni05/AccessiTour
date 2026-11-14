import requests

from app.config import settings


BASE_URL = "https://api.baze.co/v1/gateway"
MODEL = "gpt-5.6-luna"


response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={
        "Authorization": f"Bearer {settings.baze_api_key}",
        "Content-Type": "application/json",
    },
    json={
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": "Reply with exactly: AccessiTour BAZE connection works",
            }
        ],
    },
    timeout=60,
)

print("Status:", response.status_code)
print(response.text)