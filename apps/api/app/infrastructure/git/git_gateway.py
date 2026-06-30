import asyncio
import os
from typing import List, Dict, Any
from app.domain.git_models import GitBranch, GitCommit

class LocalGitGateway:
    async def _run_command(self, repo_path: str, *args) -> str:
        process = await asyncio.create_subprocess_exec(
            'git', *args,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"Git command failed: {stderr.decode('utf-8').strip()}")
        return stdout.decode('utf-8').strip()

    async def get_current_branch(self, repo_path: str) -> GitBranch:
        try:
            branch_name = await self._run_command(repo_path, 'branch', '--show-current')
            return GitBranch(name=branch_name, is_active=True)
        except RuntimeError:
            return GitBranch(name="unknown", is_active=False)

    async def get_recent_commits(self, repo_path: str, limit: int = 100) -> List[Dict[str, Any]]:
        # Using a rich format for @gitgraph/react
        # %H: commit hash, %P: parent hashes, %s: subject, %an: author name, %ae: author email, %cI: commit date
        try:
            output = await self._run_command(repo_path, 'log', f'-n{limit}', '--format=%H|%P|%s|%an|%ae|%cI')
            commits = []
            for line in output.split('\n'):
                if not line:
                    continue
                parts = line.split('|', 5)
                if len(parts) == 6:
                    commits.append({
                        "hash": parts[0],
                        "parents": parts[1].split() if parts[1] else [],
                        "subject": parts[2],
                        "author": parts[3],
                        "email": parts[4],
                        "date": parts[5]
                    })
            return commits
        except RuntimeError:
            return []

    async def get_status(self, repo_path: str) -> Dict[str, Any]:
        try:
            status_output = await self._run_command(repo_path, 'status', '--porcelain')
            branch = await self.get_current_branch(repo_path)
            
            modified = 0
            untracked = 0
            
            for line in status_output.split('\n'):
                if not line:
                    continue
                code = line[:2]
                if '??' in code:
                    untracked += 1
                else:
                    modified += 1
                    
            return {
                "branch": branch.name,
                "modified": modified,
                "untracked": untracked,
                "raw_output": status_output
            }
        except RuntimeError as e:
            return {"error": str(e)}

    async def execute_action(self, repo_path: str, action: str, message: str = "") -> Dict[str, str]:
        try:
            if action == 'pull':
                out = await self._run_command(repo_path, 'pull')
            elif action == 'push':
                out = await self._run_command(repo_path, 'push')
            elif action == 'commit':
                await self._run_command(repo_path, 'add', '.')
                out = await self._run_command(repo_path, 'commit', '-m', message or "Automated commit from SprintLogic")
            elif action == 'stash':
                out = await self._run_command(repo_path, 'stash')
            else:
                raise ValueError(f"Unknown action: {action}")
            return {"status": "success", "output": out}
        except RuntimeError as e:
            return {"status": "error", "message": str(e)}

    async def get_commit_diff(self, repo_path: str, commit_hash: str) -> str:
        return await self._run_command(repo_path, 'show', commit_hash)
