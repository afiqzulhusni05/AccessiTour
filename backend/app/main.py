from fastapi import FastAPI

app = FastAPI(title="AccessiTour API")


@app.get("/api/v1/health")
def health():
    return {"status": "ok"}