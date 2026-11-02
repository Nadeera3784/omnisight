import json
import os
import uuid

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from psycopg.types.json import Jsonb
from pydantic import BaseModel, EmailStr, Field

from . import ai, config, media, rag, storage
from .auth import create_token, current_user, hash_password, verify_password
from .db import get_conn, init_db

VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"}

app = FastAPI(title="OmniSight API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()
    storage.ensure_bucket()


@app.get("/health")
def health():
    return {"ok": True}


# ---------- Auth ----------

class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


def _auth_response(user: dict) -> dict:
    return {
        "token": create_token(user["id"]),
        "user": {"id": str(user["id"]), "email": user["email"], "name": user["name"]},
    }


@app.post("/auth/register")
def register(body: RegisterIn):
    with get_conn() as conn:
        if conn.execute("SELECT 1 FROM users WHERE email = %s", (body.email.lower(),)).fetchone():
            raise HTTPException(409, "An account with this email already exists")
        user = conn.execute(
            "INSERT INTO users (email, name, password_hash) VALUES (%s, %s, %s) RETURNING id, email, name",
            (body.email.lower(), body.name.strip(), hash_password(body.password)),
        ).fetchone()
    return _auth_response(user)


@app.post("/auth/login")
def login(body: LoginIn):
    with get_conn() as conn:
        user = conn.execute(
            "SELECT id, email, name, password_hash FROM users WHERE email = %s", (body.email.lower(),)
        ).fetchone()
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    return _auth_response(user)


@app.get("/auth/me")
def me(user=Depends(current_user)):
    return {"id": str(user["id"]), "email": user["email"], "name": user["name"]}


# ---------- Videos ----------

def _video_out(v: dict) -> dict:
    return {
        "id": str(v["id"]),
        "title": v["title"],
        "youtube_url": v["youtube_url"],
        "youtube_id": media.youtube_id(v["youtube_url"]),
        "status": v["status"],
        "error": v["error"],
        "summary": v["summary"],
        "duration": v["duration"],
        "thumbnail_url": storage.presign(v["thumbnail_key"]),
        "created_at": v["created_at"].isoformat(),
    }


def _get_video(conn, video_id: str, user_id) -> dict:
    v = conn.execute(
        "SELECT * FROM videos WHERE id = %s AND user_id = %s", (video_id, user_id)
    ).fetchone()
    if not v:
        raise HTTPException(404, "Video not found")
    return v


@app.get("/videos")
def list_videos(user=Depends(current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM videos WHERE user_id = %s ORDER BY created_at DESC", (user["id"],)
        ).fetchall()
    return [_video_out(v) for v in rows]


@app.post("/videos/upload")
def upload_video(
    file: UploadFile = File(...),
    title: str = Form(""),
    youtube_url: str = Form(""),
    user=Depends(current_user),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in VIDEO_EXTS:
        raise HTTPException(400, f"Unsupported file type {ext or '(none)'}")
    if youtube_url and not media.youtube_id(youtube_url):
        raise HTTPException(400, "That doesn't look like a YouTube URL")
    vid = uuid.uuid4()
    key = f"videos/{vid}/source{ext}"
    storage.upload_fileobj(file.file, key, file.content_type or "video/mp4")
    if not youtube_url and (yid := media.youtube_id_from_filename(file.filename or "")):
        youtube_url = f"https://www.youtube.com/watch?v={yid}"
    name = title.strip() or os.path.splitext(file.filename or "Untitled")[0]
    with get_conn() as conn:
        v = conn.execute(
            "INSERT INTO videos (id, user_id, title, youtube_url, storage_key) VALUES (%s, %s, %s, %s, %s) RETURNING *",
            (vid, user["id"], name, youtube_url or None, key),
        ).fetchone()
    return _video_out(v)


@app.get("/videos/{video_id}")
def get_video(video_id: uuid.UUID, user=Depends(current_user)):
    with get_conn() as conn:
        v = _get_video(conn, video_id, user["id"])
    out = _video_out(v)
    out["stream_url"] = storage.presign(v["storage_key"], expires=6 * 3600)
    return out


@app.post("/videos/{video_id}/retry")
def retry_video(video_id: uuid.UUID, user=Depends(current_user)):
    with get_conn() as conn:
        _get_video(conn, video_id, user["id"])
        v = conn.execute(
            "UPDATE videos SET status = 'pending', error = NULL WHERE id = %s RETURNING *", (video_id,)
        ).fetchone()
    return _video_out(v)


@app.delete("/videos/{video_id}")
def delete_video(video_id: uuid.UUID, user=Depends(current_user)):
    with get_conn() as conn:
        _get_video(conn, video_id, user["id"])
        conn.execute("DELETE FROM videos WHERE id = %s", (video_id,))
    storage.delete_prefix(f"videos/{video_id}/")
    return {"ok": True}


@app.get("/videos/{video_id}/transcript")
def get_transcript(video_id: uuid.UUID, user=Depends(current_user)):
    with get_conn() as conn:
        v = _get_video(conn, video_id, user["id"])
        rows = conn.execute(
            "SELECT start_sec, end_sec, text FROM chunks WHERE video_id = %s ORDER BY start_sec", (video_id,)
        ).fetchall()
    return [
        {
            "start": r["start_sec"],
            "end": r["end_sec"],
            "timestamp": rag.fmt_ts(r["start_sec"]),
            "text": r["text"],
            "youtube_url": media.youtube_link(v["youtube_url"], r["start_sec"]),
        }
        for r in rows
    ]


# ---------- Conversations ----------

class ConversationIn(BaseModel):
    video_id: uuid.UUID | None = None


def _conv_out(c: dict) -> dict:
    return {
        "id": str(c["id"]),
        "title": c["title"],
        "video_id": str(c["video_id"]) if c["video_id"] else None,
        "video_title": c.get("video_title"),
        "created_at": c["created_at"].isoformat(),
        "updated_at": c["updated_at"].isoformat(),
    }


def _get_conv(conn, conv_id, user_id) -> dict:
    c = conn.execute(
        """SELECT c.*, v.title AS video_title FROM conversations c
           LEFT JOIN videos v ON v.id = c.video_id
           WHERE c.id = %s AND c.user_id = %s""",
        (conv_id, user_id),
    ).fetchone()
    if not c:
        raise HTTPException(404, "Conversation not found")
    return c


@app.get("/conversations")
def list_conversations(user=Depends(current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT c.*, v.title AS video_title FROM conversations c
               LEFT JOIN videos v ON v.id = c.video_id
               WHERE c.user_id = %s ORDER BY c.updated_at DESC""",
            (user["id"],),
        ).fetchall()
    return [_conv_out(c) for c in rows]


@app.post("/conversations")
def create_conversation(body: ConversationIn, user=Depends(current_user)):
    with get_conn() as conn:
        if body.video_id:
            _get_video(conn, body.video_id, user["id"])
        c = conn.execute(
            "INSERT INTO conversations (user_id, video_id) VALUES (%s, %s) RETURNING id",
            (user["id"], body.video_id),
        ).fetchone()
        c = _get_conv(conn, c["id"], user["id"])
    return _conv_out(c)


@app.get("/conversations/{conv_id}")
def get_conversation(conv_id: uuid.UUID, user=Depends(current_user)):
    with get_conn() as conn:
        c = _get_conv(conn, conv_id, user["id"])
        msgs = conn.execute(
            "SELECT id, role, content, sources, created_at FROM messages WHERE conversation_id = %s ORDER BY id",
            (conv_id,),
        ).fetchall()
    out = _conv_out(c)
    out["messages"] = [
        {"id": m["id"], "role": m["role"], "content": m["content"], "sources": m["sources"],
         "created_at": m["created_at"].isoformat()}
        for m in msgs
    ]
    return out


class RenameIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


@app.patch("/conversations/{conv_id}")
def rename_conversation(conv_id: uuid.UUID, body: RenameIn, user=Depends(current_user)):
    with get_conn() as conn:
        _get_conv(conn, conv_id, user["id"])
        conn.execute("UPDATE conversations SET title = %s WHERE id = %s", (body.title.strip(), conv_id))
        c = _get_conv(conn, conv_id, user["id"])
    return _conv_out(c)


@app.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: uuid.UUID, user=Depends(current_user)):
    with get_conn() as conn:
        _get_conv(conn, conv_id, user["id"])
        conn.execute("DELETE FROM conversations WHERE id = %s", (conv_id,))
    return {"ok": True}


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


@app.post("/conversations/{conv_id}/messages")
def send_message(conv_id: uuid.UUID, body: MessageIn, user=Depends(current_user)):
    """Stream the answer as NDJSON events: sources, delta*, done (or error)."""
    question = body.content.strip()
    with get_conn() as conn:
        conv = _get_conv(conn, conv_id, user["id"])
        history = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id = %s ORDER BY id", (conv_id,)
        ).fetchall()
        user_msg = conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (%s, 'user', %s) RETURNING id",
            (conv_id, question),
        ).fetchone()
        if not history:
            title = question if len(question) <= 60 else question[:57].rstrip() + "…"
            conn.execute("UPDATE conversations SET title = %s WHERE id = %s", (title, conv_id))
        conn.execute("UPDATE conversations SET updated_at = now() WHERE id = %s", (conv_id,))

    def events():
        answer, sources = "", []
        try:
            sources = rag.retrieve(user["id"], rag.search_query(history, question), conv["video_id"])
            yield json.dumps({"type": "sources", "sources": sources, "user_message_id": user_msg["id"]}) + "\n"
            for delta in ai.stream(rag.build_messages(history, question, sources)):
                answer += delta
                yield json.dumps({"type": "delta", "text": delta}) + "\n"
        except Exception as e:  # noqa: BLE001
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"
            if not answer:
                return
        with get_conn() as conn:
            msg = conn.execute(
                "INSERT INTO messages (conversation_id, role, content, sources) VALUES (%s, 'assistant', %s, %s) RETURNING id",
                (conv_id, answer, Jsonb(sources)),
            ).fetchone()
        yield json.dumps({"type": "done", "message_id": msg["id"]}) + "\n"

    return StreamingResponse(events(), media_type="application/x-ndjson")
