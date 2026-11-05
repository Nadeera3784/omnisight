"use client";

import { AlertCircle, Film, MessageSquare, Upload } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { PROCESSING } from "@/components/StatusBadge";
import VideoTable from "@/components/VideoTable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api, uploadVideo, type Video } from "@/lib/api";
import { cn } from "@/lib/utils";

function UploadPanel({ onAdded }: { onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setTitle("");
    setYtUrl("");
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!file) throw new Error("Choose a video file");
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("youtube_url", ytUrl);
      await uploadVideo(form, setProgress);
      reset();
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a video</CardTitle>
        <CardDescription>It will be transcribed and indexed so you can ask questions about it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
            className={cn(
              "text-muted-foreground hover:border-primary hover:bg-accent/50 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm transition-colors",
              dragging && "border-primary bg-accent/50",
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept="video/*,.mkv"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Upload className="size-6" />
            {file ? (
              <span className="text-foreground font-medium">
                {file.name} <span className="text-muted-foreground">({(file.size / 1e6).toFixed(1)} MB)</span>
              </span>
            ) : (
              <span>
                <span className="text-foreground font-medium">Choose a video</span> or drag it here
              </span>
            )}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to the file name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="yt">YouTube URL (optional)</Label>
              <Input
                id="yt"
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="Timestamps will open YouTube"
              />
            </div>
          </div>
          {progress !== null && <Progress value={progress} />}
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div>
            <Button type="submit" disabled={busy}>
              <Upload />
              {busy ? (progress !== null ? `Uploading ${progress}%` : "Adding…") : "Upload & index"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LibraryPage() {
  const [videos, setVideos] = useState<Video[] | null>(null);

  const load = useCallback(
    () =>
      api<Video[]>("/videos")
        .then(setVideos)
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    await api(`/videos/${id}`, { method: "DELETE" });
    setVideos((vs) => vs?.filter((v) => v.id !== id) ?? null);
  }

  // Poll while anything is still being processed
  const busy = videos?.some((v) => PROCESSING.includes(v.status));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  return (
    <>
      <PageHeader>
        <h1 className="truncate font-medium">Video library</h1>
        <Button asChild size="sm" className="ml-auto">
          <Link href="/chat">
            <MessageSquare /> Ask your videos
          </Link>
        </Button>
      </PageHeader>
      <div className="mx-auto grid w-full max-w-6xl gap-8 p-4 md:p-8">
        <UploadPanel onAdded={load} />

        <section className="grid gap-4">
          <h2 className="text-lg font-semibold">
            Your videos{" "}
            {videos && videos.length > 0 && <span className="text-muted-foreground">({videos.length})</span>}
          </h2>
          {videos === null ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
              <Film className="size-8" />
              No videos yet. Upload one above to build your knowledge base.
            </div>
          ) : (
            <VideoTable videos={videos} onDelete={remove} />
          )}
        </section>
      </div>
    </>
  );
}
