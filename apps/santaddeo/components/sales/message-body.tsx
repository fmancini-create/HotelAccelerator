"use client"

import { useEffect, useRef, useState } from "react"
// IMPORTANTE: usiamo il `dompurify` NATIVO (browser), NON `isomorphic-dompurify`.
// Quest'ultimo carica jsdom lato server e, sotto Next 16/Turbopack, jsdom si
// rompe (ERR_REQUIRE_ESM su html-encoding-sniffer -> @exodus/bytes) facendo
// crashare l'SSR della pagina Posta. La sanitizzazione serve solo per iniettare
// HTML nel DOM del browser, quindi la eseguiamo SOLO client-side dopo il mount.
import DOMPurify from "dompurify"

/**
 * Renderizza il corpo di un messaggio email.
 *
 * Le email reali (sia il template brandizzato SANTADDEO in uscita, sia le
 * risposte dei clienti da Gmail/Outlook) sono HTML costruito INTERAMENTE con
 * stili inline (`style="..."`), tag `<style>` e layout a `<table>`. Per mostrarle
 * "come nel client di posta" dobbiamo PRESERVARE quegli stili. In passato il
 * sanitizer rimuoveva l'attributo `style` e il tag `<style>`, appiattendo
 * l'email (niente card, niente spaziature, tabelle impilate).
 *
 * SOLUZIONE (come fanno i webmail): rendiamo l'HTML dentro un IFRAME sandboxato:
 *   - `sandbox="allow-same-origin"` SENZA `allow-scripts` => nessuno script
 *     dell'email puo' essere eseguito, ma possiamo leggere il documento per
 *     auto-dimensionare l'altezza.
 *   - gli stili dell'email restano ISOLATI: non possono influenzare la pagina
 *     dell'app (e viceversa), evitando anche overlay malevoli (`position:fixed`)
 *     perche' confinati all'iframe.
 * In piu' sanitizziamo comunque con DOMPurify (difesa in profondita'): teniamo
 * stili inline e `<style>`, ma rimuoviamo script/iframe/form/object ed eventi.
 *
 * Se non c'e' HTML, mostriamo il testo in `whitespace-pre-wrap`.
 */
export function MessageBody({ text, html }: { text: string | null; html: string | null }) {
  const [safeHtml, setSafeHtml] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [height, setHeight] = useState<number>(0)

  useEffect(() => {
    if (!html || !html.trim() || typeof window === "undefined") {
      setSafeHtml(null)
      return
    }
    const clean = DOMPurify.sanitize(html, {
      // WHOLE_DOCUMENT preserva <head>/<style> del template email completo.
      WHOLE_DOCUMENT: true,
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target"],
      // Niente esecuzione di codice/embedding: l'iframe non ha allow-scripts,
      // ma blocchiamo comunque alla fonte questi vettori.
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "base", "meta", "link"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseenter", "onfocus", "srcdoc"],
    })
    setSafeHtml(clean)
  }, [html])

  // Auto-altezza dell'iframe: leggiamo lo scrollHeight del documento interno
  // (consentito grazie a allow-same-origin) al load e quando le immagini
  // finiscono di caricarsi (cambiano l'altezza del contenuto).
  function measure() {
    const doc = iframeRef.current?.contentDocument
    if (!doc?.body) return
    const h = Math.max(doc.body.scrollHeight, doc.documentElement?.scrollHeight ?? 0)
    if (h > 0) setHeight(h + 8)
  }

  function onLoad() {
    measure()
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    // Forza i link ad aprirsi in una nuova scheda in sicurezza.
    doc.querySelectorAll("a").forEach((a) => {
      a.setAttribute("target", "_blank")
      a.setAttribute("rel", "noopener noreferrer")
    })
    // Ri-misura quando le immagini si caricano.
    doc.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", measure, { once: true })
    })
    // Secondo passaggio asincrono per font/render tardivi.
    setTimeout(measure, 250)
  }

  if (safeHtml) {
    return (
      <iframe
        ref={iframeRef}
        title="Contenuto email"
        // Nessun allow-scripts: il JS eventualmente presente non viene eseguito.
        sandbox="allow-same-origin allow-popups"
        srcDoc={safeHtml}
        onLoad={onLoad}
        className="email-html w-full border-0 bg-white"
        style={{ height: height ? `${height}px` : "120px" }}
      />
    )
  }

  const content = text?.trim() || ""
  if (!content) {
    // Email solo-HTML non ancora sanitizzata (finestra pre-mount): evita il
    // falso "(nessun contenuto testuale)" mostrando un placeholder neutro.
    if (html && html.trim()) {
      return <p className="text-sm italic text-muted-foreground">Caricamento del messaggio…</p>
    }
    return <p className="text-sm italic text-muted-foreground">(nessun contenuto testuale)</p>
  }
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{content}</p>
}
