"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, RefreshCw, UserPlus, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"

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
}

const PRODUCT_LABEL: Record<Product, string> = {
  santaddeo: "Santaddeo",
  hotelprofitai: "HotelProfitAI",
  manubot: "ManuBot",
}

export function SuiteUserDirectory() {
  const [users, setUsers] = useState<DirectoryUser[]>([])
  const [unavailableProducts, setUnavailableProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [activatingKey, setActivatingKey] = useState<string | null>(null)
  const [error, setError] = useState("")

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

  async function activate(user: DirectoryUser) {
    const source = user.sources[0]
    if (!source || user.alreadyActive || user.blockedReason) return
    setActivatingKey(user.key)
    setError("")
    try {
      const response = await fetch("/api/admin/users/suite-directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: source.product, externalUserId: source.externalUserId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || "Attivazione non riuscita")
      window.location.reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Attivazione non riuscita")
      setActivatingKey(null)
    }
  }

  const available = users.filter((user) => !user.alreadyActive)

  return (
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
          available.map((user) => (
            <div key={user.key} className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="font-medium truncate">{user.name}</div>
                <div className="text-sm text-muted-foreground truncate">{user.email}</div>
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
                onClick={() => void activate(user)}
                disabled={Boolean(user.blockedReason) || activatingKey === user.key}
                title={user.blockedReason || "Attiva come Editor in HotelAccelerator"}
              >
                {activatingKey === user.key ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : user.alreadyActive ? (
                  <Check className="w-4 h-4 mr-2" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                {user.alreadyActive ? "Attivo" : "Attiva"}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
