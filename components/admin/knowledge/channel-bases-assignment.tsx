"use client"

import { useState, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { Send, MessagesSquare, Mail, Loader2, ArrowUp, ArrowDown, X, Plus, Star } from "lucide-react"

export interface ChannelRow {
  id: string
  source: "messaging" | "email"
  channel_type: string
  display_name: string | null
  is_active: boolean
  baseIds: string[]
}

export interface BaseOption {
  id: string
  name: string
}

const CHANNEL_META: Record<string, { label: string; icon: typeof Send }> = {
  telegram: { label: "Telegram", icon: Send },
  whatsapp: { label: "WhatsApp", icon: MessagesSquare },
  email: { label: "Email", icon: Mail },
}

export function ChannelBasesAssignment({
  channels: initialChannels,
  bases,
  title = "Canali",
  description,
}: {
  channels: ChannelRow[]
  bases: BaseOption[]
  title?: string
  description?: ReactNode
}) {
  const [channels, setChannels] = useState<ChannelRow[]>(initialChannels)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const baseName = (id: string) => bases.find((b) => b.id === id)?.name ?? "Base rimossa"

  const setChannelBaseIds = (channel: ChannelRow, baseIds: string[]) =>
    setChannels((previous) =>
      previous.map((candidate) =>
        candidate.id === channel.id && candidate.source === channel.source ? { ...candidate, baseIds } : candidate,
      ),
    )

  const save = async (channel: ChannelRow) => {
    const channelKey = `${channel.source}:${channel.id}`
    setSavingKey(channelKey)
    try {
      const res = await fetch("/api/admin/ai/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          channelId: channel.id,
          channelSource: channel.source,
          baseIds: channel.baseIds,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Errore di salvataggio")
      toast({ title: "Canale aggiornato", description: "Le basi collegate sono state salvate." })
    } catch (err) {
      toast({
        title: "Errore",
        description: err instanceof Error ? err.message : "Impossibile salvare",
        variant: "destructive",
      })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">{title}</CardTitle>
        <CardDescription>
          {description ?? (
            <>
              Collega una o più basi a ogni canale. La <strong>prima</strong> base (contrassegnata come primaria)
              decide modalità, tono e soglia; l&apos;IA cerca però le risposte in <strong>tutte</strong> le basi
              collegate.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {channels.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nessun canale configurato. Aggiungi un bot Telegram, un numero WhatsApp o un account email dalle
            impostazioni dei canali.
          </p>
        )}

        {channels.map((channel) => {
          const meta = CHANNEL_META[channel.channel_type] ?? { label: channel.channel_type, icon: Send }
          const Icon = meta.icon
          const available = bases.filter((b) => !channel.baseIds.includes(b.id))
          return (
            <div
              key={`${channel.source}:${channel.id}`}
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">
                    {channel.display_name || meta.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {meta.label}
                    {!channel.is_active && " · non attivo"}
                  </p>
                </div>
              </div>

              {/* Ordered linked bases */}
              <div className="flex flex-col gap-2">
                {channel.baseIds.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nessuna base collegata: l&apos;IA non risponde su questo canale.
                  </p>
                )}
                {channel.baseIds.map((baseId, index) => (
                  <div
                    key={baseId}
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                  >
                    <span className="flex items-center gap-1.5 text-sm text-foreground min-w-0 flex-1">
                      {index === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-ha-brand-soft bg-ha-brand-soft text-ha-brand-soft-foreground"
                        >
                          <Star className="mr-1 h-3 w-3" /> Primaria
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground w-[4.5rem]">{index + 1}ª</span>
                      )}
                      <span className="truncate">{baseName(baseId)}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...channel.baseIds]
                          ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                          setChannelBaseIds(channel, next)
                        }}
                        title="Sposta su"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === channel.baseIds.length - 1}
                        onClick={() => {
                          const next = [...channel.baseIds]
                          ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                          setChannelBaseIds(channel, next)
                        }}
                        title="Sposta giù"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-ha-danger-soft-foreground"
                        onClick={() =>
                          setChannelBaseIds(channel, channel.baseIds.filter((id) => id !== baseId))
                        }
                        title="Rimuovi"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add a base + save */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {available.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {available.map((b) => (
                      <Button
                        key={b.id}
                        variant="outline"
                        size="sm"
                        className="bg-transparent"
                        onClick={() => setChannelBaseIds(channel, [...channel.baseIds, b.id])}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {b.name}
                      </Button>
                    ))}
                  </div>
                ) : bases.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Prima crea almeno una base di conoscenza.</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Tutte le basi sono collegate.</span>
                )}
                <Button
                  size="sm"
                  onClick={() => save(channel)}
                  disabled={savingKey === `${channel.source}:${channel.id}`}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {savingKey === `${channel.source}:${channel.id}` && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Salva canale
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
