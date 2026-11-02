export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type User = { id: string; email: string; name: string };

export type Video = {
  id: string;
  title: string;
  youtube_url: string | null;
  youtube_id: string | null;
  status: string;
  error: string | null;
  summary: string | null;
  duration: number | null;
  thumbnail_url: string | null;
  created_at: string;
  stream_url?: string | null;
};

export type Source = {
  n: number;
  video_id: string;
  title: string;
  start: number;
  end: number;
  timestamp: string;
  text: string;
  score: number;
  youtube_url: string | null;
};

export type Message = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  sources: Source[];
};

export type Conversation = {
  id: string;
  title: string;
  video_id: string | null;
  video_title: string | null;
  created_at: string;
  updated_at: string;
  messages?: Message[];
};

export type TranscriptChunk = { start: number; end: number; timestamp: string; text: string; youtube_url: string | null };

const TOKEN_KEY = "omnisight_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function errorFrom(res: Response): Promise<ApiError> {
  let msg = res.statusText;
  try {
    const body = await res.json();
    if (typeof body.detail === "string") msg = body.detail;
    else if (Array.isArray(body.detail)) msg = body.detail.map((d: { msg: string }) => d.msg).join(", ");
  } catch {}
  if (res.status === 401 && typeof window !== "undefined") {
    setToken(null);
    if (!location.pathname.startsWith("/login")) location.href = "/login";
  }
  return new ApiError(res.status, msg);
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...authHeaders(), ...(opts.headers as Record<string, string>) };
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

/** Upload with progress reporting (fetch has no upload progress). */
export function uploadVideo(form: FormData, onProgress: (pct: number) => void): Promise<Video> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/videos/upload`);
    const t = getToken();
    if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { detail?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Video);
      else reject(new ApiError(xhr.status, body.detail || "Upload failed"));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.send(form);
  });
}

export type StreamEvent =
  | { type: "sources"; sources: Source[]; user_message_id: number }
  | { type: "delta"; text: string }
  | { type: "done"; message_id: number }
  | { type: "error"; error: string };

export async function streamMessage(convId: string, content: string, onEvent: (e: StreamEvent) => void) {
  const res = await fetch(`${API_URL}/conversations/${convId}/messages`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok || !res.body) throw await errorFrom(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) onEvent(JSON.parse(line));
    }
  }
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec == null) return "";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/** Where a timestamp click should go: YouTube at that second, or the in-app player. */
export function timestampHref(s: { video_id: string; start: number; youtube_url: string | null }) {
  return s.youtube_url || `/videos/${s.video_id}?t=${Math.floor(s.start)}`;
}
