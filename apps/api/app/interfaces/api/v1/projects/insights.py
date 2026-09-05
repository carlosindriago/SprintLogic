import logging
import os
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.db.database import get_db_session
from app.infrastructure.db.project_repository import SQLAlchemyProjectRepository
from app.infrastructure.git.git_gateway import LocalGitGateway

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Projects - Insights"])
from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import select

from app.infrastructure.db.models import GraphNodeModel

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
from app.infrastructure.kanban_sync import kanban_sync


@router.get("/insights/flow")
async def get_global_flow_insights(
    session: AsyncSession = Depends(get_db_session),
):
    """Telemetría global de todo el desarrollador, sin filtrar por proyecto."""
    return await _compute_flow_insights(session, project_id=None)


@router.get("/projects/{project_id}/insights/flow")
async def get_project_flow_insights(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return await _compute_flow_insights(session, project_id=project_id)


async def _compute_flow_insights(
    session: AsyncSession,
    project_id: str | None,
) -> dict[str, object]:

    deep_flow_hours = 0.0
    idle_breaks = 0
    golden_ratio = {"thinking": 0, "coding": 0, "testing": 0}
    heatmap = []
    heatmap_matrix: list[dict[str, object]] = []

    project_filter = "AND project_id = :pid" if project_id else ""
    params: dict[str, str] = {"pid": project_id} if project_id else {}

    try:
        flow_query = text(f"""
            WITH lagged AS (
                SELECT
                    window_start_ms,
                    window_end_ms,
                    LAG(window_end_ms) OVER (ORDER BY window_start_ms) as prev_end_ms
                FROM telemetry_pings
                WHERE timestamp >= date('now', '-6 days')
                  {project_filter}
            ),
            gaps AS (
                SELECT
                    window_start_ms,
                    window_end_ms,
                    prev_end_ms,
                    CASE WHEN prev_end_ms IS NULL OR (window_start_ms - prev_end_ms) > 300000 THEN 1 ELSE 0 END as is_gap
                FROM lagged
            ),
            sessions AS (
                SELECT
                    window_start_ms,
                    window_end_ms,
                    SUM(is_gap) OVER (ORDER BY window_start_ms) as session_id
                FROM gaps
            ),
            session_durations AS (
                SELECT
                    session_id,
                    (MAX(window_end_ms) - MIN(window_start_ms)) as duration_ms
                FROM sessions
                GROUP BY session_id
            )
            SELECT
                (SELECT SUM(duration_ms) FROM session_durations) / 3600000.0 as deep_flow_hours,
                (SELECT SUM(is_gap) FROM gaps WHERE prev_end_ms IS NOT NULL) as idle_breaks
        """)
        flow_result = await session.execute(flow_query, params)
        flow_row = flow_result.fetchone()
        if flow_row:
            deep_flow_hours = round(flow_row[0] or 0.0, 2)
            idle_breaks = max(0, flow_row[1] or 0)

        ratio_query = text(f"""
            SELECT
                SUM(thinking_ms) as t,
                SUM(coding_ms) as c,
                SUM(testing_ms) as ts
            FROM telemetry_pings
            WHERE timestamp >= date('now', '-6 days')
              {project_filter}
        """)
        ratio_result = await session.execute(ratio_query, params)
        r_row = ratio_result.fetchone()
        if r_row:
            golden_ratio = {
                "thinking": r_row[0] or 0,
                "coding": r_row[1] or 0,
                "testing": r_row[2] or 0,
            }

        heatmap_query = text(f"""
            SELECT
                strftime('%H', timestamp) as hour,
                SUM(thinking_ms + coding_ms + testing_ms) as total_ms
            FROM telemetry_pings
            WHERE timestamp >= date('now', '-6 days')
              {project_filter}
            GROUP BY hour
            ORDER BY hour
        """)
        heatmap_result = await session.execute(heatmap_query, params)
        for row in heatmap_result.fetchall():
            if row[0]:
                heatmap.append({"hour": f"{row[0]}:00", "activity": row[1] or 0})

        heatmap_matrix_query = text(f"""
            SELECT
                date(timestamp) as day,
                strftime('%H', timestamp) as hour,
                SUM(thinking_ms + coding_ms + testing_ms) as total_ms
            FROM telemetry_pings
            WHERE timestamp >= date('now', '-6 days')
              {project_filter}
            GROUP BY day, hour
            ORDER BY day, hour
        """)
        matrix_result = await session.execute(heatmap_matrix_query, params)
        for row in matrix_result.fetchall():
            if row[0] and row[1]:
                heatmap_matrix.append(
                    {
                        "date": row[0],
                        "hour": f"{row[1]}:00",
                        "activity": row[2] or 0,
                    }
                )
    except Exception as e:
        import logging

        logging.error(f"Telemetry query failed: {e}")

    return {
        "deep_flow_hours": deep_flow_hours,
        "idle_breaks": idle_breaks,
        "golden_ratio": golden_ratio,
        "heatmap": heatmap,
        "heatmap_matrix": heatmap_matrix,
    }


@router.get("/projects/{project_id}/insights/repo")
async def get_project_repo_insights(
    project_id: str, session: AsyncSession = Depends(get_db_session)
):
    from app.infrastructure.db.models import GraphEdgeModel

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid project ID format")

    repo = SQLAlchemyProjectRepository(session)
    project = await repo.get_project(project_uuid)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    tasks_by_state = {"todo": 0, "in_progress": 0, "test": 0, "done": 0}
    try:
        import asyncio

        tasks = await asyncio.to_thread(kanban_sync.read_tasks, project.path)
        for t in tasks:
            st = "in_progress" if t.get("status") == "in-progress" else t.get("status")
            if st in tasks_by_state:
                tasks_by_state[st] += 1
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    nodes_result = await session.execute(
        select(GraphNodeModel.file_path).where(GraphNodeModel.project_id == project_uuid)
    )
    extensions: dict[str, int] = {}
    for (file_path,) in nodes_result:
        ext = os.path.splitext(file_path)[1]
        if ext:
            ext = ext[1:].lower()
            extensions[ext] = extensions.get(ext, 0) + 1

    sorted_items = sorted(extensions.items(), key=lambda item: item[1], reverse=True)
    sorted_exts = [{"name": k, "value": v} for k, v in sorted_items]

    git_gateway = LocalGitGateway()
    total_commits = 0
    active_branches = 0
    velocity = 0
    recent_commits: list[dict[str, object]] = []
    try:
        out_commits = await git_gateway._run_command(project.path, "rev-list", "--all", "--count")
        total_commits = int(out_commits)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    try:
        out_branches = await git_gateway._run_command(project.path, "branch")
        active_branches = len([b for b in out_branches.split("\n") if b.strip()])
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    velocity_history = []
    try:
        out_velocity = await git_gateway._run_command(
            project.path, "rev-list", "--count", '--since="7 days ago"', "HEAD"
        )
        velocity = int(out_velocity) if out_velocity.strip().isdigit() else 0

        # Calculate daily velocity history
        out_history = await git_gateway._run_command(
            project.path, "log", "--since=7 days ago", "--date=short", "--pretty=format:%ad"
        )
        counts = Counter(out_history.splitlines())
        today = datetime.now().date()
        for i in range(6, -1, -1):
            d = (today - timedelta(days=i)).strftime("%Y-%m-%d")
            velocity_history.append({"day": d, "commits": counts.get(d, 0)})
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    try:
        recent_commits = await git_gateway.get_recent_commits(project.path, limit=5)
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    # Calculate Top Hotspots
    top_hotspots: list[dict[str, Any]] = []
    from sqlalchemy import func, union_all
    try:
        stmt1 = select(GraphEdgeModel.source_id.label('node_id')).where(GraphEdgeModel.project_id == project_uuid)
        stmt2 = select(GraphEdgeModel.target_id.label('node_id')).where(GraphEdgeModel.project_id == project_uuid)
        subq = union_all(stmt1, stmt2).alias('all_edges')

        count_stmt = select(
            subq.c.node_id,
            func.count().label('impact_score')
        ).group_by(subq.c.node_id).order_by(func.count().desc()).limit(5).subquery('top_edges')

        final_stmt = select(
            GraphNodeModel.file_path,
            count_stmt.c.impact_score
        ).join(
            count_stmt,
            GraphNodeModel.id == count_stmt.c.node_id
        ).where(GraphNodeModel.project_id == project_uuid).order_by(count_stmt.c.impact_score.desc())

        top_res = await session.execute(final_stmt)

        for row in top_res:
            top_hotspots.append(
                {"path": row.file_path, "impact_score": row.impact_score, "friction": 0}
            )
    except Exception:
        logger.warning("Unhandled exception", exc_info=True)

    return {
        "tasks_by_state": tasks_by_state,
        "language_distribution": sorted_exts,
        "total_commits": total_commits,
        "active_branches": active_branches,
        "velocity": velocity,
        "velocity_history": velocity_history,
        "recent_commits": recent_commits,
        "top_hotspots": top_hotspots,
    }
