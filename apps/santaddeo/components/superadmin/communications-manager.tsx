"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HelpCircle, Bot, MessageSquareWarning } from "lucide-react"
import { GuideConversationsManager } from "./guide-conversations-manager"
import { ChatManagement } from "./chat-management"
import { FeedbackManager } from "./feedback-manager"

export function CommunicationsManager() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="guide-chat" className="space-y-4">
        <TabsList className="h-auto gap-1 flex-wrap">
          <TabsTrigger value="guide-chat" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            Chat Guida
          </TabsTrigger>
          <TabsTrigger value="taddeo-chat" className="gap-2">
            <Bot className="h-4 w-4" />
            Conversazioni Taddeo
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2">
            <MessageSquareWarning className="h-4 w-4" />
            Feedback / Upgrade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="guide-chat">
          <GuideConversationsManager />
        </TabsContent>

        <TabsContent value="taddeo-chat">
          <ChatManagement />
        </TabsContent>

        <TabsContent value="feedback">
          <FeedbackManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
