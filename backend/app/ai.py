from openai import OpenAI

from . import config

client = OpenAI(api_key=config.OPENAI_API_KEY)


def embed(texts: list[str]) -> list[list[float]]:
    out: list[list[float]] = []
    for i in range(0, len(texts), 96):
        resp = client.embeddings.create(model=config.EMBED_MODEL, input=texts[i : i + 96])
        out.extend(d.embedding for d in resp.data)
    return out


def transcribe(path: str) -> list[dict]:
    """Return [{start, end, text}] segments for one audio file."""
    with open(path, "rb") as f:
        resp = client.audio.transcriptions.create(
            model=config.TRANSCRIBE_MODEL,
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )
    segments = getattr(resp, "segments", None) or []
    if not segments and getattr(resp, "text", ""):
        return [{"start": 0.0, "end": float(getattr(resp, "duration", 0) or 0), "text": resp.text}]
    return [{"start": s.start, "end": s.end, "text": s.text.strip()} for s in segments]


def chat_kwargs() -> dict:
    model = config.CHAT_MODEL
    kwargs: dict = {"model": model}
    if model.startswith(("gpt-5", "o")):
        kwargs["reasoning_effort"] = "low"
    else:
        kwargs["temperature"] = 0.2
    return kwargs


def complete(messages: list[dict]) -> str:
    resp = client.chat.completions.create(messages=messages, **chat_kwargs())
    return resp.choices[0].message.content or ""


def stream(messages: list[dict]):
    resp = client.chat.completions.create(messages=messages, stream=True, **chat_kwargs())
    for event in resp:
        if event.choices and event.choices[0].delta.content:
            yield event.choices[0].delta.content
