"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChatView from "@/components/ChatView";

function NewChat() {
  const params = useSearchParams();
  const video = params.get("video") || undefined;
  return <ChatView initialVideoId={video} />;
}

export default function NewChatPage() {
  return (
    <Suspense>
      <NewChat />
    </Suspense>
  );
}
