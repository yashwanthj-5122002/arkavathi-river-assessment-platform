from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from app.production_config import (
    SHOWCASE_VIDEO_DIR,
    SRT_EXTENSIONS,
    VIDEO_EXTENSIONS,
    VIDEO_SRT_LIBRARY_DIR,
    ensure_production_dirs,
)


def _safe_relative(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def list_showcase_videos() -> list[dict[str, Any]]:
    ensure_production_dirs()
    rows: list[dict[str, Any]] = []
    for path in sorted(SHOWCASE_VIDEO_DIR.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file() or path.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        stat = path.stat()
        rows.append({
            "name": path.name,
            "url": f"/videos/{path.name}",
            "size_bytes": stat.st_size,
            "modified_at": int(stat.st_mtime),
        })
    return rows


def showcase_video_path(filename: str) -> Path | None:
    ensure_production_dirs()
    candidate = (SHOWCASE_VIDEO_DIR / Path(filename).name).resolve()
    try:
        candidate.relative_to(SHOWCASE_VIDEO_DIR.resolve())
    except ValueError:
        return None
    if not candidate.is_file() or candidate.suffix.lower() not in VIDEO_EXTENSIONS:
        return None
    return candidate


def _choose_video_for_srt(srt: Path, videos: list[Path]) -> Path | None:
    base = srt.stem.lower()
    exact = [v for v in videos if v.stem.lower() == base]
    if exact:
        return exact[0]
    segmented = [v for v in videos if v.stem.lower().startswith(base + "-")]
    if segmented:
        return sorted(segmented, key=lambda p: p.name.lower())[0]
    return None


def list_video_srt_pairs() -> list[dict[str, Any]]:
    ensure_production_dirs()
    rows: list[dict[str, Any]] = []
    srt_files = [p for p in VIDEO_SRT_LIBRARY_DIR.rglob("*") if p.is_file() and p.suffix.lower() in SRT_EXTENSIONS]
    for directory in sorted({p.parent for p in srt_files}, key=lambda p: str(p).lower()):
        srts = sorted([p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == ".srt"], key=lambda p: p.name.lower())
        videos = sorted([p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS], key=lambda p: p.name.lower())
        for srt in srts:
            video = _choose_video_for_srt(srt, videos)
            rel_srt = _safe_relative(srt, VIDEO_SRT_LIBRARY_DIR)
            rel_video = _safe_relative(video, VIDEO_SRT_LIBRARY_DIR) if video else ""
            key = hashlib.sha1(rel_srt.encode("utf-8")).hexdigest()[:16]
            rows.append({
                "id": key,
                "folder": _safe_relative(directory, VIDEO_SRT_LIBRARY_DIR) if directory != VIDEO_SRT_LIBRARY_DIR else ".",
                "srt_name": srt.name,
                "srt_relative_path": rel_srt,
                "video_name": video.name if video else "",
                "video_relative_path": rel_video,
                "paired": bool(video),
                "srt_size_bytes": srt.stat().st_size,
                "video_size_bytes": video.stat().st_size if video else 0,
            })
    return rows


def media_status() -> dict[str, Any]:
    showcase = list_showcase_videos()
    pairs = list_video_srt_pairs()
    return {
        "showcase_video_directory": str(SHOWCASE_VIDEO_DIR),
        "video_srt_library_directory": str(VIDEO_SRT_LIBRARY_DIR),
        "showcase_videos": len(showcase),
        "video_srt_pairs": sum(1 for row in pairs if row["paired"]),
        "unpaired_srts": sum(1 for row in pairs if not row["paired"]),
    }


def media_pair_paths(pair_id: str) -> tuple[dict[str, Any], Path, Path]:
    for row in list_video_srt_pairs():
        if row["id"] != pair_id:
            continue
        if not row["paired"]:
            raise LookupError("The selected SRT does not have a matching video")
        srt = (VIDEO_SRT_LIBRARY_DIR / row["srt_relative_path"]).resolve()
        video = (VIDEO_SRT_LIBRARY_DIR / row["video_relative_path"]).resolve()
        for candidate in (srt, video):
            try:
                candidate.relative_to(VIDEO_SRT_LIBRARY_DIR.resolve())
            except ValueError as exc:
                raise LookupError("Invalid media path") from exc
        if not srt.is_file() or not video.is_file():
            raise LookupError("Media pair files are missing")
        return row, video, srt
    raise LookupError("Media pair not found")
