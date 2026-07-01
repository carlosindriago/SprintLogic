import asyncio
import os
from typing import List, Dict, Any, Optional
from app.domain.git_models import GitBranch, GitCommit


class UnmergedBranchError(RuntimeError):
    """Raised when deleting a branch that has not been fully merged."""

    def __init__(self, message: str, requires_force: bool = True):
        super().__init__(message)
        self.requires_force = requires_force


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

    async def get_diff(self, repo_path: str) -> str:
        """
        Returns a diff of current working tree changes without modifying it.
        Uses `git diff HEAD` so the AI sees the cumulative delta against the
        last commit (staged + unstaged) but NEVER stages anything on behalf
        of the user. Useful for generating AI commit message suggestions.
        """
        try:
            diff = await self._run_command(repo_path, 'diff', 'HEAD')
            return diff
        except RuntimeError as e:
            raise RuntimeError(f"Error getting diff: {e}")

    async def execute_action(self, repo_path: str, action: str, message: str = "") -> Dict[str, str]:
        try:
            if action in ('pull', 'push'):
                current_branch = await self._run_command(repo_path, 'branch', '--show-current')
                current_branch = current_branch.strip()
                if not current_branch:
                    raise RuntimeError("No hay rama actual")
                
                if action == 'pull':
                    out = await self._run_command(repo_path, 'pull', 'origin', current_branch)
                else: # push
                    out = await self._run_command(repo_path, 'push', '-u', 'origin', current_branch)
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

    async def get_commit_details(self, repo_path: str, commit_hash: str) -> Dict[str, Any]:
        try:
            # Format: %H|%an|%cI|%s
            output = await self._run_command(repo_path, 'show', '--name-status', '--format=%H|%an|%cI|%s', commit_hash)
            lines = output.split('\n')
            if not lines:
                raise RuntimeError("Empty output")
            
            # First line is the metadata
            meta_parts = lines[0].split('|', 3)
            
            files = []
            # Skip the first line and any empty lines, then parse file statuses
            for line in lines[1:]:
                if not line.strip():
                    continue
                parts = line.split('\t', 1)
                if len(parts) == 2:
                    status = parts[0].strip()
                    file_path = parts[1].strip()
                    files.append({"status": status, "path": file_path})
                    
            return {
                "hash": meta_parts[0] if len(meta_parts) > 0 else commit_hash,
                "author": meta_parts[1] if len(meta_parts) > 1 else "",
                "date": meta_parts[2] if len(meta_parts) > 2 else "",
                "message": meta_parts[3] if len(meta_parts) > 3 else "",
                "files": files
            }
        except RuntimeError as e:
            return {"error": str(e)}

    async def get_file_at_commit(self, repo_path: str, commit_hash: str, file_path: str) -> str:
        try:
            return await self._run_command(repo_path, 'show', f'{commit_hash}:{file_path}')
        except RuntimeError:
            return ""

    # -------------------------------------------------------------------------
    # Advanced Git operations
    # -------------------------------------------------------------------------

    async def validate_ref_name(self, name: str) -> bool:
        """
        Validates a branch name by running `git check-ref-format --branch <name>`.
        Returns True if valid, False otherwise. Does NOT use regex.
        """
        process = await asyncio.create_subprocess_exec(
            'git', 'check-ref-format', '--branch', name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await process.communicate()
        return process.returncode == 0

    async def get_branches(self, repo_path: str) -> List[Dict]:
        """
        Returns a list of local branches with tracking info.
        Each dict: {name, is_current, has_upstream, ahead, behind, is_local_only}
        """
        # Run for-each-ref to get structured tracking info
        fmt = '%(refname:short)|%(upstream:trackshort)|%(push:trackshort)'
        try:
            ref_output = await self._run_command(
                repo_path, 'for-each-ref', f'--format={fmt}', 'refs/heads/'
            )
        except RuntimeError:
            ref_output = ''

        # Build a map of branch -> (upstream_trackshort, push_trackshort)
        tracking_map: Dict[str, Dict] = {}
        for line in ref_output.split('\n'):
            if not line:
                continue
            parts = line.split('|')
            branch_name = parts[0] if len(parts) > 0 else ''
            upstream_track = parts[1] if len(parts) > 1 else ''
            if branch_name:
                ahead = 0
                behind = 0
                # Parse trackshort format, e.g. "[ahead 2, behind 1]" or "[ahead 1]"
                if upstream_track:
                    import re
                    ahead_match = re.search(r'ahead (\d+)', upstream_track)
                    behind_match = re.search(r'behind (\d+)', upstream_track)
                    if ahead_match:
                        ahead = int(ahead_match.group(1))
                    if behind_match:
                        behind = int(behind_match.group(1))
                tracking_map[branch_name] = {
                    'has_upstream': bool(upstream_track),
                    'ahead': ahead,
                    'behind': behind,
                }

        # Run git branch -vv to get current branch marker
        try:
            branch_output = await self._run_command(repo_path, 'branch', '-vv')
        except RuntimeError:
            branch_output = ''

        branches = []
        for line in branch_output.split('\n'):
            if not line:
                continue
            is_current = line.startswith('*')
            # Strip the leading '* ' or '  '
            rest = line[2:]
            # Branch name is the first token
            name = rest.split()[0] if rest.split() else ''
            if not name:
                continue

            track_info = tracking_map.get(name, {'has_upstream': False, 'ahead': 0, 'behind': 0})
            branches.append({
                'name': name,
                'is_current': is_current,
                'has_upstream': track_info['has_upstream'],
                'ahead': track_info['ahead'],
                'behind': track_info['behind'],
                'is_local_only': not track_info['has_upstream'],
            })

        return branches

    async def get_sync_status(self, repo_path: str) -> Dict:
        """
        Returns {branch, ahead, behind, is_merge_in_progress}.
        Handles the case where no upstream tracking branch exists.
        """
        branch = await self.get_current_branch(repo_path)
        ahead = 0
        behind = 0

        try:
            behind_str = await self._run_command(repo_path, 'rev-list', '--count', 'HEAD..@{u}')
            behind = int(behind_str.strip()) if behind_str.strip().isdigit() else 0
        except RuntimeError:
            # No upstream configured
            pass

        try:
            ahead_str = await self._run_command(repo_path, 'rev-list', '--count', '@{u}..HEAD')
            ahead = int(ahead_str.strip()) if ahead_str.strip().isdigit() else 0
        except RuntimeError:
            # No upstream configured
            pass

        return {
            'branch': branch.name,
            'ahead': ahead,
            'behind': behind,
            'is_merge_in_progress': await self.is_merge_in_progress(repo_path),
        }

    async def get_remote_url(self, repo_path: str, remote_name: str = 'origin') -> str:
        """
        Returns the URL for the specified remote (e.g., origin).
        """
        try:
            url = await self._run_command(repo_path, 'remote', 'get-url', remote_name)
            return url.strip()
        except RuntimeError:
            return ""

    async def add_remote(self, repo_path: str, remote_name: str, url: str) -> str:
        """
        Adds a new remote or updates an existing one.
        """
        try:
            # First try to set-url in case it exists but is wrong
            return await self._run_command(repo_path, 'remote', 'set-url', remote_name, url)
        except RuntimeError:
            # If it doesn't exist, add it
            return await self._run_command(repo_path, 'remote', 'add', remote_name, url)

    async def verify_remote(self, repo_path: str, remote_name: str = 'origin') -> bool:
        """
        Verifies the remote connection using ls-remote.
        """
        try:
            await self._run_command(repo_path, 'ls-remote', '--exit-code', remote_name)
            return True
        except RuntimeError:
            return False

    async def checkout(self, repo_path: str, target: str) -> str:
        """
        Runs `git checkout <target>`.
        Raises RuntimeError if a dirty working tree prevents the checkout.
        """
        try:
            return await self._run_command(repo_path, 'checkout', target)
        except RuntimeError as e:
            error_msg = str(e)
            if 'your local changes' in error_msg.lower() or 'please commit' in error_msg.lower():
                raise RuntimeError(f"Dirty working tree prevents checkout: {error_msg}")
            raise

    async def create_branch(self, repo_path: str, branch_name: str, start_point: Optional[str] = None) -> str:
        """
        Creates a new branch. Optionally starting from start_point.
        """
        if start_point:
            return await self._run_command(repo_path, 'branch', branch_name, start_point)
        return await self._run_command(repo_path, 'branch', branch_name)

    async def merge(self, repo_path: str, source_branch: str) -> str:
        """Merges source_branch into the current branch."""
        return await self._run_command(repo_path, 'merge', source_branch)

    async def delete_branch(self, repo_path: str, branch_name: str, force: bool = False) -> str:
        """
        Deletes a branch.
        - If force=False and branch is not fully merged, raises UnmergedBranchError(requires_force=True).
        - If force=True, uses `git branch -D`.
        """
        if force:
            return await self._run_command(repo_path, 'branch', '-D', branch_name)

        try:
            return await self._run_command(repo_path, 'branch', '-d', branch_name)
        except RuntimeError as e:
            error_msg = str(e)
            error_msg_lower = error_msg.lower()
            if 'not fully merged' in error_msg_lower or 'no ha sido fusionada' in error_msg_lower or 'is not fully merged' in error_msg_lower:
                raise UnmergedBranchError(
                    f"Branch '{branch_name}' is not fully merged. Use force=True to delete anyway.",
                    requires_force=True,
                )
            raise

    async def reset(self, repo_path: str, commit_hash: str, mode: str) -> str:
        """
        Runs `git reset --<mode> <commit_hash>`.
        mode is MANDATORY and must be one of: 'soft', 'mixed', 'hard'.
        """
        valid_modes = ('soft', 'mixed', 'hard')
        if mode not in valid_modes:
            raise ValueError(f"Invalid reset mode '{mode}'. Must be one of: {valid_modes}")
        return await self._run_command(repo_path, 'reset', f'--{mode}', commit_hash)

    async def revert(self, repo_path: str, commit_hash: str) -> str:
        """Creates a new commit that undoes the changes introduced by commit_hash."""
        return await self._run_command(repo_path, 'revert', '--no-edit', commit_hash)

    async def cherry_pick(self, repo_path: str, commit_hash: str) -> str:
        """Applies the changes introduced by commit_hash onto the current branch."""
        return await self._run_command(repo_path, 'cherry-pick', commit_hash)

    async def is_merge_in_progress(self, repo_path: str) -> bool:
        """Returns True if a merge is currently in progress (MERGE_HEAD file exists)."""
        merge_head_path = os.path.join(repo_path, '.git', 'MERGE_HEAD')
        return os.path.exists(merge_head_path)
