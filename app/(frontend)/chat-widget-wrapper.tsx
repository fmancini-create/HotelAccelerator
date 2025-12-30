"use client"

import dynamic from "next/dynamic"

const ChatWidget = dynamic(() => import("@/components/chat-widget").then((mod) => mod.ChatWidget), {
  ssr: false,
  loading: () => null,
})

export function ChatWidgetWrapper() {
  return <ChatWidget />
}
