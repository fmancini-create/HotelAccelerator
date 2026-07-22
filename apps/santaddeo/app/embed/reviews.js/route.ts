import { NextResponse } from "next/server"
import { WIDGET_I18N } from "@/lib/embed/widget-i18n"

export const dynamic = "force-dynamic"

/**
 * Script embeddabile del Widget Recensioni Santaddeo.
 * Servito come application/javascript. L'hotel incolla nel proprio sito:
 *
 *   <script src="https://santaddeo.com/embed/reviews.js"
 *           data-token="rw_xxx" async></script>
 *
 * Lo script:
 *  - trova il proprio tag e legge data-token
 *  - fetch dell'endpoint pubblico /api/public/reviews-widget/{token}
 *  - render in Shadow DOM (isolamento totale dallo stile del sito ospite)
 *  - layout badge | bar | grid, tema/accent/radius dalla config
 *
 * La funzione widget viene scritta come codice reale e poi serializzata, cosi'
 * si possono usare i template literal senza problemi di escaping in TS.
 */

function widgetRuntime(baseUrl: string, i18n: typeof WIDGET_I18N) {
  // --- trova lo script corrente ---
  const scripts = document.querySelectorAll('script[data-token]')
  const self = (document.currentScript as HTMLScriptElement | null) ||
    (scripts[scripts.length - 1] as HTMLScriptElement | undefined)
  if (!self) return
  const token = self.getAttribute("data-token")
  if (!token) {
    console.warn("[santaddeo-reviews] data-token mancante")
    return
  }

  // --- rilevazione lingua (data-lang -> sito ospite -> browser -> fallback) ---
  const norm = (l: string | null | undefined) => String(l || "").slice(0, 2).toLowerCase()
  function detectLang(): string {
    const candidates: string[] = []
    const override = self!.getAttribute("data-lang")
    if (override) candidates.push(override)
    const siteLang = document.documentElement.getAttribute("lang")
    if (siteLang) candidates.push(siteLang)
    if (navigator.languages) candidates.push(...navigator.languages)
    if (navigator.language) candidates.push(navigator.language)
    for (const c of candidates) {
      const n = norm(c)
      if ((i18n.supported as readonly string[]).indexOf(n) >= 0) return n
    }
    return i18n.fallback
  }
  let lang = detectLang()
  let L = (i18n.dict as Record<string, Record<string, string>>)[lang] || i18n.dict[i18n.fallback]
  const t = (key: string) => L[key] || i18n.dict[i18n.fallback][key as keyof (typeof i18n.dict)["en"]] || key

  // Traduzione AL VOLO: se il sito ospite cambia <html lang> senza ricaricare
  // (siti SPA / switch lingua client-side), ri-rileviamo la lingua e
  // ri-disegniamo il widget. `rerender` viene impostato dopo il primo render.
  let rerender: (() => void) | null = null
  function onLangChange() {
    const next = detectLang()
    if (next === lang) return
    lang = next
    L = (i18n.dict as Record<string, Record<string, string>>)[lang] || i18n.dict[i18n.fallback]
    if (rerender) rerender()
  }
  try {
    new MutationObserver(onLangChange).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang"],
    })
  } catch (_e) {
    /* MutationObserver non disponibile: resta la lingua iniziale */
  }

  // --- mount: un div subito dopo lo script ---
  const mount = document.createElement("div")
  mount.setAttribute("data-santaddeo-reviews", token)
  self.parentNode?.insertBefore(mount, self.nextSibling)
  const shadow = mount.attachShadow({ mode: "open" })

  // --- tracker visitatori (cookieless, aggregato) ---
  // Inviato sempre; il server registra solo se l'addon "web_traffic" e' attivo.
  // Nessun cookie: usiamo sessionStorage solo per marcare la sessione corrente.
  try {
    let newSession = true
    try {
      const k = "sa_rv_" + token
      if (sessionStorage.getItem(k)) newSession = false
      else sessionStorage.setItem(k, "1")
    } catch (_e) {
      /* sessionStorage non disponibile: contiamo come pageview */
    }
    const url =
      baseUrl + "/api/public/track?t=" + encodeURIComponent(token) + "&ns=" + (newSession ? "1" : "0")
    if (navigator.sendBeacon) navigator.sendBeacon(url)
    else fetch(url, { method: "GET", keepalive: true, mode: "no-cors" }).catch(() => {})
  } catch (_e) {
    /* il tracking non deve mai rompere il widget */
  }

  // --- tracker DATE DI RICERCA (per-data, cookieless) ---
  // Cattura le date di soggiorno cercate dall'utente per alimentare il segnale
  // di domanda diretta PER-DATA nel pricing. Inviato sempre; il server registra
  // solo se l'addon "web_traffic" e' attivo. Tre fonti, in ordine di priorita':
  //   1) API esplicita: window.santaddeoTrackSearch({checkin, checkout})
  //   2) override parametri URL: data-checkin-param / data-checkout-param
  //   3) auto-rilevamento da nomi di parametro URL comuni
  // Le date vengono normalizzate a YYYY-MM-DD; se non valide, scartate (mai dati
  // inventati).
  try {
    // Normalizza una stringa data in YYYY-MM-DD. Accetta ISO (gia' corretto),
    // YYYY/MM/DD, DD/MM/YYYY e DD-MM-YYYY. Ritorna null se non interpretabile.
    const normDate = (raw: string | null | undefined): string | null => {
      if (!raw) return null
      const s = String(raw).trim()
      // ISO YYYY-MM-DD (eventuale parte oraria ignorata)
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (m) return m[1] + "-" + m[2] + "-" + m[3]
      // YYYY/MM/DD
      m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
      if (m) return m[1] + "-" + m[2] + "-" + m[3]
      // DD/MM/YYYY o DD-MM-YYYY (formato europeo, quello dei booking engine IT)
      m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
      if (m) return m[3] + "-" + m[2] + "-" + m[1]
      return null
    }
    // Valida che sia una data reale e plausibile (non nel passato remoto, non
    // oltre ~2 anni). Ritorna la stringa YYYY-MM-DD o null.
    const validStay = (iso: string | null): string | null => {
      if (!iso) return null
      const d = new Date(iso + "T00:00:00Z")
      if (isNaN(d.getTime())) return null
      const today = new Date()
      const minMs = today.getTime() - 2 * 24 * 3600 * 1000 // tolleranza 2gg nel passato
      const maxMs = today.getTime() + 730 * 24 * 3600 * 1000 // ~2 anni avanti
      const ms = d.getTime()
      if (ms < minMs || ms > maxMs) return null
      return iso
    }

    const params = new URLSearchParams(window.location.search)
    const getParam = (names: string[]): string | null => {
      for (const n of names) {
        const v = params.get(n)
        if (v) return v
      }
      return null
    }

    const sendSearch = (rawIn: string | null, rawOut: string | null) => {
      const ci = validStay(normDate(rawIn))
      const co = validStay(normDate(rawOut))
      if (!ci || !co || co <= ci) return
      // dedup per-sessione sulla coppia di date: evita conteggi multipli mentre
      // l'utente naviga le pagine dei risultati con le stesse date.
      try {
        const k = "sa_sq_" + token + "_" + ci + "_" + co
        if (sessionStorage.getItem(k)) return
        sessionStorage.setItem(k, "1")
      } catch (_e2) {
        /* sessionStorage non disponibile: si conta comunque */
      }
      const u =
        baseUrl +
        "/api/public/track?t=" +
        encodeURIComponent(token) +
        "&ci=" +
        encodeURIComponent(ci) +
        "&co=" +
        encodeURIComponent(co)
      if (navigator.sendBeacon) navigator.sendBeacon(u)
      else fetch(u, { method: "GET", keepalive: true, mode: "no-cors" }).catch(() => {})
    }

    // 2/3) parametri URL (override per-sito o nomi comuni)
    const ciOverride = self.getAttribute("data-checkin-param")
    const coOverride = self.getAttribute("data-checkout-param")
    const ciNames = ciOverride
      ? [ciOverride]
      : ["checkin", "check_in", "checkindate", "checkin_date", "arrival", "arrivo", "dataarrivo", "from", "start", "datein", "ci"]
    const coNames = coOverride
      ? [coOverride]
      : ["checkout", "check_out", "checkoutdate", "checkout_date", "departure", "partenza", "datapartenza", "to", "end", "dateout", "co"]
    const urlCi = getParam(ciNames)
    const urlCo = getParam(coNames)
    if (urlCi && urlCo) sendSearch(urlCi, urlCo)

    // 1) API esplicita per booking engine che non mettono le date in URL.
    //    Esempio: window.santaddeoTrackSearch({ checkin: "2026-08-10", checkout: "2026-08-14" })
    ;(window as unknown as Record<string, unknown>).santaddeoTrackSearch = (arg: {
      checkin?: string
      checkout?: string
    }) => {
      try {
        sendSearch(arg && arg.checkin ? arg.checkin : null, arg && arg.checkout ? arg.checkout : null)
      } catch (_e3) {
        /* mai rompere il sito ospite */
      }
    }
  } catch (_e) {
    /* il tracking date non deve mai rompere il widget */
  }

  const esc = (s: string) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
    )

  // stelle SVG su scala /5 (rating gia' normalizzato lato server).
  // Tecnica: 5 stelle grigie di sfondo + 5 stelle colorate sovrapposte e
  // RITAGLIATE con un clipPath largo pct% dei 120px totali. Cosi' il
  // riempimento e' proporzionale al voto sull'intera riga (es. 4.26 -> 4 piene
  // + una parziale), non per-stella. Un clipPath e' piu' affidabile del
  // gradiente, che con i transform delle singole stelle si comportava male.
  function stars(value: number, accent: string, size: number) {
    const pct = Math.max(0, Math.min(100, (value / 5) * 100))
    const clipW = (pct / 100) * 120
    const id = "c" + Math.random().toString(36).slice(2, 8)
    const star =
      "M12 2l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.02 6.09 20.13 7.22 13.56 2.45 8.91l6.6-.96z"
    let row = ""
    for (let i = 0; i < 5; i++) {
      row += '<path transform="translate(' + i * 24 + ',0)" d="' + star + '" __FILL__/>'
    }
    let out = '<svg width="' + size * 5 + '" height="' + size + '" viewBox="0 0 120 24" aria-hidden="true">'
    out += '<defs><clipPath id="' + id + '"><rect x="0" y="0" width="' + clipW + '" height="24"/></clipPath></defs>'
    // sfondo: tutte grigie
    out += row.replace(/__FILL__/g, 'fill="#d4d4d8"')
    // primo piano: colorate, ritagliate a pct%
    out += '<g clip-path="url(#' + id + ')">' + row.replace(/__FILL__/g, 'fill="' + accent + '"') + "</g>"
    out += "</svg>"
    return out
  }

  function renderReviews(data: any) {
      const cfg = data.config || {}
      const dark = cfg.theme === "dark"
      const accent = cfg.accentColor || "#0d9488"
      const radius = (typeof cfg.radius === "number" ? cfg.radius : 12) + "px"
      const layout = cfg.layout || "bar"
      const bg = dark ? "#18181b" : "#ffffff"
      const fg = dark ? "#fafafa" : "#18181b"
      const muted = dark ? "#a1a1aa" : "#71717a"
      const border = dark ? "#27272a" : "#e4e4e7"

      // --- posizionamento e forma ---
      const maxW = (typeof cfg.maxWidth === "number" ? cfg.maxWidth : 520) + "px"
      const placement = cfg.placement === "floating" ? "floating" : "inline"
      const corner = cfg.corner || "bottom-left"
      const shadows: Record<string, string> = {
        none: "none",
        sm: "0 2px 8px rgba(0,0,0,.10)",
        md: "0 8px 30px rgba(0,0,0,.18)",
        lg: "0 12px 48px rgba(0,0,0,.28)",
      }
      const shadowCss = shadows[cfg.shadow as string] || "none"
      const cornerCss = (c: string, m: number) => {
        const v = c.indexOf("top") === 0 ? "top:" + m + "px;" : "bottom:" + m + "px;"
        const h =
          c.indexOf("center") >= 0
            ? "left:50%;transform:translateX(-50%);"
            : c.indexOf("left") >= 0
              ? "left:" + m + "px;"
              : "right:" + m + "px;"
        return v + h
      }

      const platforms = (data.platforms || []) as Array<{
        platform: string
        label: string
        avg: number | null
        count: number
      }>

      const css =
        "*{box-sizing:border-box;margin:0;padding:0}" +
        ":host{all:initial}" +
        ".wrap{" +
        (placement === "floating" ? "position:fixed;z-index:2147483600;" + cornerCss(corner, 16) : "") +
        "}" +
        ".w{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "background:" + bg + ";color:" + fg + ";border:1px solid " + border + ";" +
        "border-radius:" + radius + ";padding:16px;max-width:" + maxW + ";line-height:1.4;" +
        "box-shadow:" + shadowCss + "}" +
        ".title{font-size:14px;font-weight:600;margin-bottom:12px}" +
        ".overall{display:flex;align-items:center;gap:10px;margin-bottom:14px}" +
        ".overall .num{font-size:30px;font-weight:700}" +
        ".overall .scale{font-size:15px;font-weight:600;color:" + muted + ";margin-left:-6px;align-self:flex-end;margin-bottom:5px}" +
        ".overall .ten{font-size:13px;font-weight:600;color:" + muted + ";align-self:flex-end;margin-bottom:6px;margin-left:2px}" +
        ".overall .sub{font-size:12px;color:" + muted + "}" +
        ".row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0}" +
        ".row+.row{border-top:1px solid " + border + "}" +
        ".lbl{font-size:13px;font-weight:500}" +
        ".meta{display:flex;align-items:center;gap:8px}" +
        ".avg{font-size:13px;font-weight:700;min-width:30px;text-align:right}" +
        ".cnt{font-size:11px;color:" + muted + "}" +
        ".grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}" +
        ".card{border:1px solid " + border + ";border-radius:" + radius + ";padding:10px}" +
        ".card .lbl{display:block;margin-bottom:4px}" +
        ".pwr{margin-top:12px;font-size:10px;color:" + muted + ";text-align:right;text-decoration:none;display:block}" +
        ".pwr.powered{margin-top:2px;font-weight:600}"

      let inner = ""
      if (cfg.title || data.title) inner += '<div class="title">' + esc(cfg.title || data.title) + "</div>"

      if (cfg.showOverall !== false && data.overall != null) {
        inner +=
          '<div class="overall"><span class="num">' + data.overall.toFixed(2) + '</span><span class="scale">/5</span>' +
          '<span class="ten">(' + (data.overall * 2).toFixed(1) + "/10)</span>" +
          stars(data.overall, accent, 18) +
          '<span class="sub">' + (data.totalCount || 0) + " " + esc(t("reviewsCount")) + "</span></div>"
      }

      if (layout === "grid") {
        inner += '<div class="grid">'
        for (const p of platforms) {
          inner +=
            '<div class="card"><span class="lbl">' + esc(p.label) + "</span>" +
            (p.avg != null ? stars(p.avg, accent, 14) : "") +
            '<div class="meta"><span class="avg">' + (p.avg != null ? p.avg.toFixed(2) : "-") + "</span>" +
            (cfg.showCount !== false ? '<span class="cnt">(' + p.count + ")</span>" : "") +
            "</div></div>"
        }
        inner += "</div>"
      } else if (layout === "badge") {
        // solo overall, gia' renderizzato sopra; se assente, fallback prima riga
        if (cfg.showOverall === false) {
          inner += '<div class="overall"><span class="num">' +
            (data.overall != null ? data.overall.toFixed(2) : "-") + "</span>" +
            stars(data.overall || 0, accent, 18) + "</div>"
        }
      } else {
        // bar (default)
        for (const p of platforms) {
          inner +=
            '<div class="row"><span class="lbl">' + esc(p.label) + "</span>" +
            '<span class="meta">' + (p.avg != null ? stars(p.avg, accent, 14) : "") +
            '<span class="avg">' + (p.avg != null ? p.avg.toFixed(2) : "-") + "</span>" +
            (cfg.showCount !== false ? '<span class="cnt">(' + p.count + ")</span>" : "") +
            "</span></div>"
        }
      }

      inner += '<a class="pwr" href="https://santaddeo.com" target="_blank" rel="noopener">' + esc(t("verified")) + "</a>"
      inner += '<a class="pwr powered" href="https://santaddeo.com" target="_blank" rel="noopener">Powered by: Santaddeo RMS</a>'

      shadow.innerHTML = "<style>" + css + "</style><div class=\"wrap\"><div class=\"w\">" + inner + "</div></div>"
  }

  fetch(baseUrl + "/api/public/reviews-widget/" + encodeURIComponent(token))
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => {
      // memorizza i dati e abilita il ri-disegno al cambio lingua
      rerender = () => renderReviews(data)
      renderReviews(data)
    })
    .catch((e) => {
      console.warn("[santaddeo-reviews] errore caricamento widget:", e)
    })
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const body =
    "/* Santaddeo Reviews Widget */\n;(" +
    widgetRuntime.toString() +
    ")(" +
    JSON.stringify(origin) +
    "," +
    JSON.stringify(WIDGET_I18N) +
    ");"

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
