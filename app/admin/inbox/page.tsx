"use client"

// v777 BUILD MARKER - This comment forces a new bundle hash
// v777 BUILD MARKER - Added v777 marker for debugging
const FRONTEND_BUILD = "v777-debug"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAdminAuth } from "@/lib/admin-hooks"
import { createClient } from "@/lib/supabase/client"
import {
  MessageCircle,
  Mail,
  Phone,
  Search,
  Send,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  Inbox,
  Users,
  Loader2,
  MoreVertical,
  Paperclip,
  FileText,
  AlertCircle,
  Clock,
  Zap,
  Settings,
  Tag,
  Edit3,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  MailOpen,
  Bug,
  Database,
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
import { DemandCalendar } from "@/components/admin/demand-calendar"
import { AdminHeader } from "@/components/admin/admin-header"
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
    console.log("[v0] DEBUG: loadGmailLabels CALLED")
    try {
      const res = await fetch("/api/gmail/labels")
      if (res.ok) {
        const data = await res.json()
        setGmailSystemLabels(data.systemLabels || [])
        setGmailUserLabels(data.labels || [])
        console.log("[v0] Gmail labels loaded:", {
          systemCount: data.systemLabels?.length || 0,
          userCount: data.labels?.length || 0,
        })
      }
    } catch (error) {
      console.error("[Gmail] Error loading labels:", error)
    }
  }, [])

  const loadGmailThreads = useCallback(
    async (labelId: string = gmailLabelId, pageToken?: string, query?: string, isNextPage = false) => {
      console.log("[v0] DEBUG: loadGmailThreads CALLED with labelId:", labelId)
      setGmailLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("labelId", labelId)
        if (pageToken) params.set("pageToken", pageToken)
        if (query) params.set("q", query)

        const fullUrl = `/api/gmail/threads?${params}`
        console.log("[v0] DEBUG: FULL REQUEST URL:", fullUrl)
        console.log("[v0] DEBUG: About to fetch /api/gmail/threads")

        const res = await fetch(fullUrl)

        console.log("[v0] DEBUG: Fetch completed, status:", res.status)

        if (res.ok) {
          const data = await res.json()

          console.log("[v0] FRONTEND: FULL API RESPONSE:", JSON.stringify(data, null, 2))

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

          console.log("[v0] FRONTEND: Gmail threads loaded:", {
            apiVersion: data.debugVersion,
            count: data.threads?.length || 0,
            total: data.resultSizeEstimate,
            hasNextPage: !!data.nextPageToken,
            debug: data._debug,
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
    console.log("[v0] loadGmailThread CALLED with threadId:", threadId)
    setGmailThreadLoading(true)
    setGmailMessages([])
    try {
      const res = await fetch(`/api/gmail/threads/${threadId}`)
      console.log("[v0] loadGmailThread response status:", res.status)
      if (res.ok) {
        const data = await res.json()
        console.log("[v0] loadGmailThread FULL RESPONSE:", JSON.stringify(data, null, 2))
        console.log("[v0] Messages count:", data.messages?.length || 0)

        // Log body info for each message
        data.messages?.forEach((msg: any, idx: number) => {
          console.log(
            `[v0] Message ${idx + 1}: bodyLength=${msg.content?.length || 0}, contentType=${msg.content_type}, source=${msg._debug?.bodySource}`,
          )
          if (!msg.content || msg.content.length === 0) {
            console.error(`[v0] WARNING: Message ${idx + 1} has EMPTY body!`)
          }
        })

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
    console.log("[v0] DEBUG: Gmail mode useEffect triggered", { inboxMode, authLoading, hasAdminUser: !!adminUser })
    if (inboxMode === "gmail" && !authLoading && adminUser) {
      console.log("[v0] DEBUG: Calling loadGmailLabels and loadGmailThreads")
      loadGmailLabels()
      loadGmailThreads(gmailLabelId)

      const gmailPollInterval = setInterval(() => {
        console.log("[v0] Gmail auto-refresh triggered")
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
    console.log("[v0] Smart mode: loadConversations from DB")
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
      console.log("[v0] Smart mode: loaded", data.conversations?.length || 0, "conversations from DB")
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
        console.log("[v0] Smart debug info loaded:", data)
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

    console.log("[v0] FRONTEND: Performing initial Smart sync...")
    setLastSyncStatus("Sincronizzazione in corso...")

    try {
      // Get channel info for sync
      const channelRes = await fetch("/api/inbox/debug")
      if (!channelRes.ok) {
        console.log("[v0] FRONTEND: Debug API failed, skipping sync")
        setLastSyncStatus("Errore: impossibile ottenere info canale")
        return
      }

      const debugData = await channelRes.json()
      setDebugInfo(debugData)

      if (!debugData.channel?.id || !debugData.channel?.property_id) {
        console.log("[v0] FRONTEND: No channel configured for Smart sync")
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
        console.log("[v0] FRONTEND: Smart sync result:", syncData)
        setLastSyncStatus(`Sincronizzato: ${syncData.imported} nuovi, ${syncData.duplicates} duplicati`)
        // Reload conversations after sync
        loadConversations()
      } else {
        const errorText = await syncRes.text()
        console.log("[v0] FRONTEND: Smart sync failed:", errorText)
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
      console.log("[v0] Smart mode: initializing DB-only mode with Realtime")

      // Load conversations from DB
      loadConversations()

      // Load debug info
      loadSmartDebugInfo()

      pollIntervalRef.current = setInterval(() => {
        console.log("[v0] Smart mode: polling DB for new conversations")
        loadConversations()
      }, 30000)

      // Debug info refresh every 60 seconds
      const debugInterval = setInterval(loadSmartDebugInfo, 60000)

      const supabase = createClient()

      const messagesChannel = supabase
        .channel("smart-inbox-messages")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          console.log("[v0] Realtime: new message INSERT detected:", payload.new)
          // Reload conversations to show new message
          loadConversations()
        })
        .subscribe((status) => {
          console.log("[v0] Realtime messages subscription status:", status)
        })

      const conversationsChannel = supabase
        .channel("smart-inbox-conversations")
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
          console.log("[v0] Realtime: conversation change detected:", payload.eventType, payload.new)
          loadConversations()
        })
        .subscribe((status) => {
          console.log("[v0] Realtime conversations subscription status:", status)
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
    // Handle empty content
    if (!content || content.length === 0) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          <strong>Errore:</strong> Contenuto email vuoto
        </div>
      )
    }

    const isHtml = contentType === "text/html" || /<[a-z][\s\S]*>/i.test(content)

    if (isHtml) {
      return (
        <iframe
          srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #1f2937;
              margin: 0;
              padding: 16px;
              word-wrap: break-word;
              overflow-x: hidden;
            }
            img { max-width: 100%; height: auto; }
            a { color: #2563eb; }
            blockquote { border-left: 3px solid #d1d5db; margin: 1em 0; padding-left: 1em; color: #6b7280; }
            pre, code { background: #f3f4f6; padding: 2px 4px; border-radius: 4px; font-size: 13px; overflow-x: auto; }
            table { border-collapse: collapse; max-width: 100%; }
            td, th { padding: 8px; border: 1px solid #e5e7eb; }
          </style></head><body>${content}</body></html>`}
          className="w-full h-full min-h-full border-0 block"
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      )
    }

    // Plain text
    return <div className="text-sm whitespace-pre-wrap leading-relaxed text-gray-800 p-4 h-full">{content}</div>
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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!adminUser) {
    return (
      <div className="flex items-center justify-center h-screen">
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

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="Inbox"
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Inbox", href: "/admin/inbox" },
        ]}
        actions={
          <div className="flex items-center gap-4">
            <Tabs value={inboxMode} onValueChange={(v) => setInboxMode(v as InboxMode)}>
              <TabsList>
                <TabsTrigger value="smart" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Smart
                </TabsTrigger>
                <TabsTrigger value="gmail" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Gmail
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {inboxMode === "gmail" && (
              <Button
                variant={showDebugPanel ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDebugPanel(!showDebugPanel)}
              >
                <Bug className="h-4 w-4 mr-2" />
                Debug
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/channels/email")}>
              <Settings className="h-4 w-4 mr-2" />
              Impostazioni Email
            </Button>
          </div>
        }
      />

      {inboxMode === "smart" && <EmailKpiBar />}

      {inboxMode === "gmail" && showDebugPanel && gmailDebugInfo && (
        <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 border-b">
          <div className="flex items-center gap-4 flex-wrap">
            <span>
              Label: <strong>{gmailDebugInfo.labelId}</strong>
            </span>
            <span>
              Raw from API: <strong>{gmailDebugInfo.rawThreadsCount}</strong>
            </span>
            <span>
              Processed: <strong>{gmailDebugInfo.processedThreadsCount}</strong>
            </span>
            <span>
              Gmail Estimate: <strong>{gmailDebugInfo.resultSizeEstimate}</strong>
            </span>
            <span>
              HasNextPage: <strong>{gmailDebugInfo.hasNextPage ? "YES" : "NO"}</strong>
            </span>
            <span>
              Current Page: <strong>{gmailCurrentPage}</strong>
            </span>
            <span>
              Displayed: <strong>{gmailThreads.length}</strong>
            </span>
            {/* Display API Version */}
            {gmailApiVersion && (
              <span>
                API Version: <strong className="text-yellow-400">{gmailApiVersion}</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {inboxMode === "smart" ? (
        // ==================== SMART MODE LAYOUT ====================
        <div className="flex flex-1 min-h-0">
          {/* LEFT SIDEBAR - Conversation List */}
          <div className="w-72 border-r flex flex-col bg-card min-h-0">
            {" "}
            {/* Changed width to w-72 */}
            <div className="p-3 space-y-3 flex-shrink-0">
              {" "}
              {/* Changed p-4 to p-3 */}
              <Button
                onClick={() => {
                  setComposeData({ to: "", subject: "", body: "" }) // Clear form on open
                  setShowComposeModal(true)
                }}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-10 justify-center gap-2"
              >
                <Edit3 className="h-4 w-4" />
                <span className="font-medium">Nuova Email</span>
              </Button>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Smart Inbox
                </h2>
                {/* Add manual refresh button for Smart mode in sidebar header */}
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setShowDebugPanel(!showDebugPanel)}>
                    <Bug className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={loadConversations}>
                    <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <div className="flex gap-1">
                {["open", "pending", "starred"].map((filter) => (
                  <Button
                    key={filter}
                    variant={statusFilter === filter ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatusFilter(filter)}
                    className="flex-1"
                  >
                    {filter === "open" && <Clock className="h-3 w-3 mr-1" />}
                    {filter === "pending" && <AlertCircle className="h-3 w-3 mr-1" />}
                    {filter === "starred" && <Star className="h-3 w-3 mr-1" />}
                    {filter === "open" ? "Da fare" : filter === "pending" ? "Urgenti" : "Speciali"}
                  </Button>
                ))}
              </div>
            </div>
            {/* <SmartDebugPanel />  <-- Moved outside the left sidebar, to overlay the whole screen */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nessun messaggio da gestire</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`p-3 border-b cursor-pointer hover:bg-accent transition-colors ${selectedConversation?.id === conv.id ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox checked={false} onClick={(e) => e.stopPropagation()} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-medium text-sm truncate ${conv.unread_count > 0 ? "font-bold" : ""}`}>
                            {conv.contact?.name || conv.contact?.email || "Sconosciuto"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: it })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.subject || conv.lastMessage?.content || "Nessun messaggio"}
                        </p>
                        <div className="flex items-center gap-1 mt-1">
                          {conv.unread_count > 0 && (
                            <Badge variant="default" className="h-4 px-1 text-xs">
                              {conv.unread_count}
                            </Badge>
                          )}
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => handleToggleStar(conv, e)}
                          >
                            <Star
                              className={`h-3 w-3 ${conv.is_starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                            />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {/* CENTER - Message Panel */}
          <div className="flex-1 flex flex-col min-h-0">
            {selectedConversation ? (
              <>
                {/* Header - fixed */}
                <div className="flex-shrink-0 p-4 border-b bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{selectedConversation.contact?.name || "Sconosciuto"}</h3>
                        <p className="text-sm text-muted-foreground">{selectedConversation.contact?.email}</p>
                      </div>
                    </div>
                    <Badge className={statusConfig[selectedConversation.status]?.color}>
                      {statusConfig[selectedConversation.status]?.label}
                    </Badge>
                  </div>
                  {selectedConversation.subject && (
                    <div className="mt-2 text-sm font-medium">Oggetto: {selectedConversation.subject}</div>
                  )}
                </div>

                {/* Messages area - flex-1 with min-h-0 for proper scrolling */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="h-full overflow-y-auto p-4 space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sender_type === "agent" ? "justify-end" : "justify-start"}`}
                      >
                        {message.sender_type === "agent" ? (
                          <div className="max-w-[80%] bg-primary text-primary-foreground p-3 rounded-lg">
                            <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                            <div className="text-xs mt-1 text-primary-foreground/70">
                              {new Date(message.received_at || message.created_at).toLocaleString("it-IT")}
                            </div>
                          </div>
                        ) : (
                          /* Customer email now uses flex container with proper height */
                          <div className="w-full flex flex-col min-h-0" style={{ maxHeight: "60vh" }}>
                            <div className="flex-1 min-h-0 overflow-hidden bg-white rounded-lg border">
                              {renderEmailContent(message.content)}
                            </div>
                            <div className="text-xs mt-1 text-muted-foreground">
                              {new Date(message.received_at || message.created_at).toLocaleString("it-IT")}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Reply area - fixed */}
                <div className="flex-shrink-0 p-4 border-t bg-card">
                  <div className="flex gap-2 mb-2">
                    <Select value={replyChannel} onValueChange={setReplyChannel}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="same">Stesso canale</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Scrivi una risposta..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="min-h-[80px]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply()
                      }}
                    />
                    <Button onClick={handleSendReply} disabled={!replyText.trim() || isSending} className="self-end">
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Seleziona una conversazione per visualizzare i messaggi</p>
                </div>
              </div>
            )}
          </div>
          {/* RIGHT SIDEBAR - Demand Calendar */}
          <div className="w-80 border-l bg-card p-4 overflow-y-auto hidden lg:block flex-shrink-0">
            <h3 className="font-semibold mb-4">Calendario Domanda</h3>
            <DemandCalendar />
          </div>
          <SmartDebugPanel /> {/* Render SmartDebugPanel here */}
        </div>
      ) : (
        // ==================== GMAIL MIRROR LAYOUT (Direct Gmail API - 1:1 parity) ====================
        <div className="flex h-[calc(100vh-64px)] bg-white">
          {/* LEFT - Gmail Folder Sidebar */}
          <div className="w-52 border-r flex flex-col bg-muted/30">
            <div className="p-3">
              <Button
                className="w-full bg-white hover:bg-gray-100 text-gray-700 border shadow-sm rounded-2xl h-14 justify-start gap-3"
                variant="outline"
                onClick={() => {
                  setComposeData({ to: "", subject: "", body: "" }) // Clear form on open
                  setShowComposeModal(true)
                }}
              >
                <Edit3 className="h-5 w-5" />
                <span className="font-medium">Scrivi</span>
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2">
              {GMAIL_SYSTEM_FOLDERS.map((folder) => {
                const Icon = folder.icon
                const isActive = gmailLabelId === folder.id
                const counts = getLabelCount(folder.id)
                return (
                  <button
                    key={folder.id}
                    onClick={() => handleGmailLabelChange(folder.id)}
                    className={`w-full flex items-center gap-3 px-4 py-1.5 text-sm transition-colors rounded-r-full mb-0.5 ${
                      isActive ? "bg-blue-100 text-blue-800 font-semibold" : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-blue-800" : "text-gray-600"}`} />
                    <span className="flex-1 text-left truncate">{folder.label}</span>
                    {counts.total > 0 && (
                      <span className="text-xs font-semibold">{counts.unread > 0 ? counts.unread : counts.total}</span>
                    )}
                  </button>
                )
              })}

              <div className="my-3 border-t border-gray-200" />

              <button
                onClick={() => setLabelsExpanded(!labelsExpanded)}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-r-full"
              >
                {labelsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-medium">Etichette</span>
              </button>

              {labelsExpanded &&
                gmailUserLabels.map((label) => (
                  <button
                    key={label.id}
                    onClick={() => handleGmailLabelChange(label.id)}
                    className={`w-full flex items-center gap-3 pl-6 pr-4 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-r-full ${
                      gmailLabelId === label.id ? "bg-blue-100 text-blue-800 font-semibold" : ""
                    }`}
                  >
                    <Tag className="h-3.5 w-3.5" style={label.color ? { color: label.color } : undefined} />
                    <span className="flex-1 text-left truncate">{label.name}</span>
                    {label.threadsTotal > 0 && <span className="text-xs">{label.threadsTotal}</span>}
                  </button>
                ))}
            </nav>
          </div>

          {/* CENTER - Thread List */}
          <div className="flex-1 flex flex-col border-r border-gray-200 max-w-xl">
            <div className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-200 bg-white">
              {/* Checkbox for selecting all threads */}
              <Checkbox
                checked={selectedGmailThreadIds.size === gmailThreads.length && gmailThreads.length > 0}
                onCheckedChange={handleSelectAllGmailThreads}
                className="h-4 w-4"
                indeterminate={selectedGmailThreadIds.size > 0 && selectedGmailThreadIds.size < gmailThreads.length}
              />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadGmailThreads(gmailLabelId)}>
                <RefreshCw className={`h-4 w-4 ${gmailLoading ? "animate-spin" : ""}`} />
              </Button>
              <div className="flex-1" />
              {/* Bulk actions - e.g., archive, trash, mark as read */}
              {selectedGmailThreadIds.size > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="text-xs h-8 bg-transparent">
                      {selectedGmailThreadIds.size} Selezionati <ChevronDown className="h-3 w-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {gmailLabelId === "SPAM" ? (
                      <DropdownMenuItem
                        onClick={() => {
                          // Bulk not_spam
                          Promise.all(
                            Array.from(selectedGmailThreadIds).map((id) => {
                              const thread = gmailThreads.find((t) => t.id === id)
                              return thread ? handleGmailNotSpam(thread) : Promise.resolve(false)
                            }),
                          ).then((results) => {
                            if (results.every((r) => r)) {
                              setSelectedGmailThreadIds(new Set())
                              loadGmailThreads(gmailLabelId)
                            }
                          })
                        }}
                      >
                        <Inbox className="mr-2 h-4 w-4" /> Non è spam
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          // Implement bulk archive
                          Promise.all(
                            Array.from(selectedGmailThreadIds).map((id) => {
                              const thread = gmailThreads.find((t) => t.id === id)
                              return thread ? handleGmailArchive(thread) : Promise.resolve(false)
                            }),
                          ).then((results) => {
                            if (results.every((r) => r)) {
                              setSelectedGmailThreadIds(new Set())
                              loadGmailThreads(gmailLabelId)
                            }
                          })
                        }}
                      >
                        <Archive className="mr-2 h-4 w-4" /> Archivia
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        // Implement bulk trash
                        Promise.all(
                          Array.from(selectedGmailThreadIds).map((id) => {
                            const thread = gmailThreads.find((t) => t.id === id)
                            return thread ? handleGmailTrash(thread) : Promise.resolve(false)
                          }),
                        ).then((results) => {
                          if (results.every((r) => r)) {
                            setSelectedGmailThreadIds(new Set()) // Clear selection on success
                            loadGmailThreads(gmailLabelId) // Refresh thread list
                          }
                        })
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Elimina
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        // Implement bulk mark as read/unread
                        Promise.all(
                          Array.from(selectedGmailThreadIds).map((id) => {
                            const thread = gmailThreads.find((t) => t.id === id)
                            return thread ? handleGmailMarkAsRead(thread) : Promise.resolve(false)
                          }),
                        ).then((results) => {
                          if (results.every((r) => r)) {
                            setSelectedGmailThreadIds(new Set()) // Clear selection on success
                            loadGmailThreads(gmailLabelId) // Refresh thread list
                          }
                        })
                      }}
                    >
                      <MailOpen className="mr-2 h-4 w-4" /> Segna come letto/non letto
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleGmailPrevPage}
                  disabled={gmailCurrentPage === 1 || gmailLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-gray-500 min-w-[100px] text-center">
                  {gmailThreads.length > 0
                    ? `${(gmailCurrentPage - 1) * 100 + 1}-${(gmailCurrentPage - 1) * 100 + gmailThreads.length} di ${gmailTotalEstimate}`
                    : "0 messaggi"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleGmailNextPage}
                  disabled={!gmailNextPageToken || gmailLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="px-2 py-2 border-b border-gray-200 bg-white">
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Cerca in Gmail"
                    className="pl-10 h-9 bg-gray-100 border-0 rounded-lg focus:bg-white focus:ring-1"
                    value={gmailSearchQuery}
                    onChange={(e) => setGmailSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleGmailSearch()}
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white">
              {gmailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : gmailThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                  <Inbox className="h-12 w-12 mb-4 text-gray-300" />
                  <p className="text-sm">Nessun messaggio</p>
                </div>
              ) : (
                gmailThreads.map((thread) => (
                  <div
                    key={thread.id}
                    onClick={() => handleSelectGmailThread(thread)}
                    className={`flex items-center gap-2 px-2 py-2 cursor-pointer border-b border-gray-100 ${
                      selectedGmailThread?.id === thread.id
                        ? "bg-blue-50"
                        : thread.isUnread
                          ? "bg-white"
                          : "bg-gray-50/50"
                    } hover:bg-gray-50`}
                  >
                    <Checkbox
                      checked={selectedGmailThreadIds.has(thread.id)}
                      onCheckedChange={(checked) => handleGmailCheckboxToggle(thread.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0"
                      onClick={(e) => handleGmailStarToggle(thread, e)} // Modified to pass thread
                    >
                      <Star
                        className={`h-4 w-4 ${thread.isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
                      />
                    </Button>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span
                        className={`w-36 truncate text-sm ${thread.isUnread ? "font-semibold text-gray-900" : "text-gray-600"}`}
                      >
                        {thread.from.name || thread.from.email.split("@")[0]}
                      </span>
                      <div className="flex-1 min-w-0 flex items-center">
                        <span className={`truncate text-sm ${thread.isUnread ? "font-semibold" : "text-gray-600"}`}>
                          {thread.subject}
                        </span>
                        <span className="text-gray-400 mx-1 flex-shrink-0">-</span>
                        <span className="truncate text-sm text-gray-500">{thread.snippet}</span>
                      </div>
                    </div>
                    {thread.messagesCount > 1 && (
                      <span className="text-xs text-gray-500 flex-shrink-0">{thread.messagesCount}</span>
                    )}
                    <span
                      className={`text-xs flex-shrink-0 ${thread.isUnread ? "font-semibold text-gray-900" : "text-gray-500"}`}
                    >
                      {format(new Date(thread.date), "d MMM", { locale: it })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* RIGHT - Message Content */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden min-w-0">
            {selectedGmailThread ? (
              <>
                <div className="p-4 border-b border-gray-200 flex-shrink-0">
                  {/* v773 BUILD MARKER: Add visible build marker after line ~1540 where Gmail mode header is */}
                  <div className="text-sm text-gray-500 mb-1">
                    Build: <span className="font-semibold text-gray-700">{FRONTEND_BUILD}</span>
                  </div>
                  <h1 className="text-xl font-normal text-gray-900">{selectedGmailThread.subject}</h1>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                  {gmailThreadLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : gmailMessages.length === 0 ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                        <p>Nessun messaggio trovato nel thread</p>
                      </div>
                    </div>
                  ) : (
                    gmailMessages.map((message) => (
                      <div key={message.id} className="border-b border-gray-100">
                        <div className="px-4 py-3 flex items-start gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Users className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  {message.sender_type === "agent"
                                    ? "io"
                                    : message.from.name || message.from.email.split("@")[0]}
                                </span>
                                <span className="text-sm text-gray-500">
                                  {"<"}
                                  {message.from.email}
                                  {">"}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {format(new Date(message.gmail_internal_date), "d MMM yyyy, HH:mm", { locale: it })}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500">a {message.to}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={!isThreadReady || isActionLoading === selectedGmailThread?.id}
                              onClick={() => {
                                if (selectedGmailThread && isThreadReady) {
                                  // v774: Use the simplified handleGmailStarToggle directly
                                  handleGmailStarToggle(selectedGmailThread)
                                }
                              }}
                            >
                              <Star
                                className={`h-4 w-4 ${selectedGmailThread?.isStarred ? "fill-yellow-400 text-yellow-400" : "text-gray-400"}`}
                              />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={!isThreadReady || isActionLoading === selectedGmailThread?.id}
                                >
                                  {isActionLoading === selectedGmailThread?.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MoreVertical className="h-4 w-4 text-gray-400" />
                                  )}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {selectedGmailThread?.isUnread ? (
                                  <DropdownMenuItem
                                    onClick={
                                      () =>
                                        selectedGmailThread &&
                                        isThreadReady && // Add check for isThreadReady
                                        handleGmailMarkAsRead(selectedGmailThread, false) // Use false for markAsRead
                                    }
                                  >
                                    <MailOpen className="mr-2 h-4 w-4" />
                                    Segna come letto
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={
                                      () =>
                                        selectedGmailThread &&
                                        isThreadReady && // Add check for isThreadReady
                                        handleGmailMarkAsRead(selectedGmailThread, true) // Use true for markAsUnread
                                    }
                                  >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Segna come non letto
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    selectedGmailThread && isThreadReady && handleGmailArchive(selectedGmailThread)
                                  }
                                >
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archivia
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    selectedGmailThread && isThreadReady && handleGmailTrash(selectedGmailThread)
                                  }
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Elimina
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <div className="px-4 pb-4 pl-16">
                          {renderEmailContent(message.content, message.content_type)}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-gray-200 p-4 bg-gray-50 flex-shrink-0">
                  <div className="bg-white rounded-lg border border-gray-300 shadow-sm">
                    <div className="p-3">
                      <Textarea
                        placeholder="Clicca qui per rispondere"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="min-h-[60px] border-0 p-0 focus-visible:ring-0 resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply()
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100">
                      <Button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || isSending || !canPerformGmailAction()} // Disable if not ready
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invia"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!canPerformGmailAction()} // Disable if not ready
                      >
                        <Paperclip className="h-4 w-4 text-gray-600" />
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
            )}
          </div>
        </div>
      )}

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
