"""FFmpeg helpers and YouTube link building."""

import glob
import json
import os
import re
import subprocess

YOUTUBE_ID_RE = re.compile(r"(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([A-Za-z0-9_-]{11})")
# yt-dlp's default output template ends with " [VIDEO_ID].ext"
FILENAME_ID_RE = re.compile(r"\[([A-Za-z0-9_-]{11})\]")


def youtube_id(url: str | None) -> str | None:
    if not url:
        return None
    m = YOUTUBE_ID_RE.search(url)
    return m.group(1) if m else None


def youtube_id_from_filename(name: str) -> str | None:
    m = FILENAME_ID_RE.search(name)
    return m.group(1) if m else None


def youtube_link(url: str | None, seconds: float) -> str | None:
    vid = youtube_id(url)
    if not vid:
        return None
    return f"https://www.youtube.com/watch?v={vid}&t={int(seconds)}s"


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {proc.stderr.strip()[-800:]}")
    return proc.stdout


def probe_duration(path: str) -> float:
    out = _run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", path])
    return float(json.loads(out)["format"]["duration"])


def make_thumbnail(path: str, out_path: str, at: float) -> None:
    _run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-ss",
            f"{at:.2f}",
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            "-q:v",
            "4",
            out_path,
        ]
    )


def extract_audio_segments(path: str, out_dir: str, segment_seconds: int = 600) -> list[str]:
    """Mono 16 kHz 32 kbps MP3, split so each piece stays well under Whisper's 25 MB limit."""
    pattern = os.path.join(out_dir, "audio_%04d.mp3")
    _run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "32k",
            "-f",
            "segment",
            "-segment_time",
            str(segment_seconds),
            "-reset_timestamps",
            "1",
            pattern,
        ]
    )
    return sorted(glob.glob(os.path.join(out_dir, "audio_*.mp3")))
