import asyncio
import os
import shutil
from pathlib import Path


async def async_read_text(path: str | Path, encoding: str = "utf-8", errors: str = "strict") -> str:
    """Read a text file in a worker thread, keeping the event loop unblocked."""
    return await asyncio.to_thread(_read_text_sync, str(path), encoding, errors)


async def async_read_bytes(path: str | Path) -> bytes:
    return await asyncio.to_thread(Path(path).read_bytes)


async def async_write_text(path: str | Path, content: str, encoding: str = "utf-8") -> None:
    await asyncio.to_thread(_write_text_sync, str(path), content, encoding)


async def async_exists(path: str | Path) -> bool:
    return await asyncio.to_thread(Path(path).exists)


async def async_is_file(path: str | Path) -> bool:
    return await asyncio.to_thread(Path(path).is_file)


async def async_remove(path: str | Path) -> None:
    await asyncio.to_thread(Path(path).unlink, missing_ok=False)


async def async_rename(src: str | Path, dst: str | Path) -> None:
    await asyncio.to_thread(os.rename, str(src), str(dst))


async def async_copy2(src: str | Path, dst: str | Path) -> None:
    await asyncio.to_thread(shutil.copy2, str(src), str(dst))


async def async_mkdir_parents(path: str | Path) -> None:
    await asyncio.to_thread(_mkdir_parents_sync, str(path))


def _read_text_sync(path: str, encoding: str, errors: str) -> str:
    with open(path, encoding=encoding, errors=errors) as f:
        return f.read()


def _write_text_sync(path: str, content: str, encoding: str) -> None:
    with open(path, "w", encoding=encoding) as f:
        f.write(content)


def _mkdir_parents_sync(path: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
