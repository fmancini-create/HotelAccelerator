"use client"

// v774 BUILD MARKER - This comment forces a new bundle hash
const FRONTEND_BUILD = "v774-clean-build"

import React, { useState, useEffect, useRef, useCallback, memo } from "react"
import { useRouter } from "next/navigation"
import { useAdminAuth } from "@/lib/admin-hooks"
import { createClient } from "@/lib/supabase/client"
import {
  Mail,
  Search,
  Send,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  Inbox,
  Loader2,
  MoreVertical,
  Paperclip,
  FileText,
  AlertCircle,
  Zap,
  Settings,
  Tag,
  Edit3,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MailOpen,
  Bug,
  MessageCircle,
  Phone,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatDistanceToNow, format } from "date-fns"
import { it } from "date-fns/locale"
import { EmailKpiBar } from "@/components/admin/email-kpi-bar"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type InboxMode = "smart" | "gmail"

// ==================== GMAIL MODE TYPES (Direct from Gmail API) ====================
interface GmailThread {
  id: string
  gmail_thread_id: string
  subject: string
  snippet: string
  from: { name: string; email: string }
  labels: string[]
  isUnread: boolean
  isStarred: boolean
  internalDate: number
  date: string
  messagesCount: number // Assuming this might be useful, though not explicitly in the original JSON example
}

interface GmailMessage {
  id: string
  gmail_id: string
  gmail_thread_id: string
  gmail_labels: string[]
  gmail_internal_date: string
  subject: string
  from: { name: string; email: string }
  to: string
  content: string
  content_type: string
  snippet: string
  sender_type: "customer" | "agent"
  isUnread: boolean
  isStarred: boolean
  internalDate: number
}

interface GmailLabelInfo {
  id: string
  name: string
  type: string
  messagesTotal: number
  messagesUnread: number
  threadsTotal: number
  threadsUnread: number
  color?: string | null
}

interface GmailDebugInfo {
  rawThreadsCount: number
  processedThreadsCount: number
  hasNextPage: boolean
  labelId: string
  resultSizeEstimate?: number
  pageTokenHistory?: string[]
}

// ==================== SMART MODE TYPES (DB-driven) ====================
interface Contact {
  id: string
  name: string
  email: string
  phone: string
  whatsapp?: string
}

interface Conversation {
  id: string
  channel: "chat" | "whatsapp" | "email" | "telegram"
  status: "open" | "pending" | "resolved" | "spam"
  subject: string | null
  last_message_at: string
  unread_count: number
  is_starred: boolean
  contact: Contact | null
  lastMessage: {
    content: string
    sender_type: string
    created_at: string
  } | null
}

interface Message {
  id: string
  content: string
  sender_type: "customer" | "agent" | "system"
  sender_id: string | null
  content_type: string
  created_at: string
  received_at?: string
  status?: "received" | "read" | "replied"
  attachments: any[]
  channel?: string
}

interface SmartDebugInfo {
  timestamp: string
  channel: {
    id: string
    email: string
    historyId: string
    lastSyncAt: string
    watchExpiration: string
    watchActive: boolean
    pushEnabled: boolean
  } | null
  database: {
    messagesCount: number
    conversationsCount: number
    lastMessageAt: string | null
    lastMessageSubject: string | null
  }
  recentMessages: Array<{
    id: string
    subject: string
    from: string
    createdAt: string
  }>
  webhookUrl: string
}

const channelConfig = {
  chat: { icon: MessageCircle, color: "text-green-600 bg-green-100", name: "Chat" },
  whatsapp: { icon: Phone, color: "text-emerald-600 bg-emerald-100", name: "WhatsApp" },
  email: { icon: Mail, color: "text-blue-600 bg-blue-100", name: "Email" },
  telegram: { icon: Send, color: "text-sky-600 bg-sky-100", name: "Telegram" },
}

const statusConfig = {
  open: { label: "Aperto", color: "bg-amber-100 text-amber-700" },
  pending: { label: "In attesa", color: "bg-orange-100 text-orange-700" },
  resolved: { label: "Risolto", color: "bg-green-100 text-green-700" },
  spam: { label: "Spam", color: "bg-red-100 text-red-700" },
}

// Gmail system folder config
const GMAIL_SYSTEM_FOLDERS = [
  { id: "INBOX", label: "Posta in arrivo", icon: Inbox },
  { id: "STARRED", label: "Speciali", icon: Star },
  { id: "SENT", label: "Posta inviata", icon: Send },
  { id: "DRAFT", label: "Bozze", icon: FileText },
  { id: "SPAM", label: "Spam", icon: AlertCircle },
  { id: "TRASH", label: "Cestino", icon: Trash2 },
]

const GmailMessageBody = memo(({ content, contentType }: { content: string; contentType?: string }) => {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = React.useState(300)

  const isHtml = contentType === "text/html" || (content && /<[a-z][\s\S]*>/i.test(content))
  const isEmpty = !content || content.trim().length === 0

  // Sanitize HTML: remove only dangerous elements, keep all styles
  const sanitizeForGmail = (html: string): string => {
    let sanitized = html
    // Remove <script> tags and content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove event handlers
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "")
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "")
    // Remove javascript: URLs
    sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    return sanitized
  }

  useEffect(() => {
    if (!isHtml || !iframeRef.current || isEmpty) return

    const iframe = iframeRef.current
    let resizeObserver: ResizeObserver | null = null

    const updateHeight = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (doc?.body) {
          // Use multiple methods to get accurate height
          const bodyHeight = doc.body.scrollHeight
          const docHeight = doc.documentElement?.scrollHeight || 0
          const height = Math.max(bodyHeight, docHeight, 100)
          if (height > 0 && height !== iframeHeight) {
            setIframeHeight(height + 40)
          }
        }
      } catch (e) {
        // Cross-origin error - use default height
      }
    }

    const handleLoad = () => {
      updateHeight()

      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (doc?.body) {
          // Observe body for dynamic content changes
          resizeObserver = new ResizeObserver(() => {
            updateHeight()
          })
          resizeObserver.observe(doc.body)

          // Make all links open in new tab
          doc.querySelectorAll("a").forEach((link) => {
            link.setAttribute("target", "_blank")
            link.setAttribute("rel", "noopener noreferrer")
          })

          // Re-check height after images load
          doc.querySelectorAll("img").forEach((img) => {
            if (!img.complete) {
              img.addEventListener("load", updateHeight)
              img.addEventListener("error", updateHeight)
            }
          })
        }
      } catch (e) {
        // Ignore cross-origin errors
      }
    }

    iframe.addEventListener("load", handleLoad)

    // Also check height after a delay for slow-rendering content
    const timeoutId = setTimeout(updateHeight, 500)

    return () => {
      iframe.removeEventListener("load", handleLoad)
      resizeObserver?.disconnect()
      clearTimeout(timeoutId)
    }
  }, [content, isHtml, isEmpty, iframeHeight])

  if (isEmpty) {
    return <div className="p-4 text-muted-foreground text-sm italic">(Nessun contenuto)</div>
  }

  if (isHtml) {
    const sanitizedContent = sanitizeForGmail(content)

    // Gmail-identical CSS reset and styling
    const gmailStyles = `
      /* Gmail-identical base reset */
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        min-height: auto;
        background: #fff;
      }
      body {
        padding: 0;
        font-family: Roboto, RobotoDraft, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 20px;
        color: #202124;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      
      /* Preserve original email styles but ensure readability */
      a { color: #1a73e8; text-decoration: none; }
      a:hover { text-decoration: underline; }
      
      /* Images */
      img { 
        max-width: 100%; 
        height: auto; 
        display: inline-block;
      }
      
      /* Tables - preserve email layouts */
      table { 
        max-width: 100%; 
        border-collapse: collapse;
      }
      
      /* Gmail quote styling */
      .gmail_quote, 
      .gmail_attr {
        margin: 0;
        padding-left: 1ex;
        border-left: 1px solid #ccc;
        color: #5f6368;
      }
      blockquote {
        margin: 0 0 0 0.8ex;
        padding-left: 1ex;
        border-left: 1px solid #ccc;
        color: #5f6368;
      }
      
      /* Pre/code blocks */
      pre, code {
        font-family: monospace;
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      
      /* Lists */
      ul, ol { padding-left: 20px; margin: 0.5em 0; }
      
      /* Paragraphs */
      p { margin: 0 0 1em 0; }
      
      /* Headers - keep original styling if present */
      h1, h2, h3, h4, h5, h6 { margin: 0.5em 0; }
      
      /* Horizontal rules */
      hr { border: none; border-top: 1px solid #dadce0; margin: 1em 0; }
    `

    return (
      <div className="gmail-message-body w-full">
        <iframe
          ref={iframeRef}
          srcDoc={`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>${gmailStyles}</style>
</head>
<body>${sanitizedContent}</body>
</html>`}
          style={{
            width: "100%",
            height: `${iframeHeight}px`,
            border: "none",
            display: "block",
            backgroundColor: "#fff",
          }}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          title="Email content"
        />
      </div>
    )
  }

  // Plain text fallback - Gmail style
  return (
    <div
      className="gmail-message-body w-full"
      style={{
        whiteSpace: "pre-wrap",
        fontFamily: "Roboto, RobotoDraft, Helvetica, Arial, sans-serif",
        fontSize: "14px",
        lineHeight: "20px",
        color: "#202124",
        wordWrap: "break-word",
        overflowWrap: "break-word",
      }}
    >
      {content}
    </div>
  )
})
GmailMessageBody.displayName = "GmailMessageBody"

