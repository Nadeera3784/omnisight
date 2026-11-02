"use client";

import { CirclePlay, Film, MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import ConfirmDelete from "@/components/ConfirmDelete";
import StatusBadge from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDuration, type Video } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

/** Page numbers to show, with null standing for an ellipsis: 1 … 4 5 6 … 12 */
function pageList(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export default function VideoTable({ videos, onDelete }: { videos: Video[]; onDelete: (id: string) => Promise<void> }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(videos.length / PAGE_SIZE));

  // Stay in range when deletions shrink the list
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const start = (page - 1) * PAGE_SIZE;
  const rows = videos.slice(start, start + PAGE_SIZE);

  function go(e: React.MouseEvent, p: number) {
    e.preventDefault();
    if (p >= 1 && p <= pageCount) setPage(p);
  }

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-full pl-4">Video</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Duration</TableHead>
              <TableHead className="hidden md:table-cell">Added</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="max-w-0 pl-4">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/videos/${v.id}`}
                      className="relative hidden aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:block"
                    >
                      {v.thumbnail_url ? (
                        <img src={v.thumbnail_url} alt="" className="absolute inset-0 size-full object-cover" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-muted-foreground">
                          <Film className="size-5" />
                        </span>
                      )}
                    </Link>
                    <div className="grid min-w-0 gap-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link href={`/videos/${v.id}`} className="truncate font-medium hover:underline">
                          {v.title}
                        </Link>
                        {v.youtube_id && (
                          <Badge variant="outline" className="shrink-0">
                            <CirclePlay /> YouTube
                          </Badge>
                        )}
                      </div>
                      {v.status === "error" ? (
                        <span className="truncate text-xs text-destructive" title={v.error ?? ""}>
                          {v.error}
                        </span>
                      ) : (
                        v.summary && (
                          <span className="truncate text-xs text-muted-foreground" title={v.summary}>
                            {v.summary}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={v.status} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                  {v.duration != null ? fmtDuration(v.duration) : "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {new Date(v.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </TableCell>
                <TableCell className="pr-4">
                  <div className="flex justify-end gap-1">
                    {v.status === "ready" && (
                      <Button asChild variant="ghost" size="icon" className="size-8" title="Chat about this video">
                        <Link href={`/chat?video=${v.id}`} aria-label="Chat about this video">
                          <MessageSquare />
                        </Link>
                      </Button>
                    )}
                    <ConfirmDelete
                      title={`Delete "${v.title}"?`}
                      description="The video file, transcript and its search index will be permanently removed."
                      onConfirm={() => onDelete(v.id)}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-muted-foreground hover:text-destructive"
                        aria-label="Delete video"
                        title="Delete video"
                      >
                        <Trash2 />
                      </Button>
                    </ConfirmDelete>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-muted-foreground">
          Showing {start + 1}–{start + rows.length} of {videos.length}
        </p>
        {pageCount > 1 && (
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => go(e, page - 1)}
                  aria-disabled={page === 1}
                  className={cn(page === 1 && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
              {pageList(page, pageCount).map((p, i) =>
                p === null ? (
                  <PaginationItem key={`gap-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink href="#" isActive={p === page} onClick={(e) => go(e, p)}>
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => go(e, page + 1)}
                  aria-disabled={page === pageCount}
                  className={cn(page === pageCount && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  );
}
