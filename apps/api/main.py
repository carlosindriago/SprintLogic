from fastapi import FastAPI

app = FastAPI(title="SpintLogic API")


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
