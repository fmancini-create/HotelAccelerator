"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Mail, RefreshCw, UserPlus, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Product = "santaddeo" | "hotelprofitai" | "manubot"

type Source = {
  product: Product
  externalTenantId: string
  externalUserId: string
  roleLabel: string | null
  isTenantAdmin: boolean
}

type DirectoryUser = {
  key: string
  email: string
  name: string
  sources: Source[]
  alreadyActive: boolean
  blockedReason: string | null
  requiresRealEmail?: boolean
}

const PRODUCT_LABEL: Record<Product, string> = {
  santaddeo: "Santaddeo",
  hotelprofitai: "HotelProfitAI",
  manubot: "ManuBot",
}

const BOT_PLACEHOLDER_EMAIL_RE = /^bot\+(?:wa|tg)_[^@]+@manubot\.it$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function needsRealEmail(user: DirectoryUser) {
  return user.requiresRealEmail === true || BOT_PLACEHOLDER_EMAIL_RE.test(user.email)
}

export function SuiteUserDirectory() {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [unavailableProducts, setUnavailableProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activatingKey, setActivatingKey] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [emailUser, setEmailUser] = useState<DirectoryUser | null>(null)
  const [realEmail, setRealEmail] = useState("")
  const [emailError, setEmailError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/users/suite-directory", { cache: "no-store" })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Impossibile leggere gli utenti delle altre piattaforme")
      setUsers(Array.isArray(body.users) ? body.users : [])
      setUnavailableProducts(Array.isArray(body.unavailableProducts) ? body.unavailableProducts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossibile leggere gli utenti delle altre piattaforme")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function activate(user: DirectoryUser, email?: string) {
    const source = user.sources[0]
    if (!source || user.alreadyActive || user.blockedReason) {
      return { ok: false as const, error: user.blockedReason || "Utente non attivabile" }
    }
    setActivatingKey(user.key)
    setError("")
    try {
      const response = await fetch("/api/admin/users/suite-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: source.product,
          externalUserId: source.externalUserId,
          ...(email ? { email } : {}),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = body.error || "Attivazione non riuscita"
        setError(message)
        setActivatingKey(null)
        return { ok: false as const, error: message }
      }
      window.location.reload()
      return { ok: true as const }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Attivazione non riuscita"
      setError(message)
      setActivatingKey(null)
      return { ok: false as const, error: message }
    }
  }

  function requestRealEmail(user: DirectoryUser) {
    setEmailUser(user)
    setRealEmail("")
    setEmailError("")
    setError("")
  }

  async function submitRealEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!emailUser) return
    const email = realEmail.trim().toLowerCase()
    if (!EMAIL_RE.test(email) || BOT_PLACEHOLDER_EMAIL_RE.test(email)) {
      setEmailError("Inserisci l'indirizzo email reale della persona")
      return
    }

    setEmailError("")
    const result = await activate(emailUser, email)
    if (!result.ok) setEmailError(result.error)
  }

  const available = users.filter((user) => !user.alreadyActive)

  return (
    <>
      <div className="bg-card rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UsersRound className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-medium">Utenti disponibili dalla suite 4BID</h2>
              <p className="text-xs text-muted-foreground">
                Attiva in HotelAccelerator solo le persone che devono accedervi. I permessi HA restano separati.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
        </div>

        {error && <div className="m-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}

        {unavailableProducts.length > 0 && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-muted text-sm text-muted-foreground">
            Non è stato possibile aggiornare: {unavailableProducts.map((product) => PRODUCT_LABEL[product]).join(", ")}. Gli altri prodotti restano disponibili.
          </div>
        )}

        <div className="divide-y">
          {loading && users.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Caricamento utenti della suite…</div>
          ) : available.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nessun altro utente da attivare dalle piattaforme collegate.
            </div>
          ) : (
            available.map((user) => {
              const requiresEmail = needsRealEmail(user)
              return (
                <div key={user.key} className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{user.name}</div>
                    {requiresEmail ? (
                      <div className="text-sm text-amber-700 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        Email reale necessaria per l'accesso a HotelAccelerator
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground truncate">{user.email}</div>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {user.sources.map((source) => (
                        <span key={`${source.product}:${source.externalUserId}`} className="px-2 py-0.5 rounded-full bg-muted text-xs">
                          {PRODUCT_LABEL[source.product]}
                          {source.roleLabel ? ` · ${source.roleLabel}` : ""}
                        </span>
                      ))}
                    </div>
                    {user.blockedReason && <p className="text-xs text-destructive mt-2">{user.blockedReason}</p>}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => requiresEmail ? requestRealEmail(user) : void activate(user)}
                    disabled={Boolean(user.blockedReason) || activatingKey === user.key}
                    title={user.blockedReason || (requiresEmail ? "Inserisci l'email reale e attiva" : "Attiva come Editor in HotelAccelerator")}
                  >
                    {activatingKey === user.key ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : user.alreadyActive ? (
                      <Check className="w-4 h-4 mr-2" />
                    ) : requiresEmail ? (
                      <Mail className="w-4 h-4 mr-2" />
                    ) : (
                      <UserPlus className="w-4 h-4 mr-2" />
                    )}
                    {user.alreadyActive ? "Attivo" : requiresEmail ? "Inserisci email" : "Attiva"}
                  </Button>
                </div>
              )
            })
          )}
        </div>
      </div>

      <Dialog
        open={emailUser !== null}
        onOpenChange={(open) => {
          if (!open && activatingKey !== emailUser?.key) {
            setEmailUser(null)
            setEmailError("")
            setRealEmail("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inserisci l'email reale</DialogTitle>
            <DialogDescription>
              {emailUser?.name || "Questo operatore"} usa ManuBot tramite WhatsApp o Telegram e non possiede ancora un indirizzo email reale associato all'account. L'indirizzo inserito verrà collegato alla stessa persona in ManuBot e usato per l'accesso a HotelAccelerator.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(event) => void submitRealEmail(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suite-real-email">Email</Label>
              <Input
                id="suite-real-email"
                type="email"
                autoComplete="email"
                value={realEmail}
                onChange={(event) => {
                  setRealEmail(event.target.value)
                  setEmailError("")
                }}
                placeholder="nome@azienda.it"
                autoFocus
                disabled={activatingKey === emailUser?.key}
              />
              {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmailUser(null)}
                disabled={activatingKey === emailUser?.key}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={activatingKey === emailUser?.key || !realEmail.trim()}>
                {activatingKey === emailUser?.key && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                Salva email e attiva
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
