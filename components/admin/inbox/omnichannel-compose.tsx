"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  Bold,
  Bot,
  CheckCircle2,
  Clock3,
  Facebook,
  Instagram,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Mail,
  MessageCircle,
  Mic,
  Paperclip,
  RemoveFormatting,
  Search,
  Send,
  Square,
  Underline,
  UserPlus,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"

interface ContactSuggestion {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  whatsapp_id: string | null
  telegram_chat_id?: string | null
}

type ComposeChannel = "email" | "whatsapp" | "telegram" | "messenger" | "instagram"
type Subchannel = { id: string; channel: ComposeChannel; label: string; detail: string | null }
type StagedWhatsAppMedia = {
  path: string
  name: string
  mimeType: string
  size: number
  voice?: boolean
}

const channelMeta: Record<ComposeChannel, { label: string; icon: typeof Mail }> = {
  email: { label: "Email", icon: Mail },
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  telegram: { label: "Telegram", icon: Bot },
  messenger: { label: "Facebook", icon: Facebook },
  instagram: { label: "Instagram", icon: Instagram },
}

const WHATSAPP_ACCEPT = [
  "image/jpeg",
  "image/png",
  "video/mp4",
  "video/3gpp",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  "application/pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
].join(",")

const WHATSAPP_MIME_LIMITS: Record<string, number> = {
  "image/jpeg": 5 * 1024 * 1024,
  "image/png": 5 * 1024 * 1024,
  "video/mp4": 16 * 1024 * 1024,
  "video/3gpp": 16 * 1024 * 1024,
  "audio/aac": 16 * 1024 * 1024,
  "audio/mp4": 16 * 1024 * 1024,
  "audio/mpeg": 16 * 1024 * 1024,
  "audio/amr": 16 * 1024 * 1024,
  "audio/ogg": 16 * 1024 * 1024,
  "application/pdf": 20 * 1024 * 1024,
  "application/msword": 20 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 20 * 1024 * 1024,
  "application/vnd.ms-excel": 20 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": 20 * 1024 * 1024,
  "application/vnd.ms-powerpoint": 20 * 1024 * 1024,
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": 20 * 1024 * 1024,
  "text/plain": 20 * 1024 * 1024,
}

function normalizedPhoneDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "")
  return digits.startsWith("00") ? digits.slice(2) : digits
}

function baseMime(value: string) {
  return (value || "").split(";")[0].trim().toLowerCase()
}

function fileLabel(file: File, voiceNote: boolean) {
  if (voiceNote) return "Vocale registrato"
  const mime = baseMime(file.type)
  if (mime.startsWith("image/")) return "Foto"
  if (mime.startsWith("video/")) return "Video"
  if (mime.startsWith("audio/")) return "Audio"
  return "Documento"
}

function validateWhatsAppFile(file: File): string | null {
  const mime = baseMime(file.type)
  const max = WHATSAPP_MIME_LIMITS[mime]
  if (!max) {
    return "Formato non supportato da WhatsApp. Usa JPG/PNG, MP4/3GP, audio AAC/M4A/MP3/AMR/OGG oppure PDF/Office."
  }
  if (file.size <= 0) return "Il file selezionato è vuoto."
  if (file.size > max) {
    return `${file.name} supera il limite di ${Math.round(max / (1024 * 1024))} MB previsto per questo tipo di file.`
  }
  return null
}

function WhatsAppMediaPreview({ file, voiceNote }: { file: File; voiceNote: boolean }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  const mime = baseMime(file.type)

  if (mime.startsWith("image/")) {
    return <img src={url} alt={file.name} className="max-h-56 max-w-full rounded-xl border object-contain" />
  }
  if (mime.startsWith("video/")) {
    return <video src={url} controls preload="metadata" className="max-h-64 w-full max-w-xl rounded-xl border bg-black" />
  }
  if (mime.startsWith("audio/")) {
    return (
      <div className="w-full max-w-xl rounded-xl border bg-muted/30 p-3">
        <div className="mb-2 text-xs font-medium">{voiceNote ? "Vocale pronto" : "Audio pronto"}</div>
        <audio src={url} controls preload="metadata" className="w-full" />
      </div>
    )
  }
  return null
}

