import asyncio

from app.infrastructure.db.database import engine
from app.infrastructure.db.models import Base


async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


if __name__ == "__main__":
    asyncio.run(init_models())
