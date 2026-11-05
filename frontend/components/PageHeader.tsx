import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

/** Sticky top bar with the sidebar toggle; children fill the rest of the bar. */
export default function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="bg-background/95 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </header>
  );
}
