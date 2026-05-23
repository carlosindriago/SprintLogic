from fastapi import FastAPI

from app.interfaces.api.v1.organizations import router as organizations_router

app = FastAPI(title="SpintLogic API")

app.include_router(organizations_router, prefix="/api/v1")


@app.get("/health")
async def healthcheck() -> dict[str, str]:
    return {"status": "ok"}
