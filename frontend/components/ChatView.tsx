"use client";

import { AlertCircle, ArrowUp, CirclePlay, Loader2, Play, ScanEye, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import PageHeader from "@/components/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, streamMessage, timestampHref, type Conversation, type Message, type Source, type Video } from "@/lib/api";
import { useConversations } from "@/lib/conversations";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Summarize the key points across my videos",
  "What are the most important takeaways?",
  "Where is the main topic first introduced?",
];

const ALL = "all";

function TimestampLink({
  source,
  children,
  className,
}: {
  source: Source;
  children: React.ReactNode;
  className?: string;
}) {
  const href = timestampHref(source);
  const title = `${source.title} @ ${source.timestamp}`;
  if (source.youtube_url)
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title={`Open on YouTube: ${title}`}
      >
        {children}
      </a>
    );
  return (
    <Link href={href} className={className} title={`Open in player: ${title}`}>
      {children}
    </Link>
  );
}

const citeClass =
  "mx-0.5 inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-px align-[1px] text-xs font-semibold whitespace-nowrap text-primary tabular-nums no-underline hover:bg-primary/20";

function AssistantMessage({ msg, streaming }: { msg: Message; streaming: boolean }) {
  const byN = new Map(msg.sources.map((s) => [s.n, s]));
  // Turn [n] citations into links the custom renderer below can recognise.
  const content = msg.content.replace(/\[(\d+)\](?!\()/g, (m, n) => (byN.has(Number(n)) ? `[${n}](#cite-${n})` : m));
  const cited = [...new Set([...msg.content.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))]
    .map((n) => byN.get(n))
    .filter(Boolean) as Source[];

  return (
    <div className="flex gap-3">
      <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full">
        <ScanEye className="size-4" />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        {!msg.content && streaming ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" /> Searching your videos…
          </div>
        ) : (
          <div className="prose prose-sm dark:prose-invert prose-p:leading-relaxed max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a({ href, children }) {
                  const m = href?.match(/^#cite-(\d+)$/);
                  const src = m && byN.get(Number(m[1]));
                  if (src)
                    return (
                      <TimestampLink source={src} className={citeClass}>
                        <Play className="size-2.5 fill-current" /> {src.timestamp}
                      </TimestampLink>
                    );
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
        {cited.length > 0 && (
          <div className="mt-4 grid gap-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Sources</p>
            {cited.map((s) => (
              <TimestampLink
                key={s.n}
                source={s}
                className="bg-card hover:border-primary/50 hover:bg-accent/50 flex gap-3 rounded-lg border p-3 text-sm transition-colors"
              >
                <span className="text-primary flex shrink-0 items-center gap-1 font-semibold tabular-nums">
                  <Play className="size-3 fill-current" /> {s.timestamp}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="flex items-center gap-2 font-medium">
                    <span className="truncate">{s.title}</span>
                    {s.youtube_url && (
                      <Badge variant="outline">
                        <CirclePlay /> YouTube
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground truncate">{s.text}</span>
                </span>
              </TimestampLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatView({
  conversationId,
  initialVideoId,
}: {
  conversationId?: string;
  initialVideoId?: string;
}) {
  const { reload } = useConversations();
  const [convId, setConvId] = useState<string | undefined>(conversationId);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [scope, setScope] = useState<string>(initialVideoId || "");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<Video[]>("/videos")
      .then((vs) => setVideos(vs.filter((v) => v.status === "ready")))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    api<Conversation>(`/conversations/${conversationId}`)
      .then((c) => {
        setConv(c);
        setMessages(c.messages || []);
      })
      .catch(() => setNotFound(true));
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!convId) setScope(initialVideoId || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideoId]);

  // A chat started here moved the URL to /chat/<id>; "New chat" back to /chat must start fresh.
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  useEffect(() => {
    const cameBack = prevPath.current !== "/chat" && pathname === "/chat";
    prevPath.current = pathname;
    if (!conversationId && cameBack) {
      setConvId(undefined);
      setConv(null);
      setMessages([]);
      setError("");
    }
  }, [pathname, conversationId]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setError("");
    setSending(true);
    setInput("");
    try {
      let id = convId;
      if (!id) {
        const c = await api<Conversation>("/conversations", {
          method: "POST",
          body: JSON.stringify({ video_id: scope || null }),
        });
        id = c.id;
        setConvId(id);
        setConv(c);
        // Update the URL without remounting so the stream keeps rendering here.
        window.history.replaceState(null, "", `/chat/${id}`);
      }
      setConv((c) =>
        c && c.title === "New chat" ? { ...c, title: q.length <= 60 ? q : q.slice(0, 57).trimEnd() + "…" } : c,
      );
      setMessages((m) => [
        ...m,
        { role: "user", content: q, sources: [] },
        { role: "assistant", content: "", sources: [] },
      ]);
      const patchLast = (fn: (m: Message) => Message) =>
        setMessages((ms) => (ms.length ? [...ms.slice(0, -1), fn(ms[ms.length - 1])] : ms));
      await streamMessage(id, q, (e) => {
        if (e.type === "sources") patchLast((m) => ({ ...m, sources: e.sources }));
        else if (e.type === "delta") patchLast((m) => ({ ...m, content: m.content + e.text }));
        else if (e.type === "error") setError(e.error);
      });
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  if (notFound)
    return (
      <>
        <PageHeader />
        <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          This chat doesn&apos;t exist.
          <Button asChild>
            <Link href="/chat">Start a new chat</Link>
          </Button>
        </div>
      </>
    );

  const scopeVideo = conv?.video_id
    ? { id: conv.video_id, title: conv.video_title }
    : scope
      ? { id: scope, title: videos.find((v) => v.id === scope)?.title }
      : null;

  return (
    <div className="flex h-svh flex-col">
      <PageHeader>
        <h1 className="truncate text-sm font-medium">
          {conv?.title && conv.title !== "New chat" ? conv.title : "New chat"}
        </h1>
        <div className="ml-auto shrink-0">
          {convId ? (
            <Badge variant="secondary" className="max-w-56">
              {scopeVideo ? (
                <Link href={`/videos/${scopeVideo.id}`} className="truncate hover:underline">
                  {scopeVideo.title || "…"}
                </Link>
              ) : (
                "All videos"
              )}
            </Badge>
          ) : (
            <Select value={scope || ALL} onValueChange={(v) => setScope(v === ALL ? "" : v)}>
              <SelectTrigger size="sm" className="max-w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={ALL}>Search all videos</SelectItem>
                {videos.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
          {messages.length === 0 && !conversationId && (
            <div className="flex flex-col items-center gap-3 pt-[8vh] text-center">
              <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
                <Sparkles className="size-6" />
              </div>
              <h2 className="text-xl font-semibold">Ask anything about your videos</h2>
              <p className="text-muted-foreground max-w-md text-sm">
                Answers cite the exact moments in your videos. Click a timestamp to jump there
                {videos.some((v) => v.youtube_id) ? " on YouTube" : ""}.
              </p>
              {videos.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No indexed videos yet —{" "}
                  <Link href="/" className="text-primary underline-offset-4 hover:underline">
                    add one to your library
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="outline" size="sm" className="rounded-full" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <AssistantMessage key={i} msg={m} streaming={sending && i === messages.length - 1} />
            ),
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <form
          className={cn(
            "bg-background focus-within:ring-ring/30 flex items-end gap-2 rounded-2xl border p-2 shadow-sm transition-shadow focus-within:ring-[3px]",
          )}
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            rows={1}
            placeholder={scopeVideo ? `Ask about "${scopeVideo.title || "this video"}"…` : "Ask your video library…"}
            className="max-h-48 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            className="shrink-0 rounded-xl"
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        </form>
        <p className="text-muted-foreground mt-2 text-center text-xs">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}
