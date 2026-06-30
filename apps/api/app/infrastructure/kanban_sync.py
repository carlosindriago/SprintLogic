import os
import re
from typing import List, Dict, Any
from app.infrastructure.file_watcher import file_watcher

class KanbanSyncService:
    """Synchronizes tasks between a local tasks.md file and the Kanban board UI."""
    
    def __init__(self):
        pass

    def get_tasks_file_path(self, project_path: str) -> str:
        return os.path.join(project_path, "tasks.md")

    def read_tasks(self, project_path: str) -> List[Dict[str, Any]]:
        """Parses tasks.md into a list of tasks for the UI."""
        filepath = self.get_tasks_file_path(project_path)
        if not os.path.exists(filepath):
            return []

        tasks = []
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

        current_category = "Backlog" # Default category
        
        for idx, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
                
            # Check for headers to determine category
            if line.startswith("# "):
                current_category = line[2:].strip()
            elif line.startswith("## "):
                current_category = line[3:].strip()
            
            # Check for tasks: - [ ] Task name
            match = re.match(r"-\s*\[(x| |/|-)\]\s*(.*)", line, re.IGNORECASE)
            if match:
                status_char = match.group(1).lower()
                full_content = match.group(2).strip()
                
                affected_nodes = []
                tag_matches = re.finditer(r"@([a-zA-Z0-9_]+):([a-zA-Z0-9_./-]+)", full_content)
                for tag_match in tag_matches:
                    affected_nodes.append(f"{tag_match.group(1)}:{tag_match.group(2)}")
                
                content = re.sub(r"@[a-zA-Z0-9_]+:[a-zA-Z0-9_./-]+", "", full_content).strip()
                
                status = "todo"
                if status_char == "x":
                    status = "done"
                elif status_char == "/":
                    status = "in-progress"
                    
                tasks.append({
                    "id": f"task-{idx}",
                    "content": content,
                    "status": status,
                    "category": current_category,
                    "affected_nodes": affected_nodes,
                    "raw_line": idx
                })
                
        return tasks

    def write_tasks(self, project_path: str, tasks: List[Dict[str, Any]]):
        """Writes the updated tasks back to tasks.md and registers the backend write."""
        filepath = self.get_tasks_file_path(project_path)
        
        # Group tasks by category
        categories = {}
        for task in tasks:
            cat = task.get("category", "Backlog")
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(task)
            
        lines = []
        for cat, cat_tasks in categories.items():
            lines.append(f"## {cat}")
            lines.append("")
            for task in cat_tasks:
                status_char = " "
                if task["status"] == "done":
                    status_char = "x"
                elif task["status"] == "in-progress":
                    status_char = "/"
                
                content = task['content']
                affected_nodes = task.get('affected_nodes', [])
                if affected_nodes:
                    tags = " ".join([f"@{node}" for node in affected_nodes])
                    lines.append(f"- [{status_char}] {content} {tags}")
                else:
                    lines.append(f"- [{status_char}] {content}")
            lines.append("")
            
        content = "\n".join(lines)
        
        # Protect against infinite loop: mark as backend write before writing
        file_watcher.mark_backend_write(filepath, content)
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

kanban_sync = KanbanSyncService()
