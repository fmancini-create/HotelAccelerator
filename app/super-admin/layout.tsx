"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { PlatformShell } from "@/components/platform/platform-shell"
import { ClientToaster } from "@/components/admin/client-toaster"
import { AutoLogoutWatchdog } from "@/components/admin/auto-logout-watchdog"

/**
 * La cornice delle sezioni di piattaforma.
 *
 * PRIMA: questo file conteneva un'intestazione TUTTA SUA — logo, menu a cinque
 * voci scritte a mano, tendina utente e pulsante di uscita — gemella di quella
 * che `PlatformShell` fornisce a `/admin`. Due barre da tenere allineate a mano,
 * con le conseguenze che si sono viste:
 *
 *  - il menu dichiarava 5 voci mentre le pagine su disco erano 7, quindi "Costi
 *    moduli" e "Nuovo cliente" si raggiungevano solo scrivendo l'indirizzo;
 *  - non c'era il selettore della struttura, ne' un modo per tornare all'area
 *    operativa: da qui si entrava e non si usciva piu';
 *  - mancava il <Toaster>, quindi ogni `toast.success`/`toast.error` delle
 *    pagine di piattaforma era MUTO: l'azione riusciva o falliva in silenzio;
 *  - mancava la disconnessione per inattivita', e il ruolo con piu' poteri era
 *    l'unico mai disconnesso.
 *
 * ORA: la stessa cornice di `/admin`. Le voci di piattaforma vivono nell'elenco
 * unico `NAV_ENTRIES` (gruppo "Piattaforma", visibile solo a chi amministra la
 * piattaforma), quindi qui non si dichiara piu' nessun menu.
 *
 * QUESTO FILE RESTA, e non e' un doppione: e' l'unico posto dove vive la
 * GUARDIA di ruolo su `/super-admin/*`. Le pagine sotto mostrano i dati di tutti
 * i clienti, e verificarlo per ogni pagina significherebbe dimenticarsene su
 * quella nuova.
 */
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      if (pathname === "/super-admin/login") {
        setIsChecking(false)
        return
      }

      try {
        const supabase = createClient()
        const hostname = typeof window !== "undefined" ? window.location.hostname : ""
        const isLocalDevHost =
          process.env.NODE_ENV === "development" && (hostname === "localhost" || hostname === "127.0.0.1")

        if (isLocalDevHost) {
          setIsChecking(false)
          return
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()
        if (authError || !user) {
          router.push("/admin")
          return
        }

        const { data: collaborator, error: collaboratorError } = await supabase
          .from("platform_collaborators")
          .select("role, is_active, email")
          .eq("email", user.email)
          .maybeSingle()

        if (collaboratorError || !collaborator) {
          router.push("/admin")
          return
        }

        if (collaborator.role !== "super_admin" || !collaborator.is_active) {
          await supabase.auth.signOut()
          router.push("/admin")
          return
        }

        setIsChecking(false)
      } catch {
        // In errore si NEGA: queste pagine mostrano i dati di tutti i clienti,
        // e un guasto nel controllo non e' un permesso.
        router.push("/admin")
      }
    }

    checkAuth()
  }, [pathname, router])

  // La pagina di accesso non ha cornice: non c'e' ancora nessuno da mostrare
  // nella barra, ne' una sessione da chiudere per inattivita'.
  if (pathname === "/super-admin/login") return <>{children}</>

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <span
            className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin"
            aria-hidden
          />
          <p className="text-sm text-muted-foreground">Verifico i tuoi permessi...</p>
        </div>
      </div>
    )
  }

  return (
    <PlatformShell>
      {children}
      {/* Mancava: senza di questo gli avvisi delle pagine di piattaforma non
          comparivano affatto. Uno solo, perche' due mostrerebbero doppioni. */}
      <ClientToaster />
      {/* Mancava: il ruolo con piu' poteri era l'unico mai disconnesso per
          inattivita'. Nel layout e non nelle pagine, per valere su tutte. */}
      <AutoLogoutWatchdog />
    </PlatformShell>
  )
}
