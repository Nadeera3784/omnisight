"use client";

import { ChevronsUpDown, Library, LogOut, Monitor, Moon, Plus, Sun, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import Brand from "@/components/Brand";
import ConfirmDelete from "@/components/ConfirmDelete";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ConversationsProvider, useConversations } from "@/lib/conversations";

function UserMenu() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const initial = user?.name?.[0]?.toUpperCase() ?? "?";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">{initial}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{user?.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
          </div>
          <ChevronsUpDown className="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar() {
  const { conversations, reload } = useConversations();
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();

  // Close the mobile sheet after navigating
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);

  async function remove(id: string) {
    await api(`/conversations/${id}`, { method: "DELETE" });
    await reload();
    if (pathname === `/chat/${id}`) router.push("/chat");
  }

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <Link href="/" className="px-1 py-1">
          <Brand />
        </Link>
        <Button asChild className="w-full justify-start">
          <Link href="/chat">
            <Plus /> New chat
          </Link>
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/" || pathname.startsWith("/videos")}>
                  <Link href="/">
                    <Library /> Video library
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Chat history</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {conversations.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">No chats yet</p>}
              {conversations.map((c) => (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton asChild isActive={pathname === `/chat/${c.id}`} className="h-auto py-1.5" title={c.title}>
                    <Link href={`/chat/${c.id}`} className="flex flex-col items-start gap-0">
                      <span className="w-full truncate">{c.title}</span>
                      {c.video_title && (
                        <span className="w-full truncate text-xs text-muted-foreground">{c.video_title}</span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                  <ConfirmDelete
                    title="Delete this chat?"
                    description="The conversation and its messages will be permanently removed."
                    onConfirm={() => remove(c.id)}
                  >
                    <SidebarMenuAction showOnHover aria-label="Delete chat">
                      <Trash2 />
                    </SidebarMenuAction>
                  </ConfirmDelete>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user)
    return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</div>;

  return (
    <ConversationsProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">{children}</SidebarInset>
      </SidebarProvider>
    </ConversationsProvider>
  );
}
