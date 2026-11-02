"""Background ingestion worker: polls for pending videos and builds the knowledge base."""
import logging
import os
import tempfile
import time
import traceback

from . import ai, config, media, storage
from .db import get_conn, init_db

log = logging.getLogger("worker")


def set_status(video_id, status: str, **fields):
    cols = ", ".join(f"{k} = %s" for k in fields)
    sql = f"UPDATE videos SET status = %s{', ' + cols if cols else ''} WHERE id = %s"
    with get_conn() as conn:
        conn.execute(sql, (status, *fields.values(), video_id))


def build_chunks(segments: list[dict]) -> list[dict]:
    """Group transcript segments into ~CHUNK_SECONDS windows with a small overlap."""
    overlap = config.CHUNK_OVERLAP_SEGMENTS
    chunks, current, fresh = [], [], 0
    for seg in segments:
        current.append(seg)
        fresh += 1
        if current[-1]["end"] - current[0]["start"] >= config.CHUNK_SECONDS:
            chunks.append(current)
            current, fresh = (current[-overlap:] if overlap else []), 0
    if fresh:
        chunks.append(current)
    return [
        {
            "start": c[0]["start"],
            "end": c[-1]["end"],
            "text": " ".join(s["text"] for s in c if s["text"]),
        }
        for c in chunks
        if any(s["text"] for s in c)
    ]


def summarize(title: str, segments: list[dict]) -> str:
    transcript = " ".join(s["text"] for s in segments)[:16000]
    return ai.complete([
        {"role": "system", "content": "Summarize this video transcript in 2-3 sentences. Plain text, no preamble."},
        {"role": "user", "content": f"Title: {title}\n\nTranscript:\n{transcript}"},
    ]).strip()


def process(video: dict):
    vid = video["id"]
    with tempfile.TemporaryDirectory() as tmp:
        # 1. Get the source file
        set_status(vid, "downloading")
        if not video["storage_key"]:
            raise RuntimeError("Video has no uploaded file")
        src = os.path.join(tmp, "source" + os.path.splitext(video["storage_key"])[1])
        storage.download_file(video["storage_key"], src)

        # 2. Probe + thumbnail (FFmpeg)
        set_status(vid, "converting")
        duration = media.probe_duration(src)
        thumb = os.path.join(tmp, "thumb.jpg")
        media.make_thumbnail(src, thumb, at=min(duration * 0.1, 30))
        thumb_key = f"videos/{vid}/thumb.jpg"
        storage.upload_file(thumb, thumb_key, "image/jpeg")
        audio_parts = media.extract_audio_segments(src, tmp)
        set_status(vid, "transcribing", duration=duration, thumbnail_key=thumb_key)

        # 3. Transcribe each audio part, shifting timestamps by the part offset
        segments, offset = [], 0.0
        for part in audio_parts:
            for s in ai.transcribe(part):
                segments.append({"start": s["start"] + offset, "end": s["end"] + offset, "text": s["text"]})
            offset += media.probe_duration(part)
        if not segments:
            raise RuntimeError("No speech found in the video")

        # 4. Chunk, embed, store in pgvector
        set_status(vid, "indexing")
        chunks = build_chunks(segments)
        vectors = ai.embed([f"{video['title']}\n{c['text']}" for c in chunks])
        with get_conn() as conn:
            conn.execute("DELETE FROM chunks WHERE video_id = %s", (vid,))
            with conn.cursor() as cur:
                cur.executemany(
                    "INSERT INTO chunks (video_id, start_sec, end_sec, text, embedding) VALUES (%s, %s, %s, %s, %s)",
                    [(vid, c["start"], c["end"], c["text"], v) for c, v in zip(chunks, vectors)],
                )

        summary = summarize(video["title"], segments)
        set_status(vid, "ready", summary=summary, error=None)
        log.info("Video %s ready: %d chunks", vid, len(chunks))


def claim_next() -> dict | None:
    with get_conn() as conn:
        return conn.execute(
            """
            UPDATE videos SET status = 'queued'
            WHERE id = (
                SELECT id FROM videos WHERE status = 'pending'
                ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
            )
            RETURNING *
            """
        ).fetchone()


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    init_db()
    storage.ensure_bucket()
    # Anything left mid-flight by a previous run gets retried.
    with get_conn() as conn:
        conn.execute("UPDATE videos SET status = 'pending' WHERE status NOT IN ('pending', 'ready', 'error')")
    log.info("Worker started")
    while True:
        video = claim_next()
        if not video:
            time.sleep(2)
            continue
        log.info("Processing %s (%s)", video["id"], video["title"])
        try:
            process(video)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            set_status(video["id"], "error", error=str(e)[:1000])


if __name__ == "__main__":
    main()
