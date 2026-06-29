import asyncio
import os
from typing import List
from app.domain.git_models import GitBranch, GitCommit

class LocalGitGateway:
    async def get_current_branch(self, repo_path: str) -> GitBranch:
        process = await asyncio.create_subprocess_exec(
            'git', 'branch', '--show-current',
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"Git command failed: {stderr.decode('utf-8').strip()}")
        branch_name = stdout.decode('utf-8').strip()
        return GitBranch(name=branch_name, is_active=True)

    async def get_recent_commits(self, repo_path: str, limit: int = 10) -> List[GitCommit]:
        process = await asyncio.create_subprocess_exec(
            'git', 'log', f'-n{limit}', '--format=%H|%s|%an|%cI',
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"Git command failed: {stderr.decode('utf-8').strip()}")
        
        commits = []
        for line in stdout.decode('utf-8').strip().split('\n'):
            if not line:
                continue
            parts = line.split('|', 3)
            if len(parts) == 4:
                commits.append(GitCommit(
                    hash=parts[0],
                    message=parts[1],
                    author=parts[2],
                    timestamp=parts[3]
                ))
        return commits

    async def get_commit_diff(self, repo_path: str, commit_hash: str) -> str:
        process = await asyncio.create_subprocess_exec(
            'git', 'show', commit_hash,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"Git command failed: {stderr.decode('utf-8').strip()}")
        return stdout.decode('utf-8')
