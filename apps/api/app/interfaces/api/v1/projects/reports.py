import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Reports"])
from sqlalchemy import select

IGNORE_DIRS = {
    "node_modules",
    ".git",
    ".next",
    "dist",
    "__pycache__",
    ".venv",
    "target",
    "build",
    ".turbo",
    "coverage",
}
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go", ".java", ".php"}
MAX_FILE_BYTES = 500_000


@router.get("/projects/{project_id}/reports")
async def get_project_reports(project_id: str, session: AsyncSession = Depends(get_db_session)):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from app.infrastructure.db.models import AnalysisReportModel
    from app.interfaces.api.v1.report_schemas import (
        AnalysisReportListResponse,
        AnalysisReportResponse,
    )

    result = await session.execute(
        select(AnalysisReportModel)
        .where(
            AnalysisReportModel.project_id == project_uuid,
            AnalysisReportModel.is_deleted.is_(False),
        )
        .order_by(AnalysisReportModel.created_at.desc())
    )
    reports = result.scalars().all()

    return AnalysisReportListResponse(
        reports=[AnalysisReportResponse.model_validate(r, from_attributes=True) for r in reports]
    )


@router.get("/projects/{project_id}/reports/trash")
async def get_project_reports_trash(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    from app.infrastructure.db.models import AnalysisReportModel
    from app.interfaces.api.v1.report_schemas import (
        AnalysisReportListResponse,
        AnalysisReportResponse,
    )

    result = await session.execute(
        select(AnalysisReportModel)
        .where(
            AnalysisReportModel.project_id == project_uuid, AnalysisReportModel.is_deleted.is_(True)
        )
        .order_by(AnalysisReportModel.created_at.desc())
    )
    reports = result.scalars().all()

    return AnalysisReportListResponse(
        reports=[AnalysisReportResponse.model_validate(r, from_attributes=True) for r in reports]
    )


@router.get("/projects/{project_id}/reports/{report_id}")
async def get_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from app.infrastructure.db.models import AnalysisReportModel
    from app.interfaces.api.v1.report_schemas import AnalysisReportResponse

    result = await session.execute(
        select(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return AnalysisReportResponse.model_validate(report, from_attributes=True)


@router.put("/projects/{project_id}/reports/{report_id}/trash")
async def trash_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from app.infrastructure.db.models import AnalysisReportModel

    result = await session.execute(
        select(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.is_deleted = True
    await session.commit()
    return {"status": "success", "message": "Report moved to trash"}


@router.put("/projects/{project_id}/reports/{report_id}/restore")
async def restore_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from app.infrastructure.db.models import AnalysisReportModel

    result = await session.execute(
        select(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    report = result.scalar_one_or_none()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    report.is_deleted = False
    await session.commit()
    return {"status": "success", "message": "Report restored"}


@router.delete("/projects/{project_id}/reports/{report_id}")
async def delete_project_report(
    project_id: str, report_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
        report_uuid = UUID(report_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID format")

    from sqlalchemy import delete

    from app.infrastructure.db.models import AnalysisReportModel

    result = await session.execute(
        delete(AnalysisReportModel).where(
            AnalysisReportModel.id == report_uuid, AnalysisReportModel.project_id == project_uuid
        )
    )
    if result.rowcount == 0:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail="Report not found")

    await session.commit()
    return {"status": "success", "message": "Report permanently deleted"}
