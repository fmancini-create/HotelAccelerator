import { Suspense } from "react"
import ChatWidgetClient from "./chat-widget-client"

export default function ChatWidgetPage() {
  return (
    <Suspense fallback={<ChatWidgetLoading />}>
      <ChatWidgetClient />
    </Suspense>
  )
}

function ChatWidgetLoading() {
  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="flex items-center justify-between px-4 py-3 bg-[#8B7355] text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 animate-pulse" />
          <div>
            <div className="h-4 w-32 bg-white/20 rounded animate-pulse" />
            <div className="h-3 w-16 bg-white/20 rounded mt-1 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  )
}