export function OmnichannelCompose() {
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState<ComposeChannel>("email")
  const [subchannels, setSubchannels] = useState<Subchannel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState("")
  const [recipient, setRecipient] = useState("")
  const [contactName, setContactName] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [attachments, setAttachments] = useState<File[]>([])
  const [whatsAppVoiceNote, setWhatsAppVoiceNote] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [selectedContact, setSelectedContact] = useState<ContactSuggestion | null>(null)
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [recipientFocused, setRecipientFocused] = useState(false)
  const [sending, setSending] = useState(false)
  const [queued, setQueued] = useState(false)
  const [queuedPendingId, setQueuedPendingId] = useState("")
  const [queuedError, setQueuedError] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const richEditorRef = useRef<HTMLDivElement>(null)
  const searchSeq = useRef(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const discardRecordingRef = useRef(false)

  const availableTypes = useMemo(() => {
    const types = new Set(subchannels.map((item) => item.channel))
    return (["email", "whatsapp", "telegram", "messenger", "instagram"] as ComposeChannel[]).filter((type) => types.has(type))
  }, [subchannels])

  const channelsForType = useMemo(
    () => subchannels.filter((item) => item.channel === channel),
    [subchannels, channel],
  )

  const supportsAttachments = channel === "email" || channel === "telegram" || channel === "whatsapp"
  const hasContent = body.trim().length > 0 || attachments.length > 0
  const whatsappFile = channel === "whatsapp" ? attachments[0] : undefined

  const stopRecordingTimer = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    recordingTimerRef.current = null
  }

  const stopRecordingTracks = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null
  }

  const stopRecording = (discard = false) => {
    discardRecordingRef.current = discard
    stopRecordingTimer()
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    } else {
      stopRecordingTracks()
      setIsRecording(false)
      setRecordingSeconds(0)
    }
  }

  const reset = () => {
    stopRecording(true)
    setChannel("email")
    setSelectedChannelId("")
    setRecipient("")
    setContactName("")
    setCc("")
    setBcc("")
    setShowCc(false)
    setShowBcc(false)
    setSubject("")
    setBody("")
    setBodyHtml("")
    setAttachments([])
    setWhatsAppVoiceNote(false)
    setSelectedContact(null)
    setSuggestions([])
    setRecipientFocused(false)
    setQueued(false)
    setQueuedPendingId("")
    setQueuedError("")
    if (richEditorRef.current) richEditorRef.current.innerHTML = ""
  }

  useEffect(() => {
    return () => {
      discardRecordingRef.current = true
      stopRecordingTimer()
      if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop()
      stopRecordingTracks()
    }
    // recorder refs are intentionally imperative resources
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    fetch("/api/inbox/subchannels", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const rows: Subchannel[] = data.subchannels ?? []
        setSubchannels(rows)
        const firstEmail = rows.find((row) => row.channel === "email")
        const first = firstEmail || rows[0]
        if (first) {
          setChannel(first.channel)
          setSelectedChannelId(first.id)
        }
      })
      .catch(() => setSubchannels([]))
  }, [open])

  useEffect(() => {
    const first = channelsForType[0]
    if (first && !channelsForType.some((item) => item.id === selectedChannelId)) {
      setSelectedChannelId(first.id)
    }
  }, [channel, channelsForType, selectedChannelId])

  const destinationForContact = (contact: ContactSuggestion) => {
    if (channel === "email") return contact.email || ""
    if (channel === "whatsapp") return contact.whatsapp_id || contact.phone || ""
    if (channel === "telegram") return contact.telegram_chat_id || ""
    return ""
  }

  const loadSuggestions = async (query: string) => {
    if (!open || selectedContact || channel === "messenger" || channel === "instagram") return
    const seq = ++searchSeq.current
    setSearching(true)
    try {
      const params = new URLSearchParams({ q: query.trim(), channel })
      const res = await fetch(`/api/inbox/compose/contacts?${params.toString()}`, { cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (seq !== searchSeq.current) return
      const rows = (res.ok ? data.contacts ?? [] : []) as ContactSuggestion[]
      setSuggestions(rows.filter((contact) => Boolean(destinationForContact(contact))))
    } catch {
      if (seq === searchSeq.current) setSuggestions([])
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }

  useEffect(() => {
    if (!recipientFocused || selectedContact) return
    const timer = window.setTimeout(() => void loadSuggestions(recipient), 180)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipient, recipientFocused, selectedContact, channel, open])

  useEffect(() => {
    if (!queuedPendingId) return
    let cancelled = false

    const checkStatus = async () => {
      try {
        const params = new URLSearchParams({ pendingId: queuedPendingId })
        const res = await fetch(`/api/inbox/compose/whatsapp/status?${params.toString()}`, { cache: "no-store" })
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok) return

        if (data.status === "sent") {
          toast.success("Messaggio WhatsApp inviato dopo l'accettazione del cliente")
          setOpen(false)
          reset()
          return
        }
        if (["failed_template", "failed_delivery", "delivery_unknown"].includes(data.status)) {
          const message = data.error || "WhatsApp non ha consegnato il messaggio."
          setQueued(false)
          setQueuedPendingId("")
          setQueuedError(message)
          toast.error(message)
          return
        }
        if (data.status === "declined") {
          const message = "Il destinatario ha scelto di non aprire la comunicazione WhatsApp."
          setQueued(false)
          setQueuedPendingId("")
          setQueuedError(message)
          toast.error(message)
          return
        }
        if (data.status === "expired") {
          const message = data.error || "La richiesta di apertura WhatsApp è scaduta."
          setQueued(false)
          setQueuedPendingId("")
          setQueuedError(message)
          toast.error(message)
        }
      } catch {
        // Retry on the next polling cycle.
      }
    }

    void checkStatus()
    const interval = window.setInterval(() => void checkStatus(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedPendingId])

  const chooseContact = (contact: ContactSuggestion) => {
    const destination = destinationForContact(contact)
    if (!destination) return
    setSelectedContact(contact)
    setRecipient(destination)
    setContactName(contact.name || "")
    setSuggestions([])
  }

  const whatsappRecipient = channel === "whatsapp" ? normalizedPhoneDigits(recipient) : ""
  const looksLikeWhatsAppNumber = whatsappRecipient.length >= 8 && whatsappRecipient.length <= 15
  const matchingSuggestedContact = channel === "whatsapp"
    ? suggestions.find((contact) => normalizedPhoneDigits(destinationForContact(contact)) === whatsappRecipient)
    : undefined
  const canNameNewWhatsAppContact =
    channel === "whatsapp" && looksLikeWhatsAppNumber && !selectedContact && !matchingSuggestedContact && !searching

  const recipientHint = channel === "email"
    ? "Cerca nome o email nella rubrica"
    : channel === "whatsapp"
      ? "Cerca nome, telefono o inserisci es. +39 324 892 6753"
      : channel === "telegram"
        ? "Cerca una chat Telegram già attiva"
        : "Seleziona una conversazione esistente"

  const syncRichEditor = () => {
    const editor = richEditorRef.current
    if (!editor) return
    setBody(editor.innerText.replace(/\u00a0/g, " ").trimEnd())
    setBodyHtml(editor.innerHTML)
  }

  const format = (command: string, value?: string) => {
    richEditorRef.current?.focus()
    document.execCommand(command, false, value)
    syncRichEditor()
  }

  const addLink = () => {
    const url = window.prompt("Inserisci il link")?.trim()
    if (!url) return
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`
    format("createLink", normalized)
  }

  const onFilesSelected = (files: FileList | null) => {
    const picked = Array.from(files || [])
    if (!picked.length) return

    if (channel === "whatsapp") {
      const file = picked[0]
      const problem = validateWhatsAppFile(file)
      if (problem) {
        toast.error(problem)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      if (picked.length > 1) toast.info("Su WhatsApp invio un allegato alla volta: ho selezionato il primo file.")
      setAttachments([file])
      setWhatsAppVoiceNote(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const next = [...attachments, ...picked]
    const total = next.reduce((sum, file) => sum + file.size, 0)
    if (total > 20 * 1024 * 1024) {
      toast.error("Gli allegati non possono superare 20 MB complessivi")
      return
    }
    setAttachments(next)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const startVoiceRecording = async () => {
    if (channel !== "whatsapp" || isRecording) return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Questo browser non consente la registrazione del microfono.")
      return
    }

    const candidates = ["audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"]
    const selectedMime = candidates.find((mime) => MediaRecorder.isTypeSupported(mime))
    if (!selectedMime) {
      toast.error("Il browser non offre un formato audio compatibile con WhatsApp. Puoi comunque allegare un file audio.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      recordingChunksRef.current = []
      discardRecordingRef.current = false
      const recorder = new MediaRecorder(stream, { mimeType: selectedMime })
      mediaRecorderRef.current = recorder

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data)
      })
      recorder.addEventListener("stop", () => {
        stopRecordingTimer()
        stopRecordingTracks()
        setIsRecording(false)
        setRecordingSeconds(0)
        mediaRecorderRef.current = null
        if (discardRecordingRef.current) {
          recordingChunksRef.current = []
          discardRecordingRef.current = false
          return
        }
        const blob = new Blob(recordingChunksRef.current, { type: selectedMime })
        recordingChunksRef.current = []
        if (!blob.size) {
          toast.error("La registrazione è vuota. Riprova.")
          return
        }
        const mime = baseMime(selectedMime)
        const extension = mime === "audio/ogg" ? "ogg" : "m4a"
        const file = new File([blob], `vocale-${Date.now()}.${extension}`, { type: selectedMime })
        const problem = validateWhatsAppFile(file)
        if (problem) {
          toast.error(problem)
          return
        }
        setAttachments([file])
        setWhatsAppVoiceNote(mime === "audio/ogg")
      })

      recorder.start(250)
      setAttachments([])
      setWhatsAppVoiceNote(false)
      setRecordingSeconds(0)
      setIsRecording(true)
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000)
    } catch (error) {
      stopRecordingTracks()
      setIsRecording(false)
      toast.error(error instanceof Error ? `Microfono non disponibile: ${error.message}` : "Microfono non disponibile.")
    }
  }

  const stageWhatsAppMedia = async (file: File): Promise<StagedWhatsAppMedia> => {
    if (!selectedChannelId) throw new Error("Seleziona il numero WhatsApp da usare.")
    const prepare = await fetch("/api/inbox/compose/whatsapp/media-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: selectedChannelId,
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    })
    const grant = await prepare.json().catch(() => ({}))
    if (!prepare.ok || !grant.path || !grant.token || grant.bucket !== "support-private") {
      throw new Error(grant.error || "Impossibile preparare l'allegato WhatsApp.")
    }

    const supabase = createClient()
    const { error } = await supabase.storage
      .from(grant.bucket)
      .uploadToSignedUrl(grant.path, grant.token, file, { contentType: file.type })
    if (error) throw new Error(`Caricamento non riuscito: ${error.message}`)

    const normalizedMime = typeof grant.mimeType === "string" && grant.mimeType ? grant.mimeType : baseMime(file.type)
    return {
      path: grant.path,
      name: file.name,
      mimeType: normalizedMime,
      size: file.size,
      voice: whatsAppVoiceNote && normalizedMime === "audio/ogg",
    }
  }

  const send = async () => {
    if (!recipient.trim() || !hasContent) return
    if (channel === "messenger" || channel === "instagram") {
      toast.error("Per Facebook e Instagram usa una conversazione già aperta dal cliente nella Inbox.")
      return
    }

    setSending(true)
    setQueued(false)
    setQueuedError("")
    setQueuedPendingId("")
    try {
      if (channel === "email") {
        const form = new FormData()
        form.append("to", recipient.trim())
        form.append("cc", cc.trim())
        form.append("bcc", bcc.trim())
        form.append("subject", subject.trim())
        form.append("body", body.trim())
        form.append("bodyHtml", bodyHtml)
        if (selectedChannelId) form.append("channelId", selectedChannelId)
        attachments.forEach((file) => form.append("attachments", file))
        const res = await fetch("/api/gmail/compose", { method: "POST", body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Invio email non riuscito")
        toast.success("Email inviata")
        reset()
        setOpen(false)
        return
      }

      if (channel === "telegram") {
        const form = new FormData()
        form.append("to", recipient.trim())
        form.append("body", body.trim())
        if (selectedChannelId) form.append("channelId", selectedChannelId)
        attachments.forEach((file) => form.append("attachments", file))
        const res = await fetch("/api/inbox/compose/telegram", { method: "POST", body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || "Invio Telegram non riuscito")
        toast.success("Messaggio Telegram inviato")
        reset()
        setOpen(false)
        return
      }

      const media = whatsappFile ? await stageWhatsAppMedia(whatsappFile) : undefined
      const res = await fetch("/api/inbox/compose/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          body: body.trim(),
          channelId: selectedChannelId || undefined,
          contactId: selectedContact?.id,
          contactName: selectedContact?.name || contactName.trim() || undefined,
          media,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Invio WhatsApp non riuscito")
      if (data.mode === "queued") {
        setQueued(true)
        setQueuedPendingId(data.pendingId || "")
        toast.success(media ? "Richiesta inviata: il media partirà dopo l'accettazione" : "Richiesta di apertura WhatsApp inviata")
      } else {
        if (data.warning) toast.warning(data.warning)
        else toast.success(media ? "Media WhatsApp inviato" : "Messaggio WhatsApp inviato")
        reset()
        setOpen(false)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invio non riuscito")
    } finally {
      setSending(false)
    }
  }

  const switchChannel = (type: ComposeChannel) => {
    if (isRecording) stopRecording(true)
    setChannel(type)
    setRecipient("")
    setContactName("")
    setSelectedContact(null)
    setSuggestions([])
    setAttachments([])
    setWhatsAppVoiceNote(false)
    setBody("")
    setBodyHtml("")
    setQueued(false)
    setQueuedPendingId("")
    setQueuedError("")
    if (richEditorRef.current) richEditorRef.current.innerHTML = ""
  }

  const recordingTime = `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="h-12 gap-3 rounded-2xl px-5 shadow-sm"
        aria-label="Crea un nuovo messaggio"
      >
        <Send className="h-5 w-5" />
        Nuovo messaggio
      </Button>

      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>Nuovo messaggio</DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-3">
            <div className="flex flex-wrap gap-2 border-b pb-3">
              {availableTypes.map((type) => {
                const Icon = channelMeta[type].icon
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => switchChannel(type)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                      channel === type ? "border-foreground bg-muted font-medium" : "hover:bg-muted/60"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {channelMeta[type].label}
                  </button>
                )
              })}
            </div>

            {channelsForType.length > 0 && (
              <div className="flex items-center gap-3 border-b py-2 text-sm">
                <span className="w-10 shrink-0 text-muted-foreground">Da</span>
                <Select value={selectedChannelId || channelsForType[0]?.id} onValueChange={setSelectedChannelId}>
                  <SelectTrigger className="h-8 flex-1 border-0 px-0 shadow-none focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channelsForType.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}{item.detail ? ` · ${item.detail}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="relative flex items-center gap-3 border-b py-2">
              <span className="w-10 shrink-0 text-sm text-muted-foreground">A</span>
              <div className="relative flex-1">
                <Input
                  value={recipient}
                  onFocus={() => {
                    setRecipientFocused(true)
                    if (!selectedContact) void loadSuggestions(recipient)
                  }}
                  onBlur={() => window.setTimeout(() => setRecipientFocused(false), 180)}
                  onChange={(event) => {
                    setRecipient(event.target.value)
                    setContactName("")
                    setSelectedContact(null)
                  }}
                  placeholder={recipientHint}
                  className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
                  autoComplete="off"
                />
                {searching && <Loader2 className="absolute right-1 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
                {recipientFocused && suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-9 z-30 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg">
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Rubrica</div>
                    {suggestions.map((contact) => {
                      const destination = destinationForContact(contact)
                      return (
                        <button
                          key={`${contact.id}-${destination}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => chooseContact(contact)}
                          className="flex w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{contact.name || destination}</span>
                            <span className="block truncate text-xs text-muted-foreground">{destination}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              {selectedContact?.name && (
                <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:block">{selectedContact.name}</span>
              )}
              {channel === "email" && (
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <button type="button" className="hover:text-foreground" onClick={() => setShowCc(true)}>Cc</button>
                  <button type="button" className="hover:text-foreground" onClick={() => setShowBcc(true)}>Ccn</button>
                </div>
              )}
            </div>

            {channel === "whatsapp" && (
              <div className="border-b px-2 py-2 text-xs text-muted-foreground sm:px-10">
                Usa sempre il prefisso internazionale: <strong>+39 324 892 6753</strong> oppure <strong>393248926753</strong>.
              </div>
            )}

            {canNameNewWhatsAppContact && (
              <div className="flex items-start gap-3 border-b bg-muted/30 px-3 py-3 sm:px-10">
                <UserPlus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-sm font-medium">Numero non presente in rubrica</p>
                    <p className="text-xs text-muted-foreground">Al primo invio verrà salvato automaticamente nel CRM. Puoi assegnargli subito un nome.</p>
                  </div>
                  <Input
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Nome contatto (opzionale)"
                    className="h-9"
                    aria-label="Nome del nuovo contatto WhatsApp"
                  />
                </div>
              </div>
            )}

            {channel === "email" && showCc && (
              <div className="flex items-center gap-3 border-b py-2">
                <span className="w-10 text-sm text-muted-foreground">Cc</span>
                <Input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Nome o indirizzi email" className="h-8 border-0 px-0 shadow-none focus-visible:ring-0" />
              </div>
            )}
            {channel === "email" && showBcc && (
              <div className="flex items-center gap-3 border-b py-2">
                <span className="w-10 text-sm text-muted-foreground">Ccn</span>
                <Input value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="Nome o indirizzi email" className="h-8 border-0 px-0 shadow-none focus-visible:ring-0" />
              </div>
            )}
            {channel === "email" && (
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Oggetto"
                className="h-11 rounded-none border-0 border-b px-0 shadow-none focus-visible:ring-0"
              />
            )}

            {channel === "email" ? (
              <div className="relative">
                <div className="flex flex-wrap items-center gap-1 border-b py-2">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Grassetto" onClick={() => format("bold")}><Bold className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Corsivo" onClick={() => format("italic")}><Italic className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Sottolineato" onClick={() => format("underline")}><Underline className="h-4 w-4" /></Button>
                  <span className="mx-1 h-5 w-px bg-border" />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Elenco puntato" onClick={() => format("insertUnorderedList")}><List className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Elenco numerato" onClick={() => format("insertOrderedList")}><ListOrdered className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Inserisci link" onClick={addLink}><Link2 className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Rimuovi formattazione" onClick={() => format("removeFormat")}><RemoveFormatting className="h-4 w-4" /></Button>
                </div>
                {!body && (
                  <div className="pointer-events-none absolute left-0 top-[58px] text-sm text-muted-foreground">Scrivi il messaggio...</div>
                )}
                <div
                  ref={richEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-multiline="true"
                  onInput={syncRichEditor}
                  className="min-h-64 whitespace-pre-wrap break-words py-4 text-sm outline-none [&_a]:text-blue-600 [&_a]:underline [&_ol]:ml-6 [&_ol]:list-decimal [&_ul]:ml-6 [&_ul]:list-disc"
                />
              </div>
            ) : (
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={channel === "whatsapp" ? "Scrivi un messaggio, allega un media o registra un vocale..." : "Scrivi il messaggio..."}
                className="min-h-56 resize-y rounded-none border-0 px-0 py-4 shadow-none focus-visible:ring-0"
              />
            )}

            {channel === "whatsapp" && isRecording && (
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                </span>
                <span className="font-medium">Registrazione {recordingTime}</span>
                <span className="text-xs text-red-700">Premi stop per ascoltare prima di inviare.</span>
              </div>
            )}

            {supportsAttachments && attachments.length > 0 && (
              <div className="space-y-3 border-t py-3">
                {channel === "whatsapp" && whatsappFile && <WhatsAppMediaPreview file={whatsappFile} voiceNote={whatsAppVoiceNote} />}
                <div className="flex flex-wrap gap-2">
                  {attachments.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs">
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                      {channel === "whatsapp" && <span className="font-medium">{fileLabel(file, whatsAppVoiceNote)}</span>}
                      <span className="max-w-60 truncate">{file.name}</span>
                      <span className="text-muted-foreground">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                      <button
                        type="button"
                        aria-label={`Rimuovi ${file.name}`}
                        onClick={() => {
                          setAttachments((files) => files.filter((_, i) => i !== index))
                          if (channel === "whatsapp") setWhatsAppVoiceNote(false)
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {channel === "whatsapp" && !queued && !queuedError && (
              <div className="mb-3 flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Foto, video, vocali e documenti partono direttamente se la finestra 24h è aperta. Se è chiusa, HotelAccelerator chiede automaticamente l'apertura e conserva il media fino all'accettazione.</span>
              </div>
            )}
            {channel === "telegram" && (
              <div className="mb-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                Puoi scrivere solo alle chat che hanno già avviato il bot. Selezionale direttamente dalla rubrica nel campo A.
              </div>
            )}
            {(channel === "messenger" || channel === "instagram") && (
              <div className="mb-3 rounded-lg bg-muted/50 p-3 text-sm">
                Per questo canale Meta consente l'invio solo all'interno di una conversazione già avviata dal cliente. Le risposte restano disponibili direttamente dalla conversazione in Inbox.
              </div>
            )}
            {queued && (
              <div className="mb-3 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Richiesta di apertura inviata a Meta.</p>
                  <p>HotelAccelerator verifica la consegna e invierà automaticamente anche il media dopo “Apri comunicazione”.</p>
                </div>
              </div>
            )}
            {queuedError && (
              <div className="mb-3 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">WhatsApp non ha consegnato la comunicazione.</p>
                  <p className="mt-1 break-words">{queuedError}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t px-5 py-3 sm:justify-between">
            <div className="flex min-w-0 items-center gap-1">
              {supportsAttachments && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple={channel !== "whatsapp"}
                    accept={channel === "whatsapp" ? WHATSAPP_ACCEPT : undefined}
                    className="hidden"
                    onChange={(event) => onFilesSelected(event.target.files)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isRecording || queued}
                    onClick={() => fileInputRef.current?.click()}
                    title={channel === "whatsapp" ? "Allega foto, video, audio o documento" : "Allega file o documento"}
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </>
              )}
              {channel === "whatsapp" && (
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "ghost"}
                  size="icon"
                  disabled={queued}
                  onClick={() => isRecording ? stopRecording(false) : void startVoiceRecording()}
                  title={isRecording ? "Termina registrazione" : "Registra vocale"}
                >
                  {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
                </Button>
              )}
              {channel === "whatsapp" ? (
                <span className="truncate text-xs text-muted-foreground">Foto · Video · Vocale · File</span>
              ) : supportsAttachments ? (
                <span className="text-xs text-muted-foreground">Allega file</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>{queued ? "Chiudi" : "Annulla"}</Button>
              {!queued && (
                <Button
                  onClick={send}
                  disabled={!recipient.trim() || !hasContent || sending || isRecording || channel === "messenger" || channel === "instagram"}
                >
                  {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {queuedError ? "Riprova" : "Invia"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
