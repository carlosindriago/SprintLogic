import asyncio
from app.infrastructure.ai.project_scanner import get_project_awareness_xml

async def main():
    import os
    project_path = os.getcwd()
    xml = await get_project_awareness_xml(project_path)
    print(xml)

if __name__ == "__main__":
    asyncio.run(main())
