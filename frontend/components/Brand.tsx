import { ScanEye } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <ScanEye className="size-4" />
      </span>
      OmniSight
    </span>
  );
}
