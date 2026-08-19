import os
import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.infrastructure.db.database import get_sessionmaker
from app.infrastructure.db.models import ProjectModel
from app.main import app


@pytest.mark.asyncio
async def test_legal_studio_tool_model_override():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check tool model mapping deletion is idempotent for legal_studio
        response = await client.delete("/api/v1/settings/tool-models/legal_studio")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        assert data["tool_name"] == "legal_studio"


@pytest.mark.asyncio
async def test_legal_studio_save_and_list_docs():
    tmp_dir = tempfile.mkdtemp()
    project_id = uuid4()

    try:
        # Create a mock project in DB
        sessionmaker = get_sessionmaker()
        async with sessionmaker() as session:
            project = ProjectModel(
                id=project_id,
                name="Test Legal Project",
                path=tmp_dir,
            )
            session.add(project)
            await session.commit()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. List docs when folder is empty
            res = await client.get(f"/api/v1/projects/{project_id}/legal/docs")
            assert res.status_code == 200
            assert res.json()["documents"] == []

            # 2. Save a legal doc
            doc_content = "# Terms of Service\n\nWelcome to SprintLogic."
            save_res = await client.post(
                f"/api/v1/projects/{project_id}/legal/save-docs",
                json={
                    "doc_name": "terms_of_service.md",
                    "content": doc_content,
                },
            )
            assert save_res.status_code == 200
            save_data = save_res.json()
            assert save_data["status"] == "success"
            assert save_data["file_path"] == "docs/legal/terms_of_service.md"
            assert save_data["doc_name"] == "terms_of_service.md"

            # Check physical file on disk
            saved_file = Path(tmp_dir) / "docs" / "legal" / "terms_of_service.md"
            assert saved_file.exists()
            assert saved_file.read_text(encoding="utf-8") == doc_content

            # 3. List docs again
            list_res = await client.get(f"/api/v1/projects/{project_id}/legal/docs")
            assert list_res.status_code == 200
            docs = list_res.json()["documents"]
            assert len(docs) == 1
            assert docs[0]["name"] == "terms_of_service.md"
            assert docs[0]["content"] == doc_content

            # 4. Save root LICENSE
            license_content = "MIT License\n\nCopyright (c) 2026 SprintLogic"
            save_lic_res = await client.post(
                f"/api/v1/projects/{project_id}/legal/save-docs",
                json={
                    "doc_name": "LICENSE",
                    "content": license_content,
                },
            )
            assert save_lic_res.status_code == 200
            save_lic_data = save_lic_res.json()
            assert save_lic_data["status"] == "success"
            assert save_lic_data["file_path"] == "LICENSE"
            assert save_lic_data["doc_name"] == "LICENSE"

            # Check physical file on root
            root_license_file = Path(tmp_dir) / "LICENSE"
            assert root_license_file.exists()
            assert root_license_file.read_text(encoding="utf-8") == license_content

            # 5. List docs should now include root LICENSE
            list_res2 = await client.get(f"/api/v1/projects/{project_id}/legal/docs")
            assert list_res2.status_code == 200
            docs2 = list_res2.json()["documents"]
            assert any(d["name"] == "LICENSE" and d["relative_path"] == "LICENSE" for d in docs2)

            # 6. Create mitigation tasks
            tasks_res = await client.post(
                f"/api/v1/projects/{project_id}/legal/mitigation-tasks",
                json={
                    "tasks": [
                        {
                            "title": "Implementar Cookie Consent Banner",
                            "description": "Requerido por GDPR para cookies analíticas.",
                            "priority": "high",
                            "category": "cookies",
                        }
                    ]
                },
            )
            assert tasks_res.status_code == 200
            task_data = tasks_res.json()
            assert task_data["status"] == "success"
            assert task_data["created_count"] == 1
            assert len(task_data["ticket_ids"]) == 1

    finally:
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)

