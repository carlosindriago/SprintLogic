import json
import os
import re
from typing import Any

from app.infrastructure.file_watcher import file_watcher


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text


class KanbanSyncService:
    """Synchronizes tasks between a local tasks.md file and the Kanban board UI."""

    def __init__(self):
        pass

    def get_tasks_file_path(self, project_path: str) -> str:
        return os.path.join(project_path, "tasks.md")

    def get_config(self, project_path: str) -> dict[str, Any]:
        config_path = os.path.join(project_path, "kanban_config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass

        # Default configuration matching the custom test column flow
        return {
            "columns": [
                {"id": "todo", "title": "To Do", "color": "border-zinc-500", "rule": "manual"},
                {
                    "id": "in-progress",
                    "title": "In Progress",
                    "color": "border-blue-500",
                    "rule": "pomodoro",
                },
                {
                    "id": "test",
                    "title": "Test",
                    "color": "border-purple-500",
                    "rule": "auto-on-test-fail",
                },
                {
                    "id": "done",
                    "title": "Done",
                    "color": "border-green-500",
                    "rule": "auto-on-test-pass",
                },
            ]
        }

    def save_config(self, project_path: str, config: dict[str, Any]):
        config_path = os.path.join(project_path, "kanban_config.json")
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

    def read_tasks(self, project_path: str) -> list[dict[str, Any]]:
        """Parses tasks.md into a list of tasks for the UI."""
        filepath = self.get_tasks_file_path(project_path)
        if not os.path.exists(filepath):
            return []

        with open(filepath, encoding="utf-8") as f:
            lines = f.readlines()

        tasks = []
        current_column_title = "To Do"  # Default column title

        for idx, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue

            # Check for headers to determine column/status
            if line.startswith("# "):
                current_column_title = line[2:].strip()
            elif line.startswith("## "):
                current_column_title = line[3:].strip()

            # Check for tasks: - [ ] Task name
            match = re.match(r"-\s*\[(x| |/|-)\]\s*(.*)", line, re.IGNORECASE)
            if match:
                full_content = match.group(2).strip()

                # Extract HTML comment metadata
                meta = {}
                comment_match = re.search(r"<!--\s*(.*?)\s*-->", full_content)
                if comment_match:
                    comment_content = comment_match.group(1)
                    # Extract key:value pairs
                    pairs = re.findall(r"([a-zA-Z0-9_-]+):([^\s]+)", comment_content)
                    for k, v in pairs:
                        meta[k] = v
                    # Strip HTML comment from content
                    full_content = re.sub(r"<!--\s*(.*?)\s*-->", "", full_content).strip()

                # Extract AST affected nodes (@type:path)
                affected_nodes = []
                tag_matches = re.finditer(r"@([a-zA-Z0-9_]+):([a-zA-Z0-9_./-]+)", full_content)
                for tag_match in tag_matches:
                    affected_nodes.append(f"{tag_match.group(1)}:{tag_match.group(2)}")

                content = re.sub(r"@[a-zA-Z0-9_]+:[a-zA-Z0-9_./-]+", "", full_content).strip()

                # Status is slug of current header
                status = slugify(current_column_title)

                # Check for ID (e.g. task_id:SPRT-42)
                task_id = meta.get("task_id")

                tasks.append(
                    {
                        "id": task_id if task_id else f"task-{idx}",
                        "content": content,
                        "status": status,
                        "category": current_column_title,
                        "affected_nodes": affected_nodes,
                        "raw_line": idx,
                        "commit": meta.get("commit"),
                        "pomodoros": int(meta.get("pomodoros", 0)),
                        "time_spent": int(meta.get("time_spent", 0)),
                        "priority": meta.get("priority", "Medium"),
                        "tags": meta.get("tags", "").split(",") if meta.get("tags") else [],
                        "has_id": bool(task_id),
                    }
                )

        return tasks

    def write_tasks(self, project_path: str, tasks: list[dict[str, Any]]):
        """Writes the updated tasks back to tasks.md and registers the backend write."""
        filepath = self.get_tasks_file_path(project_path)

        # Read config to get correct columns and their order
        config = self.get_config(project_path)
        column_map = {col["id"]: col["title"] for col in config["columns"]}
        column_ids = [col["id"] for col in config["columns"]]

        # Assign short IDs if missing
        existing_ids = []
        for task in tasks:
            tid = task.get("id", "")
            if tid.startswith("SPRT-"):
                try:
                    existing_ids.append(int(tid.split("-")[1]))
                except ValueError:
                    pass

        next_id_num = max(existing_ids) + 1 if existing_ids else 1

        # Group tasks by column status
        from typing import Any

        tasks_by_column: dict[str, list[dict[str, Any]]] = {col_id: [] for col_id in column_ids}
        for task in tasks:
            status = task.get("status", "todo")
            if status not in tasks_by_column:
                status = "todo"

            # Generate short ID if needed
            tid = task.get("id", "")
            if not tid.startswith("SPRT-") or task.get("id") == f"task-{task.get('raw_line')}":
                task["id"] = f"SPRT-{next_id_num}"
                next_id_num += 1

            tasks_by_column[status].append(task)

        lines = []
        for col_id in column_ids:
            col_title = column_map.get(col_id, col_id.capitalize())
            lines.append(f"## {col_title}")
            lines.append("")

            for task in tasks_by_column[col_id]:
                # Status checkboxes matching task states
                status_char = " "
                if col_id == "done":
                    status_char = "x"
                elif col_id == "in-progress":
                    status_char = "/"

                content = task["content"]

                # Tags string
                affected_nodes = task.get("affected_nodes", [])
                tags_str = ""
                if affected_nodes:
                    tags_str = " " + " ".join([f"@{node}" for node in affected_nodes])

                # Metadata HTML comment
                meta_parts = []
                meta_parts.append(f"task_id:{task['id']}")
                if task.get("commit"):
                    meta_parts.append(f"commit:{task['commit']}")
                if task.get("pomodoros"):
                    meta_parts.append(f"pomodoros:{task['pomodoros']}")
                if task.get("time_spent"):
                    meta_parts.append(f"time_spent:{task['time_spent']}")
                if task.get("priority"):
                    meta_parts.append(f"priority:{task['priority']}")
                if task.get("tags"):
                    meta_parts.append(f"tags:{','.join(task['tags'])}")

                meta_comment = f" <!-- {' '.join(meta_parts)} -->"
                lines.append(f"- [{status_char}] {content}{tags_str}{meta_comment}")

            lines.append("")

        content = "\n".join(lines)

        # Protect against infinite loop: mark as backend write before writing
        file_watcher.mark_backend_write(filepath, content)

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)


kanban_sync = KanbanSyncService()
