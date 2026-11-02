"""Retrieval-augmented answers over a user's video knowledge base."""
from . import ai, config, media
from .db import get_conn

SYSTEM_PROMPT = """You are OmniSight, an assistant that answers questions about the user's videos.
Answer using ONLY the numbered transcript excerpts provided. Each excerpt comes from a video at a given timestamp.
Cite excerpts inline with their number in square brackets, e.g. [1] or [2][3], right after the claim they support.
If the excerpts don't contain the answer, say so plainly and suggest what the user could ask instead.
Be concise and use Markdown (short paragraphs, bullet lists) where it helps."""


def fmt_ts(sec: float) -> str:
    sec = int(sec)
    h, m, s = sec // 3600, (sec % 3600) // 60, sec % 60
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def retrieve(user_id, query: str, video_id=None, k: int = config.TOP_K) -> list[dict]:
    [vec] = ai.embed([query])
    sql = """
        SELECT c.video_id, c.start_sec, c.end_sec, c.text, v.title, v.youtube_url,
               1 - (c.embedding <=> %(vec)s::vector) AS score
        FROM chunks c JOIN videos v ON v.id = c.video_id
        WHERE v.user_id = %(user)s AND v.status = 'ready'
    """
    params = {"vec": vec, "user": user_id, "k": k}
    if video_id:
        sql += " AND v.id = %(video)s"
        params["video"] = video_id
    sql += " ORDER BY c.embedding <=> %(vec)s::vector LIMIT %(k)s"
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
    sources = []
    for i, r in enumerate(rows, start=1):
        sources.append({
            "n": i,
            "video_id": str(r["video_id"]),
            "title": r["title"],
            "start": r["start_sec"],
            "end": r["end_sec"],
            "timestamp": fmt_ts(r["start_sec"]),
            "text": r["text"],
            "score": round(float(r["score"]), 4),
            "youtube_url": media.youtube_link(r["youtube_url"], r["start_sec"]),
        })
    return sources


def build_messages(history: list[dict], question: str, sources: list[dict]) -> list[dict]:
    context = "\n\n".join(
        f"[{s['n']}] Video: \"{s['title']}\" @ {s['timestamp']}\n{s['text']}" for s in sources
    ) or "(no excerpts found — the knowledge base may be empty)"
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in history[-8:]:
        msgs.append({"role": m["role"], "content": m["content"]})
    msgs.append({
        "role": "user",
        "content": f"Transcript excerpts:\n\n{context}\n\n---\nQuestion: {question}",
    })
    return msgs


def search_query(history: list[dict], question: str) -> str:
    """Fold the previous user turn into the query so follow-ups like 'tell me more' still retrieve well."""
    prev = [m["content"] for m in history if m["role"] == "user"][-1:]
    return "\n".join(prev + [question])
