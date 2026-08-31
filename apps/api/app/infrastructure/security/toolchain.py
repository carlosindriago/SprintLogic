"""Cross-platform native binary toolchain manager for Security Studio.

Manages provisioning, downloading, updating, and execution permissions for
pre-compiled native security binaries (Gitleaks, Semgrep) without requiring Docker.
Supports Windows (x64, arm64), macOS (Apple Silicon & Intel), and Linux (x64, arm64).
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import platform
import shutil
import stat
import tarfile
import zipfile
from pathlib import Path
from typing import Any, Literal
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

ToolStatus = Literal["ready", "downloading", "missing", "error"]


class SecurityToolchainManager:
    """Manages downloading, extraction, and verification of native security binaries."""

    DEFAULT_VERSIONS: dict[str, str] = {
        "gitleaks": "8.18.2",
        "semgrep": "1.75.0",
    }

    def __init__(self, base_dir: Path | None = None) -> None:
        if base_dir:
            self.base_dir = base_dir
        else:
            custom_dir = os.getenv("SPRINTLOGIC_TOOLS_DIR")
            if custom_dir:
                self.base_dir = Path(custom_dir)
            else:
                self.base_dir = Path.home() / ".sprintlogic" / "tools"

        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, asyncio.Lock] = {}
        self._status: dict[str, str] = {
            "gitleaks": "ready" if self.is_tool_available("gitleaks") else "missing",
            "semgrep": "ready" if self.is_tool_available("semgrep") else "missing",
        }

    @staticmethod
    def get_system_info() -> tuple[str, str]:
        """Detect normalized OS and Architecture.

        Returns: (os_name, arch_name)
          os_name: "linux" | "darwin" | "windows"
          arch_name: "x64" | "arm64"
        """
        raw_os = platform.system().lower()
        if "linux" in raw_os:
            os_name = "linux"
        elif "darwin" in raw_os:
            os_name = "darwin"
        elif "windows" in raw_os:
            os_name = "windows"
        else:
            os_name = raw_os

        raw_arch = platform.machine().lower()
        if raw_arch in ("x86_64", "amd64", "x64"):
            arch_name = "x64"
        elif raw_arch in ("arm64", "aarch64"):
            arch_name = "arm64"
        elif raw_arch in ("armv7l", "arm"):
            arch_name = "armv7"
        else:
            arch_name = "x64"

        return os_name, arch_name

    def get_binary_filename(self, tool_name: str) -> str:
        """Return executable filename with platform extension."""
        os_name, _ = self.get_system_info()
        return f"{tool_name}.exe" if os_name == "windows" else tool_name

    def get_tool_path(self, tool_name: str, version: str | None = None) -> Path:
        """Get target binary path for a tool version."""
        ver = version or self.DEFAULT_VERSIONS.get(tool_name, "latest")
        binary_name = self.get_binary_filename(tool_name)
        return self.base_dir / tool_name / ver / binary_name

    def is_tool_available(self, tool_name: str, version: str | None = None) -> bool:
        """Check if pre-compiled binary exists and is executable in cache or system PATH."""
        binary_path = self.get_tool_path(tool_name, version)
        if binary_path.is_file() and os.access(binary_path, os.X_OK):
            return True
        # Check system PATH fallback
        return shutil.which(tool_name) is not None

    def get_download_url(self, tool_name: str, version: str) -> str | None:
        """Build official GitHub release download URL based on OS and architecture."""
        os_name, arch_name = self.get_system_info()

        if tool_name == "gitleaks":
            ext = "zip" if os_name == "windows" else "tar.gz"
            return (
                f"https://github.com/gitleaks/gitleaks/releases/download/v{version}/"
                f"gitleaks_{version}_{os_name}_{arch_name}.{ext}"
            )
        elif tool_name == "semgrep":
            ext = "zip" if os_name == "windows" else "tar.gz"
            return (
                f"https://github.com/semgrep/semgrep/releases/download/v{version}/"
                f"semgrep-{version}-{os_name}-{arch_name}.{ext}"
            )
        return None

    async def get_or_download_tool(self, tool_name: str, version: str | None = None) -> Path:
        """Ensure native tool binary exists locally, downloading and unpacking if necessary."""
        ver = version or self.DEFAULT_VERSIONS.get(tool_name, "latest")
        target_path = self.get_tool_path(tool_name, ver)

        if target_path.is_file() and os.access(target_path, os.X_OK):
            self._status[tool_name] = "ready"
            return target_path

        # Check system PATH first
        system_bin = shutil.which(tool_name)
        if system_bin and os.access(system_bin, os.X_OK):
            logger.info("Found system binary for %s at %s", tool_name, system_bin)
            self._status[tool_name] = "ready"
            return Path(system_bin)

        if tool_name not in self._locks:
            self._locks[tool_name] = asyncio.Lock()

        async with self._locks[tool_name]:
            # Double check after acquiring lock
            if target_path.is_file() and os.access(target_path, os.X_OK):
                self._status[tool_name] = "ready"
                return target_path

            self._status[tool_name] = "downloading"
            download_url = self.get_download_url(tool_name, ver)
            if not download_url:
                self._status[tool_name] = "error"
                raise RuntimeError(f"No download URL available for {tool_name} on {platform.system()}/{platform.machine()}")

            logger.info("Provisioning %s v%s from %s", tool_name, ver, download_url)
            target_dir = target_path.parent
            target_dir.mkdir(parents=True, exist_ok=True)

            try:
                # Perform download in thread pool to not block asyncio event loop
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(None, self._download_and_extract, download_url, target_dir, tool_name)

                # Ensure executable permissions on Unix/macOS
                if platform.system().lower() != "windows" and target_path.is_file():
                    current_mode = os.stat(target_path).st_mode
                    os.chmod(target_path, current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

                if target_path.is_file():
                    logger.info("Successfully provisioned %s at %s", tool_name, target_path)
                    self._status[tool_name] = "ready"
                    return target_path
                else:
                    # Fallback to any executable found in target_dir
                    for child in target_dir.glob("*"):
                        if child.is_file() and tool_name in child.name.lower():
                            if platform.system().lower() != "windows":
                                os.chmod(child, child.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
                            self._status[tool_name] = "ready"
                            return child

                    raise FileNotFoundError(f"Binary {target_path.name} not found after archive extraction in {target_dir}")

            except Exception as e:
                logger.warning("Toolchain provisioning error for %s: %s. Using fallback.", tool_name, e)
                self._status[tool_name] = "missing"
                # If target directory was created, return target_path anyway so runner can fallback gracefully
                return target_path

    def _download_and_extract(self, url: str, target_dir: Path, tool_name: str) -> None:
        """Synchronous download and archive extraction worker with anti-zip-slip checks."""
        req = Request(url, headers={"User-Agent": "SprintLogic-Toolchain/1.0"})
        try:
            with urlopen(req, timeout=30) as response:
                content = response.read()
        except Exception as err:
            logger.warning("Network download failed for %s: %s", url, err)
            raise

        # Check archive format and extract safely
        if url.endswith(".zip") or zipfile.is_zipfile(io.BytesIO(content)):
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                for zip_member in z.infolist():
                    # Zip slip prevention
                    safe_filename = zip_member.filename.lstrip("/")
                    if not safe_filename:
                        continue
                    zip_member_path = (target_dir / safe_filename).resolve()
                    if not zip_member_path.is_relative_to(target_dir.resolve()):
                        continue
                    zip_member.filename = safe_filename
                    z.extract(zip_member, target_dir)
        elif url.endswith((".tar.gz", ".tgz")) or tarfile.is_tarfile(io.BytesIO(content)):
            with tarfile.open(fileobj=io.BytesIO(content), mode="r:*") as t:
                for tar_member in t.getmembers():
                    # Tar slip prevention
                    safe_name = tar_member.name.lstrip("/")
                    if not safe_name:
                        continue
                    tar_member_path = (target_dir / safe_name).resolve()
                    if not tar_member_path.is_relative_to(target_dir.resolve()):
                        continue
                    tar_member.name = safe_name
                    t.extract(tar_member, target_dir)
        else:
            # Single binary file
            binary_name = self.get_binary_filename(tool_name)
            output_file = target_dir / binary_name
            with open(output_file, "wb") as f:
                f.write(content)

    def get_status(self) -> dict[str, Any]:
        """Return current toolchain status and environment details."""
        os_name, arch_name = self.get_system_info()
        return {
            "base_dir": str(self.base_dir),
            "platform": {
                "os": os_name,
                "arch": arch_name,
                "system": platform.system(),
                "machine": platform.machine(),
            },
            "tools": {
                name: {
                    "status": "ready" if self.is_tool_available(name) else self._status.get(name, "missing"),
                    "version": ver,
                    "path": str(self.get_tool_path(name, ver)),
                    "available": self.is_tool_available(name),
                }
                for name, ver in self.DEFAULT_VERSIONS.items()
            },
        }


# Global Toolchain Manager Singleton
global_toolchain = SecurityToolchainManager()
