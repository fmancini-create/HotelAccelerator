"use client"

import { useRouter } from "next/navigation"
import { useMemo } from "react"
import useSWR from "swr"
import { ChevronRight } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SETTINGS_ENTRIES, visibleEntries } from "@/lib/platform/nav"

/*
 * Le schede NON sono piu' un elenco scritto a mano.
 *
 * Questa pagina e il menu leggono lo STESSO manifesto (lib/platform/nav.ts) e
 * applicano lo STESSO filtro (`visibleEntries`). Prima erano due elenchi
 * indipendenti con due filtri diversi, e divergevano davvero: "Tracking" e
 * "CMS" erano marcati qui come solo-admin mentre la guardia vera
 * (`requireAreaPage`) li tratta come aree CONCEDIBILI, cosi' un membro con
 * l'area concessa li vedeva nel menu e non qui.
 *
 * Anche la fonte del ruolo e' la stessa del menu (/api/platform/me): prima qui
 * si usava useAdminAuth, che risponde a una domanda diversa e non conosce le
 * aree concesse.
 */

type PlatformMe = {
  role: "super_admin" | "tenant_admin" | "member" | "none"
  isAdmin?: boolean
  canManageUsers?: boolean
  areas?: string[]
}

const meFetcher = async (url: string): Promise<PlatformMe> => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) return { role: "none" }
  return res.json()
}

type ActiveModules = { activeModules: string[] | null }

type CustomerCode = { customer_code: string; telephone_digits: string; product: { label: string; prefix: string } }

const modulesFetcher = async (url: string): Promise<ActiveModules> => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) return { activeModules: null }
  return res.json()
}

const customerCodeFetcher = async (url: string): Promise<CustomerCode | null> => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) return null
  return res.json()
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const { data: me, isLoading: meLoading } = useSWR<PlatformMe>("/api/platform/me", meFetcher, {
    revalidateOnFocus: false,
  })
  const { data: modulesData } = useSWR<ActiveModules>("/api/platform/modules", modulesFetcher, {
    revalidateOnFocus: false,
  })
  const { data: customerCode } = useSWR<CustomerCode | null>("/api/platform/customer-code", customerCodeFetcher, {
    revalidateOnFocus: false,
  })

  const items = useMemo(
    () =>
      visibleEntries(SETTINGS_ENTRIES, {
        isAdmin: me?.isAdmin,
        areas: me?.areas,
        activeModules: modulesData?.activeModules,
        canManageUsers: me?.canManageUsers,
      }),
    [me, modulesData],
  )

  if (meLoading) {
    return (
      <div className="min-h-full bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-muted/40">
      <AdminHeader
        title="Impostazioni"
        subtitle="Tutto cio' che si configura: canali, assistente, contenuti, utenti e moduli. Le parti operative restano nel menu."
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {customerCode?.customer_code && (
          <Card className="mb-6 border-ha-brand/30 bg-ha-brand-soft/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">Codice cliente — {customerCode.product.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Comunicalo al centralino per ricevere assistenza tecnica. Al telefono scegli prima il prodotto, poi digita le sette cifre.
                </p>
              </div>
              <code className="rounded-md border bg-background px-3 py-2 text-base font-semibold tracking-wide">
                {customerCode.customer_code}
              </code>
            </CardContent>
          </Card>
        )}
        {items.length === 0 ? (
          /*
           * Un membro senza alcuna impostazione concessa vedeva una griglia
           * vuota, indistinguibile da un errore di caricamento. Meglio dirlo.
           */
          <p className="text-sm leading-relaxed text-muted-foreground">
            Non hai impostazioni da gestire. Se ti serve accedere a una configurazione, chiedila a un amministratore
            della struttura.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.id} onClick={() => router.push(item.href)} className="text-left">
                  <Card className="h-full transition-all hover:shadow-md hover:border-ha-brand/40">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        {/*
                          Prima ogni scheda aveva un colore pieno diverso (dieci
                          tinte scelte a mano). Ora usano il colore del marchio:
                          la pagina si legge come una cosa sola e i colori
                          restano quelli del tema.
                        */}
                        <div className="bg-ha-brand-soft text-ha-brand-soft-foreground rounded-lg p-2.5 flex items-center justify-center">
                          <Icon className="w-6 h-6" />
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground" aria-hidden />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardTitle className="text-base text-foreground">{item.label}</CardTitle>
                      <CardDescription className="mt-1.5 text-sm leading-relaxed">{item.description}</CardDescription>
                    </CardContent>
                  </Card>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
