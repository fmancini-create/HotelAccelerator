"use client"

import { usePathname } from "next/navigation"
import { useState } from "react"
import { DemoShell } from "./demo-shell"
import { DemoPopup } from "./demo-popup"

/**
 * Wrapper di pagina demo: shell + popup informativo con TTS.
 *
 * pageKey viene derivata dal pathname così il popup ricorda
 * (per sessione) se è già stato visto su quella pagina.
 */
export function DemoPage({
  title,
  narration,
  children,
}: {
  title: string
  narration: string
  children: React.ReactNode
}) {
  const pathname = usePathname() ?? "/demo"
  // Bumpa il nonce per forzare il remount del popup quando l'utente
  // clicca "Riapri info" nello shell.
  const [reopenNonce, setReopenNonce] = useState(0)

  return (
    <DemoShell onReopenInfo={() => setReopenNonce((n) => n + 1)}>
      <DemoPopup
        key={`${pathname}-${reopenNonce}`}
        pageKey={pathname}
        title={title}
        narration={narration}
        forceOpen={reopenNonce > 0}
      />
      {children}
    </DemoShell>
  )
}
