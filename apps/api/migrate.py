import asyncio

from app.infrastructure.db.database import Base, get_engine
from app.infrastructure.db.models import AnalysisReportModel, ProjectModel  # noqa: F401


async def main():
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

if __name__ == "__main__":
    asyncio.run(main())
