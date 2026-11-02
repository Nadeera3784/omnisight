"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, type Conversation } from "./api";

type ConversationsState = {
  conversations: Conversation[];
  reload: () => Promise<void>;
};

const Ctx = createContext<ConversationsState | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const reload = useCallback(async () => {
    try {
      setConversations(await api<Conversation[]>("/conversations"));
    } catch {}
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return <Ctx.Provider value={{ conversations, reload }}>{children}</Ctx.Provider>;
}

export function useConversations() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConversations must be used inside ConversationsProvider");
  return ctx;
}
