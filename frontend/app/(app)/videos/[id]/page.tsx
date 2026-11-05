"use client";

import { AlertCircle, CirclePlay, ExternalLink, Loader2, MessageSquare, Play, RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import ConfirmDelete from "@/components/ConfirmDelete";
import PageHeader from "@/components/PageHeader";
import StatusBadge, { PROCESSING } from "@/components/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { api, fmtDuration, type TranscriptChunk, type Video } from "@/lib/api";

function VideoDetail({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const startAt = Number(params.get("t") || 0);
  const [video, setVideo] = useState<Video | null>(null);
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [error, setError] = useState("");
  const [ytStart, setYtStart] = useState({ t: startAt, n: 0 });
  const videoRef = useRef<HTMLVideoElement>(null);

  const load = useCallback(async () => {
    try {
      const v = await api<Video>(`/videos/${id}`);
      setVideo(v);
      if (v.status === "ready") setTranscript(await api<TranscriptChunk[]>(`/videos/${id}/transcript`));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!video || !PROCESSING.includes(video.status)) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [video, load]);

  // Honour ?t= when arriving from a chat citation
  useEffect(() => {
    if (!startAt) return;
    setYtStart({ t: startAt, n: Date.now() });
    if (videoRef.current) videoRef.current.currentTime = startAt;
  }, [startAt]);

  function seek(sec: number) {
    if (video?.youtube_id) setYtStart({ t: Math.floor(sec), n: Date.now() });
    else if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play().catch(() => {});
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove() {
    try {
      await api(`/videos/${id}`, { method: "DELETE" });
      router.push("/");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function retry() {
    await api(`/videos/${id}/retry`, { method: "POST" });
    load();
  }

  return (
    <>
      <PageHeader>
        <Link href="/" className="text-muted-foreground hover:text-foreground text-sm">
          Library
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="truncate text-sm font-medium">{video?.title ?? "…"}</h1>
      </PageHeader>

      {error && !video ? (
        <div className="p-4 md:p-8">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      ) : !video ? (
        <div className="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-8">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="aspect-video w-full lg:w-2/3" />
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{video.title}</h2>
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={video.status} />
                {video.duration != null && <span className="tabular-nums">{fmtDuration(video.duration)}</span>}
                {video.youtube_url && (
                  <Badge variant="outline" asChild>
                    <a href={video.youtube_url} target="_blank" rel="noopener noreferrer">
                      <CirclePlay /> YouTube <ExternalLink />
                    </a>
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {video.status === "ready" && (
                <Button asChild>
                  <Link href={`/chat?video=${video.id}`}>
                    <MessageSquare /> Chat about this video
                  </Link>
                </Button>
              )}
              {video.status === "error" && (
                <Button variant="outline" onClick={retry}>
                  <RotateCw /> Retry
                </Button>
              )}
              <ConfirmDelete
                title={`Delete "${video.title}"?`}
                description="The video file, transcript and its search index will be permanently removed."
                onConfirm={remove}
              >
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 /> Delete
                </Button>
              </ConfirmDelete>
            </div>
          </div>

          {video.status === "error" && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Processing failed</AlertTitle>
              <AlertDescription>{video.error}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="grid gap-6">
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                {video.youtube_id ? (
                  <iframe
                    key={ytStart.n}
                    className="size-full"
                    src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}?start=${ytStart.t}${ytStart.n ? "&autoplay=1" : ""}`}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    title={video.title}
                  />
                ) : video.stream_url ? (
                  <video
                    ref={videoRef}
                    className="size-full"
                    src={video.stream_url}
                    controls
                    poster={video.thumbnail_url || undefined}
                    onLoadedMetadata={(e) => {
                      if (startAt) e.currentTarget.currentTime = startAt;
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center gap-2 text-sm text-white/70">
                    <Loader2 className="size-4 animate-spin" /> Processing…
                  </div>
                )}
              </div>
              {video.summary && (
                <Card>
                  <CardHeader>
                    <CardTitle>Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-relaxed">{video.summary}</CardContent>
                </Card>
              )}
            </div>

            <Card className="gap-0 py-0 lg:sticky lg:top-20">
              <CardHeader className="border-b py-4">
                <CardTitle>Transcript</CardTitle>
              </CardHeader>
              <ScrollArea className="lg:h-[calc(100svh-12rem)]">
                <div className="grid divide-y px-4">
                  {transcript.length === 0 && (
                    <p className="text-muted-foreground py-4 text-sm">
                      {video.status === "ready" ? "No transcript." : "Available once indexing finishes."}
                    </p>
                  )}
                  {transcript.map((c) => (
                    <div key={c.start} className="flex items-start gap-3 py-3 text-sm">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="text-primary h-6 shrink-0 gap-1 px-2 text-xs tabular-nums"
                        onClick={() => seek(c.start)}
                        title="Play from here"
                      >
                        <Play className="size-3" /> {c.timestamp}
                      </Button>
                      <span className="leading-relaxed">{c.text}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

export default function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <VideoDetail id={id} />
    </Suspense>
  );
}
