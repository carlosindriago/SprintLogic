import asyncio
import json
import logging
import os
from typing import Any

from app.domain.git_models import GitBranch

_audit_log = logging.getLogger("sprintlogic.audit")


class UnmergedBranchError(RuntimeError):
    """Raised when deleting a branch that has not been fully merged."""

    def __init__(self, message: str, requires_force: bool = True):
        super().__init__(message)
        self.requires_force = requires_force


class LocalGitGateway:
    async def _run_command(self, repo_path: str, *args: str) -> str:
        process = await asyncio.create_subprocess_exec(
            "git",
            *args,
            cwd=repo_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError(f"Git command failed: {stderr.decode('utf-8').strip()}")
        return stdout.decode("utf-8").strip()

    def _audit(self, action: str, repo_path: str, outcome: str, **kwargs: Any) -> None:
        _audit_log.info(
            "GIT_ACTION | action=%s | repo=%s | outcome=%s | %s",
            action,
            repo_path,
            outcome,
            json.dumps(kwargs, default=str),
        )

    async def stage_files(self, repo_path: str, files: list[str]) -> str:
        if not files:
            raise ValueError("stage_files requires a non-empty list of file paths")
        return await self._run_command(repo_path, "add", "--", *files)

    async def get_current_branch(self, repo_path: str) -> GitBranch:
        try:
            branch_name = await self._run_command(repo_path, "branch", "--show-current")
            return GitBranch(name=branch_name, is_active=True)
        except RuntimeError:
            return GitBranch(name="unknown", is_active=False)

    async def get_recent_commits(self, repo_path: str, limit: int = 100) -> list[dict[str, Any]]:
        try:
            output = await self._run_command(
                repo_path,
                "log",
                f"-n{limit}",
                "--format=%H|%P|%s|%an|%ae|%cI",
            )
            commits: list[dict[str, Any]] = []
            for line in output.split("\n"):
                if not line:
                    continue
                parts = line.split("|", 5)
                if len(parts) == 6:
                    commits.append(
                        {
                            "hash": parts[0],
                            "parents": parts[1].split() if parts[1] else [],
                            "subject": parts[2],
                            "author": parts[3],
                            "email": parts[4],
                            "date": parts[5],
                        }
                    )
            return commits
        except RuntimeError:
            return []

    async def get_status(self, repo_path: str) -> dict[str, Any]:
        try:
            status_output = await self._run_command(repo_path, "status", "--porcelain")
            branch = await self.get_current_branch(repo_path)

            modified = 0
            untracked = 0

            for line in status_output.split("\n"):
                if not line:
                    continue
                code = line[:2]
                if "??" in code:
                    untracked += 1
                else:
                    modified += 1

            return {
                "branch": branch.name,
                "modified": modified,
                "untracked": untracked,
                "raw_output": status_output,
            }
        except RuntimeError as e:
            return {"error": str(e)}

    async def get_diff(self, repo_path: str) -> str:
        try:
            diff = await self._run_command(repo_path, "diff", "HEAD")
            return diff
        except RuntimeError as e:
            raise RuntimeError(f"Error getting diff: {e}")

    async def execute_action(
        self,
        repo_path: str,
        action: str,
        message: str = "",
        files: list[str] | None = None,
        confirm: bool = False,
    ) -> dict[str, str]:
        DESTRUCTIVE = frozenset({"commit", "push", "pull"})

        if action in DESTRUCTIVE and not confirm:
            self._audit(
                action,
                repo_path,
                "BLOCKED",
                reason="confirmation required",
                files=files or [],
            )
            return {
                "status": "blocked",
                "message": (
                    f"Destructive action '{action}' requires explicit confirmation. "
                    "Set confirm=True to proceed."
                ),
            }

        try:
            if action in ("pull", "push"):
                current_branch = await self._run_command(repo_path, "branch", "--show-current")
                current_branch = current_branch.strip()
                if not current_branch:
                    raise RuntimeError("No active branch")

                if action == "pull":
                    out = await self._run_command(repo_path, "pull", "origin", current_branch)
                else:
                    out = await self._run_command(repo_path, "push", "-u", "origin", current_branch)

                self._audit(action, repo_path, "EXECUTED", branch=current_branch)

            elif action == "commit":
                if not files:
                    raise ValueError(
                        "Commit requires an explicit list of files. "
                        "Use stage_files() first or pass the files parameter."
                    )
                await self._run_command(repo_path, "add", "--", *files)
                out = await self._run_command(
                    repo_path,
                    "commit",
                    "-m",
                    message or "Automated commit from SprintLogic",
                )

                self._audit(action, repo_path, "EXECUTED", files=files)

            elif action == "stash":
                out = await self._run_command(repo_path, "stash")
                self._audit(action, repo_path, "EXECUTED")

            else:
                raise ValueError(f"Unknown action: {action}")

            return {"status": "success", "output": out}

        except RuntimeError as e:
            self._audit(action, repo_path, "FAILED", error=str(e))
            return {"status": "error", "message": str(e)}

    async def get_commit_details(self, repo_path: str, commit_hash: str) -> dict[str, Any]:
        try:
            output = await self._run_command(
                repo_path,
                "show",
                "--name-status",
                "--format=%H|%an|%cI|%s",
                commit_hash,
            )
            lines = output.split("\n")
            if not lines:
                raise RuntimeError("Empty output")

            meta_parts = lines[0].split("|", 3)

            files = []
            for line in lines[1:]:
                if not line.strip():
                    continue
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    status = parts[0].strip()
                    file_path = parts[1].strip()
                    files.append({"status": status, "path": file_path})

            return {
                "hash": meta_parts[0] if len(meta_parts) > 0 else commit_hash,
                "author": meta_parts[1] if len(meta_parts) > 1 else "",
                "date": meta_parts[2] if len(meta_parts) > 2 else "",
                "message": meta_parts[3] if len(meta_parts) > 3 else "",
                "files": files,
            }
        except RuntimeError as e:
            return {"error": str(e)}

    async def get_file_at_commit(self, repo_path: str, commit_hash: str, file_path: str) -> str:
        try:
            return await self._run_command(repo_path, "show", f"{commit_hash}:{file_path}")
        except RuntimeError:
            return ""

    # -------------------------------------------------------------------------
    # Advanced Git operations
    # -------------------------------------------------------------------------

    async def validate_ref_name(self, name: str) -> bool:
        process = await asyncio.create_subprocess_exec(
            "git",
            "check-ref-format",
            "--branch",
            name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
        return process.returncode == 0

    async def get_branches(self, repo_path: str) -> list[dict[str, Any]]:
        fmt = "%(refname:short)|%(upstream:trackshort)|%(push:trackshort)"
        try:
            ref_output = await self._run_command(
                repo_path,
                "for-each-ref",
                f"--format={fmt}",
                "refs/heads/",
            )
        except RuntimeError:
            ref_output = ""

        tracking_map: dict[str, dict[str, Any]] = {}
        for line in ref_output.split("\n"):
            if not line:
                continue
            parts = line.split("|")
            branch_name = parts[0] if len(parts) > 0 else ""
            upstream_track = parts[1] if len(parts) > 1 else ""
            if branch_name:
                ahead = 0
                behind = 0
                if upstream_track:
                    import re

                    ahead_match = re.search(r"ahead (\d+)", upstream_track)
                    behind_match = re.search(r"behind (\d+)", upstream_track)
                    if ahead_match:
                        ahead = int(ahead_match.group(1))
                    if behind_match:
                        behind = int(behind_match.group(1))
                tracking_map[branch_name] = {
                    "has_upstream": bool(upstream_track),
                    "ahead": ahead,
                    "behind": behind,
                }

        try:
            branch_output = await self._run_command(repo_path, "branch", "-vv")
        except RuntimeError:
            branch_output = ""

        branches: list[dict[str, Any]] = []
        for line in branch_output.split("\n"):
            if not line:
                continue
            is_current = line.startswith("*")
            rest = line[2:]
            name = rest.split()[0] if rest.split() else ""
            if not name:
                continue

            track_info = tracking_map.get(name, {"has_upstream": False, "ahead": 0, "behind": 0})
            branches.append(
                {
                    "name": name,
                    "is_current": is_current,
                    "has_upstream": track_info["has_upstream"],
                    "ahead": track_info["ahead"],
                    "behind": track_info["behind"],
                    "is_local_only": not track_info["has_upstream"],
                }
            )

        return branches

    async def get_sync_status(self, repo_path: str) -> dict[str, Any]:
        branch = await self.get_current_branch(repo_path)
        ahead = 0
        behind = 0

        try:
            behind_str = await self._run_command(repo_path, "rev-list", "--count", "HEAD..@{u}")
            behind = int(behind_str.strip()) if behind_str.strip().isdigit() else 0
        except RuntimeError:
            _audit_log.debug("No upstream tracking branch configured for %s", repo_path)

        try:
            ahead_str = await self._run_command(repo_path, "rev-list", "--count", "@{u}..HEAD")
            ahead = int(ahead_str.strip()) if ahead_str.strip().isdigit() else 0
        except RuntimeError:
            _audit_log.debug("No upstream tracking branch configured for %s", repo_path)

        return {
            "branch": branch.name,
            "ahead": ahead,
            "behind": behind,
            "is_merge_in_progress": await self.is_merge_in_progress(repo_path),
        }

    async def get_remote_url(self, repo_path: str, remote_name: str = "origin") -> str:
        try:
            url = await self._run_command(repo_path, "remote", "get-url", remote_name)
            return url.strip()
        except RuntimeError:
            return ""

    async def add_remote(self, repo_path: str, remote_name: str, url: str) -> str:
        try:
            return await self._run_command(repo_path, "remote", "set-url", remote_name, url)
        except RuntimeError:
            return await self._run_command(repo_path, "remote", "add", remote_name, url)

    async def verify_remote(self, repo_path: str, remote_name: str = "origin") -> bool:
        try:
            await self._run_command(repo_path, "ls-remote", "--exit-code", remote_name)
            return True
        except RuntimeError:
            return False

    async def checkout(self, repo_path: str, target: str) -> str:
        try:
            return await self._run_command(repo_path, "checkout", target)
        except RuntimeError as e:
            error_msg = str(e)
            if "your local changes" in error_msg.lower() or "please commit" in error_msg.lower():
                raise RuntimeError(f"Dirty working tree prevents checkout: {error_msg}")
            raise

    async def create_branch(
        self,
        repo_path: str,
        branch_name: str,
        start_point: str | None = None,
    ) -> str:
        if start_point:
            return await self._run_command(repo_path, "branch", branch_name, start_point)
        return await self._run_command(repo_path, "branch", branch_name)

    async def merge(self, repo_path: str, source_branch: str) -> str:
        return await self._run_command(repo_path, "merge", source_branch)

    async def delete_branch(
        self,
        repo_path: str,
        branch_name: str,
        force: bool = False,
    ) -> str:
        if force:
            return await self._run_command(repo_path, "branch", "-D", branch_name)

        try:
            return await self._run_command(repo_path, "branch", "-d", branch_name)
        except RuntimeError as e:
            error_msg = str(e)
            error_msg_lower = error_msg.lower()
            if (
                "not fully merged" in error_msg_lower
                or "no ha sido fusionada" in error_msg_lower
                or "is not fully merged" in error_msg_lower
            ):
                raise UnmergedBranchError(
                    f"Branch '{branch_name}' is not fully merged. Use force=True to delete anyway.",
                    requires_force=True,
                )
            raise

    async def reset(self, repo_path: str, commit_hash: str, mode: str) -> str:
        valid_modes = ("soft", "mixed", "hard")
        if mode not in valid_modes:
            raise ValueError(f"Invalid reset mode '{mode}'. Must be one of: {valid_modes}")
        return await self._run_command(repo_path, "reset", f"--{mode}", commit_hash)

    async def revert(self, repo_path: str, commit_hash: str) -> str:
        return await self._run_command(repo_path, "revert", "--no-edit", commit_hash)

    async def cherry_pick(self, repo_path: str, commit_hash: str) -> str:
        return await self._run_command(repo_path, "cherry-pick", commit_hash)

    async def is_merge_in_progress(self, repo_path: str) -> bool:
        merge_head_path = os.path.join(repo_path, ".git", "MERGE_HEAD")
        return os.path.exists(merge_head_path)

    async def get_file_diff(self, repo_path: str, file_path: str) -> dict[str, Any]:
        try:
            diff_output = await self._run_command(repo_path, "diff", "HEAD", "--", file_path)
            original = await self._run_command(repo_path, "show", f"HEAD:{file_path}")
            full_path = os.path.join(repo_path, file_path)
            with open(full_path, "r", encoding="utf-8") as f:
                modified = f.read()
            return {
                "diff": diff_output,
                "original_content": original,
                "modified_content": modified,
                "status": "modified",
            }
        except RuntimeError:
            try:
                full_path = os.path.join(repo_path, file_path)
                with open(full_path, "r", encoding="utf-8") as f:
                    modified = f.read()
                return {
                    "diff": "",
                    "original_content": "",
                    "modified_content": modified,
                    "status": "untracked",
                }
            except (OSError, RuntimeError):
                return {"error": f"Could not read file: {file_path}", "status": "error"}

    async def get_diff_numstat(self, repo_path: str) -> list[dict[str, Any]]:
        try:
            output = await self._run_command(repo_path, "diff", "--numstat", "HEAD")
            files: list[dict[str, Any]] = []
            for line in output.split("\n"):
                if not line:
                    continue
                parts = line.split("\t")
                if len(parts) == 3:
                    files.append({
                        "added": int(parts[0]) if parts[0] != "-" else 0,
                        "deleted": int(parts[1]) if parts[1] != "-" else 0,
                        "file_path": parts[2],
                    })
            return files
        except RuntimeError:
            return []

    async def get_changed_files(self, repo_path: str) -> list[dict[str, Any]]:
        files: list[dict[str, Any]] = []
        try:
            output = await self._run_command(repo_path, "status", "--porcelain")
            for line in output.split("\n"):
                if not line:
                    continue
                code = line[:2].strip()
                file_path = line[3:].strip()
                if not file_path:
                    continue
                files.append({
                    "status_code": code,
                    "file_path": file_path,
                    "is_untracked": code == "??",
                    "is_modified": code in ("M", " M", "MM", "A", "AM", "D", "R"),
                })
        except RuntimeError:
            pass
        return files

    async def revert_file_changes(self, repo_path: str, file_path: str) -> dict[str, Any]:
        full_path = os.path.join(repo_path, file_path)

        try:
            status_output = await self._run_command(
                repo_path, "status", "--porcelain", "--", file_path,
            )
        except RuntimeError:
            status_output = ""

        is_untracked = status_output.startswith("??")

        if is_untracked:
            try:
                os.remove(full_path)
                return {"status": "reverted", "action": "deleted", "file_path": file_path}
            except OSError as e:
                return {"status": "error", "message": f"Failed to delete file: {e}"}

        try:
            await self._run_command(repo_path, "restore", "--", file_path)
            return {"status": "reverted", "action": "restored", "file_path": file_path}
        except RuntimeError:
            try:
                await self._run_command(repo_path, "checkout", "HEAD", "--", file_path)
                return {"status": "reverted", "action": "restored", "file_path": file_path}
            except RuntimeError as e:
                return {"status": "error", "message": str(e)}

    @staticmethod
    def _count_non_empty_lines(output: str | BaseException) -> int:
        if isinstance(output, BaseException):
            return 0
        return len([line for line in output.split("\n") if line.strip()])

    @staticmethod
    def _parse_name_status(output: str | BaseException) -> list[dict[str, str]]:
        if isinstance(output, BaseException):
            return []
        items: list[dict[str, str]] = []
        for line in output.split("\n"):
            if not line.strip():
                continue
            parts = line.split("\t")
            if len(parts) >= 2:
                items.append({"status": parts[0], "file_path": parts[1]})
        return items

    async def get_git_dashboard(self, repo_path: str) -> dict[str, Any]:
        tasks = {
            "tracked_files": self._run_command(repo_path, "ls-files"),
            "untracked_files": self._run_command(
                repo_path, "ls-files", "--others", "--exclude-standard",
            ),
            "ignored_files": self._run_command(
                repo_path, "ls-files", "--others", "--ignored", "--exclude-standard",
            ),
            "last_commit_files": self._run_command(
                repo_path, "show", "--name-only", "--format=", "HEAD",
            ),
            "staged_status": self._run_command(
                repo_path, "diff", "--name-status", "--cached",
            ),
            "last_commit_status": self._run_command(
                repo_path, "show", "--name-status", "--format=", "HEAD",
            ),
            "modified_files": self._run_command(
                repo_path, "diff", "--name-only", "HEAD",
            ),
            "current_branch": self._run_command(repo_path, "branch", "--show-current"),
        }

        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        mapped = dict(zip(tasks.keys(), results))

        diff_with_main: dict[str, int | None] = {"ahead": None, "behind": None}
        try:
            output = await self._run_command(
                repo_path, "rev-list", "--left-right", "--count", "main...HEAD",
            )
            parts = output.split("\t")
            if len(parts) == 2:
                diff_with_main = {"ahead": int(parts[1]), "behind": int(parts[0])}
        except RuntimeError:
            pass

        tracked_count = self._count_non_empty_lines(mapped["tracked_files"])

        return {
            "kpis": {
                "total_files": tracked_count,
                "tracked": tracked_count,
                "untracked": self._count_non_empty_lines(mapped["untracked_files"]),
                "ignored": self._count_non_empty_lines(mapped["ignored_files"]),
                "modified": self._count_non_empty_lines(mapped["modified_files"]),
                "last_commit_files": self._count_non_empty_lines(mapped["last_commit_files"]),
            },
            "lists": {
                "untracked_list": (
                    []
                    if isinstance(mapped["untracked_files"], BaseException)
                    else mapped["untracked_files"].split("\n")
                ),
                "staged_list": self._parse_name_status(mapped["staged_status"]),
                "last_commit_list": self._parse_name_status(mapped["last_commit_status"]),
            },
            "branch": {
                "current_branch": (
                    "unknown"
                    if isinstance(mapped["current_branch"], BaseException)
                    else mapped["current_branch"] or "unknown"
                ),
                "diff_with_main": diff_with_main,
            },
        }

    async def stage_file(self, repo_path: str, file_path: str) -> dict[str, str]:
        await self._run_command(repo_path, "add", "--", file_path)
        return {"status": "staged", "file_path": file_path}

    async def unstage_file(self, repo_path: str, file_path: str) -> dict[str, str]:
        await self._run_command(repo_path, "restore", "--staged", "--", file_path)
        return {"status": "unstaged", "file_path": file_path}

    async def commit_changes(self, repo_path: str, message: str) -> dict[str, str]:
        output = await self._run_command(repo_path, "commit", "-m", message)
        return {"status": "committed", "message": message, "output": output.strip()}