export default function InboxPage() {
  const router = useRouter()
  const { adminUser, isLoading: authLoading } = useAdminAuth()

  const [inboxMode, setInboxMode] = useState<InboxMode>("gmail")

  // ==================== GMAIL MODE STATE (API-driven) ====================
  const [gmailLabelId, setGmailLabelId] = useState("INBOX")
  const [gmailThreads, setGmailThreads] = useState<GmailThread[]>([])
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([])
  const [selectedGmailThread, setSelectedGmailThread] = useState<GmailThread | null>(null)
  const [isThreadReady, setIsThreadReady] = useState(false)
  const [gmailSystemLabels, setGmailSystemLabels] = useState<GmailLabelInfo[]>([])
  const [gmailUserLabels, setGmailUserLabels] = useState<GmailLabelInfo[]>([])
  const [gmailNextPageToken, setGmailNextPageToken] = useState<string | null>(null)
  const [gmailPrevPageTokens, setGmailPrevPageTokens] = useState<string[]>([]) // Track page history for back navigation
  const [gmailTotalEstimate, setGmailTotalEstimate] = useState(0)
  const [gmailLoading, setGmailLoading] = useState(false)
  const [gmailThreadLoading, setGmailThreadLoading] = useState(false)
  const [gmailSearchQuery, setGmailSearchQuery] = useState("")
  const [labelsExpanded, setLabelsExpanded] = useState(true)
  const [gmailDebugInfo, setGmailDebugInfo] = useState<GmailDebugInfo | null>(null)
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [gmailCurrentPage, setGmailCurrentPage] = useState(1)
  const [gmailApiVersion, setGmailApiVersion] = useState<string | null>(null)
  // Add new state for selected threads
  const [selectedGmailThreadIds, setSelectedGmailThreadIds] = useState<Set<string>>(new Set())

  // ==================== SMART MODE STATE (DB-driven) ====================
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("open")
  const [isLoading, setIsLoading] = useState(true)
  const [smartDebugInfo, setSmartDebugInfo] = useState<SmartDebugInfo | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null) // Added for debug info in smart mode
  const [lastSyncStatus, setLastSyncStatus] = useState<string>("") // Added for last sync status

  // ==================== SHARED STATE ====================
  const [replyText, setReplyText] = useState("")
  const [replyChannel, setReplyChannel] = useState<string>("email")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<File[]>([])
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null)
  const [showComposeModal, setShowComposeModal] = useState(false)
  const [composeData, setComposeData] = useState({ to: "", subject: "", body: "" })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const realtimeChannelRef = useRef<any>(null)
  const markedAsReadRef = useRef<Set<string>>(new Set())
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // ==================== GMAIL MODE FUNCTIONS (Direct API calls) ====================

  const canPerformGmailAction = useCallback((): boolean => {
    if (!selectedGmailThread) return false
    if (!isThreadReady) return false
    // v774: REMOVED explicit label check here - it's handled within the specific action handlers if needed,
    // but the core requirement is just thread readiness for basic actions like star, archive, etc.
    // if (!selectedGmailThread.labels) return false
    // if (!Array.isArray(selectedGmailThread.labels)) return false
    // if (selectedGmailThread.labels.length === 0) return false
    return true
  }, [selectedGmailThread, isThreadReady])

  // Helper to check if thread has valid labels
  const isThreadDataValid = (thread: GmailThread): boolean => {
    return thread.labels && Array.isArray(thread.labels) && thread.labels.length > 0
  }

  const loadGmailLabels = useCallback(async () => {

    try {
      const res = await fetch("/api/gmail/labels")
      if (res.ok) {
        const data = await res.json()
        setGmailSystemLabels(data.systemLabels || [])
        setGmailUserLabels(data.labels || [])
      }
    } catch (error) {
      console.error("[Gmail] Error loading labels:", error)
    }
  }, [])

  const loadGmailThreads = useCallback(
    async (labelId: string = gmailLabelId, pageToken?: string, query?: string, isNextPage = false) => {
      setGmailLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("labelId", labelId)
        if (pageToken) params.set("pageToken", pageToken)
        if (query) params.set("q", query)

        const fullUrl = `/api/gmail/threads?${params}`
        const res = await fetch(fullUrl)

        if (res.ok) {
          const data = await res.json()

          setGmailApiVersion(data.debugVersion || null)
          setGmailThreads(data.threads || [])
          setGmailNextPageToken(data.nextPageToken || null)
          setGmailTotalEstimate(data.resultSizeEstimate || 0)

          setGmailDebugInfo({
            rawThreadsCount: data._debug?.rawThreadsCount || 0,
            processedThreadsCount: data._debug?.processedThreadsCount || 0,
            hasNextPage: !!data.nextPageToken,
            labelId,
            resultSizeEstimate: data.resultSizeEstimate,
          })
        } else {
          const errorBody = await res.text()
          console.error("[v0] FRONTEND: Error loading threads:", res.status, errorBody)
          setGmailThreads([])
          setGmailApiVersion(null)
        }
      } catch (error) {
        console.error("[v0] DEBUG: Exception in loadGmailThreads:", error)
        setGmailThreads([])
        setGmailApiVersion(null)
      } finally {
        setGmailLoading(false)
      }
    },
    [gmailLabelId, gmailSearchQuery], // Added dependencies
  )

  const loadGmailThread = useCallback(async (threadId: string) => {
    setGmailThreadLoading(true)
    setGmailMessages([])
    try {
      const res = await fetch(`/api/gmail/threads/${threadId}`)
      if (res.ok) {
        const data = await res.json()
        setGmailMessages(data.messages || [])
      } else {
        const errorBody = await res.text()
        console.error("[v0] loadGmailThread error:", res.status, errorBody)
      }
    } catch (error) {
      console.error("[v0] loadGmailThread exception:", error)
    } finally {
      setGmailThreadLoading(false)
    }
  }, [])

  const handleSelectGmailThread = useCallback(async (thread: GmailThread) => {
    console.log(`[v0] v771: handleSelectGmailThread START - thread.id=${thread.id}`)

    // Reset state for new selection
    setIsThreadReady(false)
    setGmailMessages([])
    setGmailThreadLoading(true)

    // Optimistically show which thread is selected (for UI highlighting)
    // But mark as NOT ready - actions are disabled
    setSelectedGmailThread({ ...thread, labels: thread.labels || [] })

    try {
      // Fetch full thread detail from API
      const res = await fetch(`/api/gmail/threads/${thread.id}`)

      if (!res.ok) {
        const errorBody = await res.text()
        console.error(`[v0] v771: Failed to load thread detail: ${res.status}`, errorBody)
        setError("Errore caricamento thread")
        return
      }

      const data = await res.json()
      console.log(`[v0] v771: Thread detail loaded, messages=${data.messages?.length || 0}`)

      // Get labels from the response
      // The thread detail API should return labels on each message
      // Aggregate all labels from messages
      const allLabels = new Set<string>()
      data.messages?.forEach((msg: any) => {
        msg.labelIds?.forEach((label: string) => allLabels.add(label))
      })

      // Also include labels from the original thread if available
      thread.labels?.forEach((label: string) => allLabels.add(label))

      const finalLabels = Array.from(allLabels)
      console.log(`[v0] v771: Thread labels aggregated: ${JSON.stringify(finalLabels)}`)

      // HARD CHECK: If no labels, this is a data bug
      if (finalLabels.length === 0) {
        console.error(`[v0] v771: ❌ FATAL - Thread ${thread.id} has NO LABELS after full fetch`)
        setError("Dati thread incompleti - ricarica la pagina")
        setSelectedGmailThread(null)
        setGmailMessages([])
        return
      }

      // NOW set the fully materialized thread with guaranteed labels
      const fullThread: GmailThread = {
        ...thread,
        labels: finalLabels,
      }

      setSelectedGmailThread(fullThread)
      setGmailMessages(data.messages || [])

      // Mark thread as READY - actions are now enabled
      setIsThreadReady(true)
      console.log(`[v0] v771: ✓ Thread ${thread.id} READY with ${finalLabels.length} labels`)
    } catch (error) {
      console.error(`[v0] v771: Exception loading thread:`, error)
      setError("Errore di rete")
      setSelectedGmailThread(null)
    } finally {
      setGmailThreadLoading(false)
    }
  }, [])

  // Gmail actions - IMPORTANT: This works with THREAD IDs only!
  const handleGmailAction = useCallback(
    async (threadId: string, action: string) => {
      console.log(`[v0] v774: handleGmailAction - threadId=${threadId}, action=${action}`)

      if (!isThreadReady || !selectedGmailThread) {
        console.warn(`[v0] v774: ACTION BLOCKED - thread not ready`)
        setError("Caricamento thread in corso, riprova tra un istante")
        return false
      }

      try {
        setIsActionLoading(threadId)

        const res = await fetch(`/api/gmail/threads/${threadId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        })

        const responseText = await res.text()
        console.log(`[v0] v774: Response: ${res.status}`)

        if (!res.ok) {
          let error
          try {
            error = JSON.parse(responseText)
          } catch {
            error = { message: responseText }
          }
          console.error("[v0] v774: Action failed:", error)
          setError(error.error || error.message || `Errore durante ${action}`)
          return false
        }

        console.log(`[v0] v774: Action ${action} successful`)
        setTimeout(() => loadGmailThreads(), 500)
        return true
      } catch (error) {
        console.error("[v0] v774: Network error:", error)
        setError("Errore di rete durante l'azione")
        return false
      } finally {
        setIsActionLoading(null)
      }
    },
    [loadGmailThreads, isThreadReady, selectedGmailThread],
  )

  const handleGmailNotSpam = useCallback(
    async (thread: GmailThread, e?: React.MouseEvent) => {
      e?.stopPropagation()

      if (!isThreadReady || !selectedGmailThread) {
        setError("Caricamento thread in corso, riprova tra un istante")
        return false
      }

      const success = await handleGmailAction(selectedGmailThread.id, "not_spam")
      if (success) {
        setGmailThreads((prev) => prev.filter((t) => t.id !== selectedGmailThread.id))
        setSelectedGmailThread(null)
        setGmailMessages([]) // Clear messages too
        setIsThreadReady(false) // Ensure thread is not marked as ready
      }
      return success
    },
    [handleGmailAction, isThreadReady, selectedGmailThread],
  )

  const handleGmailArchive = useCallback(
    async (thread: GmailThread, e?: React.MouseEvent) => {
      e?.stopPropagation()

      if (!isThreadReady || !selectedGmailThread) {
        setError("Caricamento thread in corso, riprova tra un istante")
        return false
      }

      const success = await handleGmailAction(selectedGmailThread.id, "archive")
      if (success) {
        setGmailThreads((prev) => prev.filter((t) => t.id !== selectedGmailThread.id))
        setSelectedGmailThread(null)
        setGmailMessages([])
        setIsThreadReady(false)
      }
      return success
    },
    [handleGmailAction, isThreadReady, selectedGmailThread],
  )

  const handleGmailTrash = useCallback(
    async (thread: GmailThread, e?: React.MouseEvent) => {
      e?.stopPropagation()

      if (!isThreadReady || !selectedGmailThread) {
        setError("Caricamento thread in corso, riprova tra un istante")
        return false
      }

      const success = await handleGmailAction(selectedGmailThread.id, "trash")
      if (success) {
        setGmailThreads((prev) => prev.filter((t) => t.id !== selectedGmailThread.id))
        setSelectedGmailThread(null)
        setGmailMessages([])
        setIsThreadReady(false)
      }
      return success
    },
    [handleGmailAction, isThreadReady, selectedGmailThread],
  )

  const handleGmailStarToggle = useCallback(
    async (thread: GmailThread, e?: React.MouseEvent) => {
      e?.stopPropagation()

      // This allows starring threads from the list without selecting them first
      if (!thread || !thread.id) {
        console.error("[v0] handleGmailStarToggle: No thread provided")
        return false
      }

      // Determine action based on current star status from the passed thread
      const isStarred = thread.isStarred
      const action = isStarred ? "unstar" : "star"

      console.log(`[v0] Star toggle: thread=${thread.id}, isStarred=${isStarred}, action=${action}`)

      const success = await handleGmailAction(thread.id, action)
      if (success) {
        setGmailThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, isStarred: !isStarred } : t)))

        // Also update selectedGmailThread if it's the same thread
        if (selectedGmailThread?.id === thread.id) {
          setSelectedGmailThread((prev) =>
            prev
              ? {
                  ...prev,
                  isStarred: !isStarred,
                }
              : null,
          )
        }
      }
      return success
    },
    [handleGmailAction, selectedGmailThread],
  )

  const handleGmailMarkAsRead = useCallback(
    async (thread: GmailThread, markAsUnread = false, e?: React.MouseEvent) => {
      e?.stopPropagation()

      if (!isThreadReady || !selectedGmailThread) {
        setError("Caricamento thread in corso, riprova tra un istante")
        return false
      }

      const action = markAsUnread ? "markAsUnread" : "markAsRead"
      const success = await handleGmailAction(selectedGmailThread.id, action)
      if (success) {
        // Update local state to reflect the change
        setSelectedGmailThread((prev) =>
          prev
            ? {
                ...prev,
                isUnread: markAsUnread, // Set the unread status
              }
            : null,
        )
        // Refresh the thread list to ensure UI consistency
        loadGmailThreads(gmailLabelId, undefined, gmailSearchQuery)
      }
      return success
    },
    [handleGmailAction, isThreadReady, selectedGmailThread, gmailLabelId, gmailSearchQuery],
  )

  // Load Gmail data when mode changes to gmail
  useEffect(() => {
    if (inboxMode === "gmail" && !authLoading && adminUser) {
      loadGmailLabels()
      loadGmailThreads(gmailLabelId)

      const gmailPollInterval = setInterval(() => {
        loadGmailThreads(gmailLabelId, undefined, gmailSearchQuery)
      }, 30000)

      return () => clearInterval(gmailPollInterval)
    }
  }, [inboxMode, authLoading, adminUser, loadGmailLabels, loadGmailThreads, gmailLabelId, gmailSearchQuery])

  // Load Gmail thread when selected
  useEffect(() => {
    if (inboxMode === "gmail" && selectedGmailThread) {
      // NOTE: loadGmailThread is called inside handleSelectGmailThread now
      // This useEffect is now redundant for loading messages but could be used for other side effects
    }
  }, [inboxMode, selectedGmailThread]) // Removed loadGmailThread dependency as it's not called here

  // Handle Gmail label change
  const handleGmailLabelChange = (labelId: string) => {
    setGmailLabelId(labelId)
    setSelectedGmailThread(null) // Clear selected thread
    setGmailMessages([]) // Clear messages
    setIsThreadReady(false) // Thread is no longer ready
    setGmailPrevPageTokens([]) // Reset pagination
    setGmailCurrentPage(1)
    setSelectedGmailThreadIds(new Set()) // Clear selected threads
    loadGmailThreads(labelId)
  }

  const handleGmailNextPage = () => {
    if (gmailNextPageToken) {
      // Save current page token for back navigation
      setGmailPrevPageTokens((prev) => [...prev, gmailNextPageToken])
      setGmailCurrentPage((prev) => prev + 1)
      loadGmailThreads(gmailLabelId, gmailNextPageToken, gmailSearchQuery || undefined, true)
    }
  }

  const handleGmailPrevPage = () => {
    if (gmailPrevPageTokens.length > 0) {
      const newTokens = [...gmailPrevPageTokens]
      const prevToken = newTokens.pop()
      setGmailPrevPageTokens(newTokens)
      setGmailCurrentPage((prev) => prev - 1)

      // If we're going back to first page, don't use token
      if (newTokens.length === 0) {
        loadGmailThreads(gmailLabelId, undefined, gmailSearchQuery || undefined)
      } else {
        loadGmailThreads(gmailLabelId, newTokens[newTokens.length - 1], gmailSearchQuery || undefined)
      }
    }
  }

  // Get label count - now uses threadsTotal from Gmail API
  const getLabelCount = (labelId: string): { total: number; unread: number } => {
    const label = gmailSystemLabels.find((l) => l.id === labelId) || gmailUserLabels.find((l) => l.id === labelId)
    return {
      total: label?.threadsTotal || 0,
      unread: label?.threadsUnread || 0,
    }
  }

  const handleGmailSearch = () => {
    loadGmailThreads(gmailLabelId, undefined, gmailSearchQuery)
  }

  const handleSelectAllGmailThreads = useCallback(
    (checked: boolean | "indeterminate") => {
      if (checked === true) {
        setSelectedGmailThreadIds(new Set(gmailThreads.map((t) => t.id)))
      } else {
        setSelectedGmailThreadIds(new Set())
      }
    },
    [gmailThreads],
  )

  const handleGmailCheckboxToggle = useCallback((threadId: string) => {
    setSelectedGmailThreadIds((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }, [])

  // ==================== SMART MODE FUNCTIONS (DB-driven ONLY - NO Gmail API calls) ====================

  const loadConversations = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams()
      if (statusFilter) queryParams.set("status", statusFilter)
      queryParams.set("channel", "email") // Assuming email channels for smart mode
      queryParams.set("mode", "smart")
      if (searchQuery) queryParams.set("search", searchQuery)

      const res = await fetch(`/api/inbox/conversations?${queryParams}`)
      if (!res.ok) return

      const data = await res.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error("Error loading conversations:", error)
    } finally {
      setIsLoading(false)
    }
  }, [statusFilter, searchQuery])

  // Database is the single source of truth, updated only by webhook

  const loadSmartDebugInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/debug")
      if (res.ok) {
        const data = await res.json()
        setSmartDebugInfo(data)
      }
    } catch (error) {
      console.error("[v0] Error loading smart debug info:", error)
    }
  }, [])

  const loadMessages = async (conversationId: string, isInitialLoad = false) => {
    try {
      const res = await fetch(`/api/inbox/${conversationId}`)
      if (!res.ok) return

      const data = await res.json()
      if (data.messages) {
        const sortedMessages = [...data.messages].sort((a, b) => {
          const dateA = a.received_at || a.created_at
          const dateB = b.received_at || b.created_at
          return new Date(dateA).getTime() - new Date(dateB).getTime()
        })
        setMessages(sortedMessages)
      }
      if (data.conversation && isInitialLoad) {
        setSelectedConversation(data.conversation)
        setReplyChannel(data.conversation.channel)
      }
    } catch (error) {
      console.error("Error loading messages:", error)
    }
  }

  const markMessagesAsRead = useCallback(async (messageIds: string[], conversationId: string) => {
    const newIds = messageIds.filter((id) => !markedAsReadRef.current.has(id))
    if (newIds.length === 0) return

    try {
      await fetch(`/api/inbox/${conversationId}/messages/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: newIds }),
      })
      newIds.forEach((id) => markedAsReadRef.current.add(id))
    } catch (error) {
      console.error("Error marking messages as read:", error)
    }
  }, [])

  const performInitialSmartSync = async () => {
    if (inboxMode !== "smart") return

    setLastSyncStatus("Sincronizzazione in corso...")

    try {
      // Get channel info for sync
      const channelRes = await fetch("/api/inbox/debug")
      if (!channelRes.ok) {
        setLastSyncStatus("Errore: impossibile ottenere info canale")
        return
      }

      const debugData = await channelRes.json()
      setDebugInfo(debugData)

      if (!debugData.channel?.id || !debugData.channel?.property_id) {
        setLastSyncStatus("Nessun canale configurato")
        return
      }

      // Trigger sync to populate database with latest emails
      const syncRes = await fetch("/api/channels/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: debugData.channel.id,
          property_id: debugData.channel.property_id,
        }),
      })

      if (syncRes.ok) {
        const syncData = await syncRes.json()
        setLastSyncStatus(`Sincronizzato: ${syncData.imported} nuovi, ${syncData.duplicates} duplicati`)
        loadConversations()
      } else {
        setLastSyncStatus(`Errore sync: ${syncRes.status}`)
      }
    } catch (error) {
      console.error("[v0] FRONTEND: Smart sync error:", error)
      setLastSyncStatus(`Errore: ${error}`)
    }
  }

  useEffect(() => {
    if (inboxMode === "smart") {
      performInitialSmartSync()
    }
  }, [inboxMode])

  useEffect(() => {
    if (inboxMode === "smart" && !authLoading && adminUser) {
      // Load conversations from DB
      loadConversations()

      // Load debug info
      loadSmartDebugInfo()

      pollIntervalRef.current = setInterval(() => {
        loadConversations()
      }, 30000)

      // Debug info refresh every 60 seconds
      const debugInterval = setInterval(loadSmartDebugInfo, 60000)

      const supabase = createClient()

      const messagesChannel = supabase
        .channel("smart-inbox-messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          // Reload conversations to show new message
          loadConversations()
        })
        .subscribe((status) => {
        })

      const conversationsChannel = supabase
        .channel("smart-inbox-conversations")
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
          loadConversations()
        })
        .subscribe((status) => {
          // Realtime subscription status
        })

      return () => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
        clearInterval(debugInterval)
        supabase.removeChannel(messagesChannel)
        supabase.removeChannel(conversationsChannel)
      }
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    }
  }, [inboxMode, authLoading, adminUser, loadConversations, loadSmartDebugInfo])

  useEffect(() => {
    if (inboxMode === "smart" && selectedConversationId) {
      loadMessages(selectedConversationId, true)
    }
  }, [inboxMode, selectedConversationId])

  useEffect(() => {
    if (inboxMode === "smart" && messages.length > 0 && selectedConversationId) {
      const receivedCustomerMessages = messages
        .filter((m) => m.sender_type === "customer" && m.status === "received")
        .map((m) => m.id)
      if (receivedCustomerMessages.length > 0) {
        markMessagesAsRead(receivedCustomerMessages, selectedConversationId)
      }
    }
  }, [inboxMode, messages, selectedConversationId, markMessagesAsRead])

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setSelectedConversation(conv)
    setSelectedConversationId(conv.id)
    setMessages([])
  }, [])

  const handleToggleStar = async (conv: Conversation, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await fetch(`/api/inbox/${conv.id}/toggle-star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_starred: !conv.is_starred }),
      })
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, is_starred: !c.is_starred } : c)))
      if (selectedConversation?.id === conv.id) {
        setSelectedConversation({ ...selectedConversation, is_starred: !selectedConversation.is_starred })
      }
    } catch (error) {
      console.error("Error toggling star:", error)
    }
  }

  const handleArchive = async (convId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await fetch(`/api/inbox/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      })
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (selectedConversation?.id === convId) {
        setSelectedConversation(null)
        setSelectedConversationId(null)
        setMessages([])
      }
    } catch (error) {
      console.error("Error archiving:", error)
    }
  }

  const handleMarkAsSpam = async (convId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await fetch(`/api/inbox/${convId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "spam" }),
      })
      setConversations((prev) => prev.filter((c) => c.id !== convId))
      if (selectedConversation?.id === convId) {
        setSelectedConversation(null)
        setSelectedConversationId(null)
        setMessages([])
      }
    } catch (error) {
      console.error("Error marking as spam:", error)
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim()) return

    setIsSending(true)
    setError(null) // Clear previous errors
    try {
      // Gmail mode: use selected thread
      if (inboxMode === "gmail" && selectedGmailThread) {
        const res = await fetch(`/api/gmail/threads/${selectedGmailThread.id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: replyText }),
        })
        if (res.ok) {
          setReplyText("")
          await loadGmailThread(selectedGmailThread.id)
          // Refresh thread list to update unread status if needed
          await loadGmailThreads(gmailLabelId)
        } else {
          const data = await res.json()
          setError(data.error || "Errore durante l'invio della risposta")
        }
      }
      // Smart mode: use selected conversation
      else if (selectedConversation) {
        const res = await fetch(`/api/inbox/${selectedConversation.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: replyText,
            channel: replyChannel === "same" ? selectedConversation.channel : replyChannel,
          }),
        })
        if (res.ok) {
          setReplyText("")
          await loadMessages(selectedConversation.id, false)
          // Update conversations list to reflect potential unread count changes or last message
          loadConversations()
        } else {
          const data = await res.json()
          setError(data.error || "Errore durante l'invio della risposta")
        }
      }
    } catch (error) {
      console.error("Error sending reply:", error)
      setError("Errore di rete durante l'invio della risposta")
    } finally {
      setIsSending(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setAttachments(Array.from(e.target.files))
  }

  // Email content renderer
  const renderEmailContent = (content: string, contentType?: string) => {
    return <GmailMessageBody content={content} contentType={contentType} />
  }

  const handleComposeEmail = async () => {
    if (!composeData.to || !composeData.body) {
      setError("Inserisci destinatario e messaggio")
      return
    }

    setIsSending(true)
    setError(null) // Clear previous errors
    try {
      const res = await fetch("/api/gmail/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(composeData),
      })

      if (res.ok) {
        setShowComposeModal(false)
        setComposeData({ to: "", subject: "", body: "" })
        // Refresh lists
        if (inboxMode === "gmail") {
          await loadGmailThreads(gmailLabelId)
        } else {
          await loadConversations()
        }
      } else {
        const data = await res.json()
        setError(data.error || "Errore durante l'invio")
      }
    } catch (error) {
      console.error("Compose error:", error)
      setError("Errore durante l'invio")
    } finally {
      setIsSending(false)
    }
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f6f8fc]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!adminUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f6f8fc]">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Accesso richiesto</h2>
          <p className="text-muted-foreground mb-4">Devi effettuare il login per accedere all'inbox.</p>
          <Button onClick={() => router.push("/admin/login")}>Vai al login</Button>
        </div>
      </div>
    )
  }

  const SmartDebugPanel = () => {
    if (!showDebugPanel || !smartDebugInfo) return null

    const watchStatus = smartDebugInfo.channel?.watchActive
    const lastSync = smartDebugInfo.channel?.lastSyncAt
      ? formatDistanceToNow(new Date(smartDebugInfo.channel.lastSyncAt), { addSuffix: true, locale: it })
      : "mai"

    return (
      <div className="absolute top-12 right-4 z-50 bg-gray-900 text-white p-4 rounded-lg shadow-xl text-xs max-w-md">
        <div className="font-bold mb-2 flex items-center gap-2">
          <Database className="h-4 w-4" />
          Smart Mode Debug (DB Source of Truth)
        </div>

        <div className="space-y-2">
          <div className="border-b border-gray-700 pb-2">
            <div className="font-semibold text-yellow-400">Gmail Watch Status</div>
            <div>Push enabled: {smartDebugInfo.channel?.pushEnabled ? "✅" : "❌"}</div>
            <div>Watch active: {watchStatus ? "✅" : "❌ EXPIRED"}</div>
            <div>Watch expires: {smartDebugInfo.channel?.watchExpiration || "N/A"}</div>
          </div>

          <div className="border-b border-gray-700 pb-2">
            <div className="font-semibold text-yellow-400">Sync Status</div>
            <div>Last webhook sync: {lastSync}</div>
            <div>History ID: {smartDebugInfo.channel?.historyId || "N/A"}</div>
          </div>

          <div className="border-b border-gray-700 pb-2">
            <div className="font-semibold text-yellow-400">Database</div>
            <div>Messages in DB: {smartDebugInfo.database.messagesCount}</div>
            <div>Conversations: {smartDebugInfo.database.conversationsCount}</div>
            <div>Last message: {smartDebugInfo.database.lastMessageSubject?.substring(0, 30) || "N/A"}</div>
          </div>

          <div>
            <div className="font-semibold text-yellow-400">Recent Messages (DB)</div>
            {smartDebugInfo.recentMessages.slice(0, 3).map((m, i) => (
              <div key={i} className="text-gray-400 truncate">
                {m.subject?.substring(0, 25) || "No subject"} - {m.from?.split("@")[0]}
              </div>
            ))}
          </div>

          <div className="pt-2 text-gray-500">Webhook URL: {smartDebugInfo.webhookUrl}</div>
        </div>

        <Button size="sm" variant="outline" className="mt-2 w-full text-xs bg-transparent" onClick={loadSmartDebugInfo}>
          Refresh Debug Info
        </Button>
      </div>
    )
  }

  // ==================== RENDER ====================

  // Shared: left nav folders (used in both modes)
  const NavFolder = ({
    id, label, icon: Icon, isActive, unread, onClick,
  }: { id: string; label: string; icon: any; isActive: boolean; unread?: number; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 pl-4 pr-3 py-[6px] text-[14px] rounded-r-full transition-colors ${
        isActive ? "bg-[#d3e3fd] text-[#001d35] font-semibold" : "text-[#444746] hover:bg-[#e2e3e7]"
      }`}
    >
      <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? "text-[#001d35]" : "text-[#444746]"}`} />
      <span className="flex-1 text-left truncate">{label}</span>
      {unread != null && unread > 0 && (
        <span className={`text-[13px] font-bold ${isActive ? "text-[#001d35]" : "text-[#444746]"}`}>{unread}</span>
      )}
    </button>
  )

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Gmail-style top bar */}
      <header className="h-16 flex-shrink-0 flex items-center gap-3 px-4 bg-white border-b border-gray-200/50">
        {/* Hamburger menu */}
        <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        
        {/* Gmail logo */}
        <div className="flex items-center gap-2">
          <svg width="32" height="32" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z"/><path fill="#1e88e5" d="M3,16.2l3.614,5.547L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z"/><polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/><path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9,7.3C7.553,6.173,5.5,6.583,3,12.298z"/><path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l4-3.9C40.447,6.173,42.5,6.583,45,12.298z"/>
          </svg>
          <span className="text-2xl font-normal text-gray-600 tracking-tight">Gmail</span>
        </div>

        {/* Search bar centered */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            <Input
              placeholder="Cerca nella posta"
              className="w-full h-10 pl-10 pr-3 bg-[#f1f3f4] hover:bg-[#e8eaed] focus:bg-white border-0 rounded-2xl text-sm shadow-none focus-visible:ring-0 focus:shadow-sm transition-all"
              value={inboxMode === "gmail" ? gmailSearchQuery : searchQuery}
              onChange={(e) => inboxMode === "gmail" ? setGmailSearchQuery(e.target.value) : setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (inboxMode === "gmail" ? handleGmailSearch() : loadConversations())}
            />
          </div>
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1 ml-auto">
          <Tabs value={inboxMode} onValueChange={(v) => setInboxMode(v as InboxMode)}>
            <TabsList className="bg-transparent border-0 h-8">
              <TabsTrigger value="smart" className="text-xs h-6">Smart</TabsTrigger>
              <TabsTrigger value="gmail" className="text-xs h-6">Gmail</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#5f6368"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full h-9 w-9" onClick={() => setShowDebugPanel(!showDebugPanel)}>
            <Settings className="h-4 w-4 text-gray-600" />
          </Button>
          <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold ml-2 cursor-pointer">
            {adminUser?.name?.[0]?.toUpperCase() || "A"}
          </div>
        </div>
      </header>

      {/* Debug bar */}
      {inboxMode === "gmail" && showDebugPanel && gmailDebugInfo && (
        <div className="flex-shrink-0 bg-gray-900 text-green-400 font-mono text-xs px-4 py-2 flex items-center gap-4 flex-wrap">
          <span>Label: <strong>{gmailDebugInfo.labelId}</strong></span>
          <span>API: <strong>{gmailDebugInfo.rawThreadsCount}</strong></span>
          <span>Processed: <strong>{gmailDebugInfo.processedThreadsCount}</strong></span>
          <span>Pagina: <strong>{gmailCurrentPage}</strong></span>
          <span>Visualizzati: <strong>{gmailThreads.length}</strong></span>
          {gmailApiVersion && <span>v: <strong className="text-yellow-400">{gmailApiVersion}</strong></span>}
        </div>
      )}

      {/* KPI bar solo smart */}
      {inboxMode === "smart" && <div className="flex-shrink-0"><EmailKpiBar /></div>}

      {/* MAIN BODY */}
      <div className="flex flex-1 min-h-0">
        {/* ── LEFT SIDEBAR ── */}
        <div className="w-[256px] flex-shrink-0 flex flex-col py-2 overflow-y-auto">
          {/* Scrivi / Nuova Email */}
          <div className="px-2 pb-3">
            <button
              onClick={() => { setComposeData({ to: "", subject: "", body: "" }); setShowComposeModal(true) }}
              className="flex items-center gap-3 px-5 py-4 bg-[#c2e7ff] hover:bg-[#b0d8f5] text-[#001d35] rounded-2xl shadow-sm font-medium text-[14px] transition-all w-full"
            >
              <Edit3 className="h-5 w-5" />
              Scrivi
            </button>
          </div>

          <nav className="flex-1 px-0 space-y-0.5">
            {inboxMode === "gmail" ? (
              <>
                {GMAIL_SYSTEM_FOLDERS.map((folder) => {
                  const counts = getLabelCount(folder.id)
                  return (
                    <NavFolder
                      key={folder.id}
                      id={folder.id}
                      label={folder.label}
                      icon={folder.icon}
                      isActive={gmailLabelId === folder.id}
                      unread={counts.unread}
                      onClick={() => handleGmailLabelChange(folder.id)}
                    />
                  )
                })}
                <div className="my-2 mx-4 border-t border-[#c4c7c5]" />
                <button
                  onClick={() => setLabelsExpanded(!labelsExpanded)}
                  className="w-full flex items-center gap-3 pl-4 pr-3 py-[6px] text-[14px] text-[#444746] hover:bg-[#e2e3e7] rounded-r-full"
                >
                  {labelsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium">Etichette</span>
                </button>
                {labelsExpanded && gmailUserLabels.map((label) => (
                  <NavFolder
                    key={label.id}
                    id={label.id}
                    label={label.name}
                    icon={Tag}
                    isActive={gmailLabelId === label.id}
                    unread={label.threadsUnread}
                    onClick={() => handleGmailLabelChange(label.id)}
                  />
                ))}
              </>
            ) : (
              <>
                {[
                  { id: "open", label: "Da fare", icon: Inbox },
                  { id: "pending", label: "Urgenti", icon: AlertCircle },
                  { id: "starred", label: "Speciali", icon: Star },
                  { id: "resolved", label: "Risolti", icon: Archive },
                  { id: "spam", label: "Spam", icon: AlertCircle },
                ].map((item) => (
                  <NavFolder
                    key={item.id}
                    id={item.id}
                    label={item.label}
                    icon={item.icon}
                    isActive={statusFilter === item.id}
                    onClick={() => setStatusFilter(item.id)}
                  />
                ))}
                <div className="my-2 mx-4 border-t border-[#c4c7c5]" />
                <div className="flex items-center gap-2 pl-4 pr-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowDebugPanel(!showDebugPanel)} title="Debug">
                    <Bug className="h-4 w-4 text-[#444746]" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadConversations} title="Aggiorna">
                    <RefreshCw className={`h-4 w-4 text-[#444746] ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                  {lastSyncStatus && <span className="text-xs text-gray-400 truncate">{lastSyncStatus}</span>}
                </div>
              </>
            )}
          </nav>
        </div>

        {/* ── CENTER: Thread/Conversation list ── */}
        <div className={`${selectedGmailThread || selectedConversation ? "hidden lg:flex" : "flex"} flex-col border-l border-r border-gray-200/60 bg-white flex-shrink-0 w-[340px] min-h-0`}>
          {/* List toolbar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 flex-shrink-0">
            <Checkbox
              checked={
                inboxMode === "gmail"
                  ? selectedGmailThreadIds.size === gmailThreads.length && gmailThreads.length > 0
                  : false
              }
              onCheckedChange={inboxMode === "gmail" ? handleSelectAllGmailThreads : undefined}
              className="h-4 w-4 ml-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => inboxMode === "gmail" ? loadGmailThreads(gmailLabelId) : loadConversations()}
            >
              <RefreshCw className={`h-4 w-4 text-gray-500 ${(gmailLoading || isLoading) ? "animate-spin" : ""}`} />
            </Button>
            {inboxMode === "gmail" && selectedGmailThreadIds.size > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent ml-1">
                    {selectedGmailThreadIds.size} sel. <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => {
                    Promise.all(Array.from(selectedGmailThreadIds).map(id => {
                      const t = gmailThreads.find(t => t.id === id)
                      return t ? handleGmailArchive(t) : Promise.resolve(false)
                    })).then(() => { setSelectedGmailThreadIds(new Set()); loadGmailThreads(gmailLabelId) })
                  }}>
                    <Archive className="mr-2 h-4 w-4" /> Archivia
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    Promise.all(Array.from(selectedGmailThreadIds).map(id => {
                      const t = gmailThreads.find(t => t.id === id)
                      return t ? handleGmailTrash(t) : Promise.resolve(false)
                    })).then(() => { setSelectedGmailThreadIds(new Set()); loadGmailThreads(gmailLabelId) })
                  }}>
                    <Trash2 className="mr-2 h-4 w-4" /> Elimina
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    Promise.all(Array.from(selectedGmailThreadIds).map(id => {
                      const t = gmailThreads.find(t => t.id === id)
                      return t ? handleGmailMarkAsRead(t) : Promise.resolve(false)
                    })).then(() => { setSelectedGmailThreadIds(new Set()); loadGmailThreads(gmailLabelId) })
                  }}>
                    <MailOpen className="mr-2 h-4 w-4" /> Segna letto
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="flex-1" />
            {inboxMode === "gmail" && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGmailPrevPage} disabled={gmailCurrentPage === 1 || gmailLoading}>
                  <ChevronLeft className="h-4 w-4 text-gray-500" />
                </Button>
                <span className="text-[11px] text-gray-500 tabular-nums">
                  {gmailThreads.length > 0 ? `${(gmailCurrentPage - 1) * 100 + 1}–${(gmailCurrentPage - 1) * 100 + gmailThreads.length}` : "0"}
                </span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleGmailNextPage} disabled={!gmailNextPageToken || gmailLoading}>
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                </Button>
              </div>
            )}
          </div>

          {/* Thread/Conversation rows */}
          <div className="flex-1 overflow-y-auto">
            {inboxMode === "gmail" ? (
              gmailLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : gmailThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Inbox className="h-10 w-10 mb-3 text-gray-300" />
                  <p className="text-sm">Nessun messaggio</p>
                </div>
              ) : (
                gmailThreads.map((thread) => (
                  <div
                    key={thread.id}
                    onClick={() => handleSelectGmailThread(thread)}
                    className={`flex items-center gap-2 px-2 py-2 cursor-pointer border-b border-gray-100 transition-colors group ${
                      selectedGmailThread?.id === thread.id
                        ? "bg-[#d3e3fd]"
                        : thread.isUnread
                          ? "bg-white hover:bg-[#f2f6fc]"
                          : "bg-[#f2f2f2] hover:bg-[#e8eaed]"
                    }`}
                  >
                    <Checkbox
                      checked={selectedGmailThreadIds.has(thread.id)}
                      onCheckedChange={() => handleGmailCheckboxToggle(thread.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 data-[state=checked]:opacity-100"
                    />
                    <button className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200" onClick={(e) => handleGmailStarToggle(thread, e)}>
                      <Star className={`h-4 w-4 ${thread.isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-300 group-hover:text-gray-400"}`} />
                    </button>
                    <span className={`w-[130px] flex-shrink-0 truncate text-[13px] ${thread.isUnread ? "font-bold text-[#202124]" : "font-normal text-[#444746]"}`}>
                      {thread.from.name || thread.from.email.split("@")[0]}
                    </span>
                    <div className="flex-1 min-w-0 flex items-baseline gap-1 overflow-hidden">
                      <span className={`truncate text-[13px] ${thread.isUnread ? "font-bold text-[#202124]" : "text-[#444746]"}`}>
                        {thread.subject || "(nessun oggetto)"}
                      </span>
                      {thread.snippet && (
                        <span className="text-[13px] text-gray-400 truncate hidden sm:block">{" — "}{thread.snippet}</span>
                      )}
                    </div>
                    {thread.messagesCount > 1 && (
                      <span className="text-[11px] text-gray-500 flex-shrink-0 ml-1">{thread.messagesCount}</span>
                    )}
                    <span className={`text-[11px] flex-shrink-0 min-w-[42px] text-right ${thread.isUnread ? "font-bold text-[#202124]" : "text-gray-500"}`}>
                      {format(new Date(thread.date), "d MMM", { locale: it })}
                    </span>
                  </div>
                ))
              )
            ) : (
              // Smart mode conversation list
              isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Inbox className="h-10 w-10 mb-3 text-gray-300" />
                  <p className="text-sm">Nessun messaggio da gestire</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`flex items-center gap-2 px-2 py-2 cursor-pointer border-b border-gray-100 transition-colors group ${
                      selectedConversation?.id === conv.id
                        ? "bg-[#d3e3fd]"
                        : conv.unread_count > 0
                          ? "bg-white hover:bg-[#f2f6fc]"
                          : "bg-[#f2f2f2] hover:bg-[#e8eaed]"
                    }`}
                  >
                    <Checkbox checked={false} onClick={(e) => e.stopPropagation()} className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100" />
                    <button className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200" onClick={(e) => handleToggleStar(conv, e)}>
                      <Star className={`h-4 w-4 ${conv.is_starred ? "fill-yellow-400 text-yellow-400" : "text-gray-300 group-hover:text-gray-400"}`} />
                    </button>
                    <span className={`w-[130px] flex-shrink-0 truncate text-[13px] ${conv.unread_count > 0 ? "font-bold text-[#202124]" : "text-[#444746]"}`}>
                      {conv.contact?.name || conv.contact?.email || "Sconosciuto"}
                    </span>
                    <div className="flex-1 min-w-0 flex items-baseline gap-1 overflow-hidden">
                      <span className={`truncate text-[13px] ${conv.unread_count > 0 ? "font-bold text-[#202124]" : "text-[#444746]"}`}>
                        {conv.subject || "(nessun oggetto)"}
                      </span>
                      {conv.lastMessage?.content && (
                        <span className="text-[13px] text-gray-400 truncate hidden sm:block">{" — "}{conv.lastMessage.content}</span>
                      )}
                    </div>
                    {conv.unread_count > 0 && (
                      <span className="text-[11px] font-bold text-[#202124] flex-shrink-0">{conv.unread_count}</span>
                    )}
                    <span className="text-[11px] text-gray-500 flex-shrink-0 min-w-[42px] text-right">
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: it })}
                    </span>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* ── RIGHT: Message/Thread detail ── */}
        <div className={`${selectedGmailThread || selectedConversation ? "flex" : "hidden lg:flex"} flex-1 flex-col min-h-0 bg-white border-l border-gray-200/60`}>
          {inboxMode === "gmail" ? (
            selectedGmailThread ? (
              <>
                {/* Thread subject header */}
                <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 flex items-center gap-3 bg-white">
                  <h1 className="text-xl font-normal text-[#202124] flex-1 truncate">
                    {selectedGmailThread.subject || "(nessun oggetto)"}
                  </h1>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={!isThreadReady || isActionLoading === selectedGmailThread.id}
                      onClick={() => selectedGmailThread && isThreadReady && handleGmailStarToggle(selectedGmailThread)}
                    >
                      <Star className={`h-4 w-4 ${selectedGmailThread.isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`} />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!isThreadReady || isActionLoading === selectedGmailThread.id}>
                          {isActionLoading === selectedGmailThread.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4 text-gray-400" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {selectedGmailThread.isUnread ? (
                          <DropdownMenuItem onClick={() => selectedGmailThread && isThreadReady && handleGmailMarkAsRead(selectedGmailThread, false)}>
                            <MailOpen className="mr-2 h-4 w-4" /> Segna come letto
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => selectedGmailThread && isThreadReady && handleGmailMarkAsRead(selectedGmailThread, true)}>
                            <Mail className="mr-2 h-4 w-4" /> Segna come non letto
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => selectedGmailThread && isThreadReady && handleGmailArchive(selectedGmailThread)}>
                          <Archive className="mr-2 h-4 w-4" /> Archivia
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => selectedGmailThread && isThreadReady && handleGmailTrash(selectedGmailThread)} className="text-red-600">
                          <Trash2 className="mr-2 h-4 w-4" /> Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Messages scroll */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {gmailThreadLoading ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
                  ) : gmailMessages.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                        <p className="text-sm">Nessun messaggio nel thread</p>
                      </div>
                    </div>
                  ) : (
                    gmailMessages.map((message) => (
                      <div key={message.id} className="border-b border-gray-100 px-6 py-4">
                        <div className="flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-[#d3e3fd] flex items-center justify-center flex-shrink-0 text-[#001d35] font-medium text-sm">
                            {(message.from.name || message.from.email)[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-[14px] text-[#202124]">
                                  {message.sender_type === "agent" ? "io" : message.from.name || message.from.email.split("@")[0]}
                                </span>
                                <span className="text-[13px] text-gray-500">{"<"}{message.from.email}{">"}</span>
                              </div>
                              <span className="text-[12px] text-gray-500 flex-shrink-0 ml-2">
                                {format(new Date(message.gmail_internal_date), "d MMM yyyy, HH:mm", { locale: it })}
                              </span>
                            </div>
                            <div className="text-[12px] text-gray-400 mb-3">a {message.to}</div>
                            {renderEmailContent(message.content, message.content_type)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Reply box */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-[#f6f8fc]">
                  <div className="bg-white rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
                    <div className="px-4 pt-3 pb-1 text-[13px] text-gray-500 border-b border-gray-100">
                      Rispondi a <span className="font-medium text-gray-700">{selectedGmailThread.from?.email}</span>
                    </div>
                    <Textarea
                      placeholder="Scrivi una risposta..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="min-h-[80px] border-0 rounded-none focus-visible:ring-0 resize-none px-4 py-3 text-[14px]"
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply() }}
                    />
                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                      <Button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || isSending || !canPerformGmailAction()}
                        className="bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full px-6 h-9"
                      >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Invia
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => fileInputRef.current?.click()} disabled={!canPerformGmailAction()}>
                        <Paperclip className="h-4 w-4 text-gray-500" />
                      </Button>
                      <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                    </div>
                  </div>
                  {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Mail className="h-16 w-16 mx-auto mb-4 text-gray-200" />
                  <p className="text-sm">Seleziona un messaggio per leggerlo</p>
                </div>
              </div>
            )
          ) : (
            // Smart mode detail
            selectedConversation ? (
              <>
                <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 flex items-center gap-3 bg-white">
                  <div className="h-9 w-9 rounded-full bg-[#d3e3fd] flex items-center justify-center text-[#001d35] font-medium text-sm flex-shrink-0">
                    {(selectedConversation.contact?.name || selectedConversation.contact?.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[14px] text-[#202124] truncate">{selectedConversation.contact?.name || "Sconosciuto"}</div>
                    <div className="text-[12px] text-gray-500 truncate">{selectedConversation.contact?.email}</div>
                  </div>
                  <Badge className={`${statusConfig[selectedConversation.status]?.color} text-xs flex-shrink-0`}>
                    {statusConfig[selectedConversation.status]?.label}
                  </Badge>
                </div>

                {selectedConversation.subject && (
                  <div className="flex-shrink-0 px-6 py-2 border-b border-gray-100 text-[13px] font-medium text-[#202124]">
                    {selectedConversation.subject}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto">
                  <div className="px-6 py-4 space-y-4">
                    {messages.map((message) => (
                      <div key={message.id} className={`flex ${message.sender_type === "agent" ? "justify-end" : "justify-start"}`}>
                        {message.sender_type === "agent" ? (
                          <div className="max-w-[75%] bg-[#0b57d0] text-white px-4 py-3 rounded-2xl rounded-tr-sm text-[14px]">
                            <div className="whitespace-pre-wrap">{message.content}</div>
                            <div className="text-[11px] mt-1 text-white/70 text-right">
                              {new Date(message.received_at || message.created_at).toLocaleString("it-IT")}
                            </div>
                          </div>
                        ) : (
                          <div className="max-w-[85%] w-full">
                            <div className="bg-[#f2f2f2] rounded-2xl rounded-tl-sm overflow-hidden border border-gray-100">
                              {renderEmailContent(message.content)}
                            </div>
                            <div className="text-[11px] mt-1 text-gray-400">
                              {new Date(message.received_at || message.created_at).toLocaleString("it-IT")}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 bg-[#f6f8fc]">
                  <div className="bg-white rounded-2xl border border-gray-300 shadow-sm overflow-hidden">
                    <Textarea
                      placeholder="Scrivi una risposta..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="min-h-[80px] border-0 rounded-none focus-visible:ring-0 resize-none px-4 py-3 text-[14px]"
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply() }}
                    />
                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                      <Button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || isSending}
                        className="bg-[#0b57d0] hover:bg-[#0842a0] text-white rounded-full px-6 h-9"
                      >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Invia
                      </Button>
                    </div>
                  </div>
                  {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Mail className="h-16 w-16 mx-auto mb-4 text-gray-200" />
                  <p className="text-sm">Seleziona una conversazione per visualizzarla</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Compose modal */}
      {showComposeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">Nuovo messaggio</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowComposeModal(false)}>
                <span className="sr-only">Chiudi</span>×
              </Button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">A:</label>
                <Input
                  placeholder="email@esempio.com"
                  value={composeData.to}
                  onChange={(e) => setComposeData((prev) => ({ ...prev, to: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Oggetto:</label>
                <Input
                  placeholder="Oggetto del messaggio"
                  value={composeData.subject}
                  onChange={(e) => setComposeData((prev) => ({ ...prev, subject: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Messaggio:</label>
                <Textarea
                  placeholder="Scrivi il tuo messaggio..."
                  value={composeData.body}
                  onChange={(e) => setComposeData((prev) => ({ ...prev, body: e.target.value }))}
                  className="mt-1 min-h-[200px]"
                />
              </div>
              {error && <div className="text-red-600 text-sm">{error}</div>}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t bg-gray-50">
              <Button variant="outline" onClick={() => setShowComposeModal(false)}>
                Annulla
              </Button>
              <Button
                onClick={handleComposeEmail}
                disabled={!composeData.to || !composeData.body || isSending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Invia
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
