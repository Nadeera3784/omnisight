import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const PROCESSING = ["pending", "queued", "downloading", "converting", "transcribing", "indexing"];

export default function StatusBadge({ status }: { status: string }) {
  if (status === "ready")
    return (
      <Badge variant="outline">
        <CheckCircle2 /> Ready
      </Badge>
    );
  if (status === "error")
    return (
      <Badge>
        <XCircle /> Error
      </Badge>
    );
  return (
    <Badge variant="secondary" className="capitalize">
      <Loader2 className="animate-spin" /> {status}
    </Badge>
  );
}
