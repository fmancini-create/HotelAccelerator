import { NextResponse } from "next/server"
import { WIDGET_I18N } from "@/lib/embed/widget-i18n"

export const dynamic = "force-dynamic"

/**
 * Script embeddabile GENERICO del canale Santaddeo (multi-widget).
 *
 *   <script src="https://santaddeo.com/embed/santaddeo.js"
 *           data-token="rw_xxx" data-widget="lastminute" async></script>
 *
 * In base a data-widget ("reviews" | "lastminute" | "track", default "reviews")
 * monta il widget giusto in Shadow DOM (isolamento totale dallo stile del sito
 * ospite). "track" = SOLO tracciamento (nessun widget visibile): da installare
 * sul BOOKING ENGINE dove avvengono le ricerche con le date di soggiorno.
 *
 * MULTILINGUA (23/06/2026): le stringhe di sistema sono autotradotte. La lingua
 * viene rilevata da `data-lang` (override) -> `<html lang>` del sito ospite ->
 * lingua del browser -> fallback "en". Vedi lib/embed/widget-i18n.ts. I testi
 * personalizzati dall'hotel (title, messageTemplate, ctaLabel) NON si traducono.
 *
 * Per le recensioni la logica e' identica a /embed/reviews.js (mantenuto come
 * alias retrocompatibile per i siti gia' installati). Qui si aggiunge il
 * widget "lastminute": un banner che appare SOLO se il server segnala
 * un'offerta realmente attiva.
 *
 * La funzione runtime viene serializzata come stringa: niente import a runtime,
 * tutto self-contained nel browser dell'hotel. Il dizionario i18n viene
 * iniettato come secondo argomento JSON.
 */
function widgetRuntime(baseUrl: string, i18n: typeof WIDGET_I18N) {
  const scripts = document.querySelectorAll("script[data-token]")
  const self =
    (document.currentScript as HTMLScriptElement | null) ||
    (scripts[scripts.length - 1] as HTMLScriptElement | undefined)
  if (!self) return
  const token = self.getAttribute("data-token")
  if (!token) {
    console.warn("[santaddeo] data-token mancante")
    return
  }
  const widget = (self.getAttribute("data-widget") || "reviews").toLowerCase()

  // ----- rilevazione lingua (data-lang -> sito -> browser -> fallback) -----
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

  const mount = document.createElement("div")
  mount.setAttribute("data-santaddeo", widget)
  self.parentNode?.insertBefore(mount, self.nextSibling)
  const shadow = mount.attachShadow({ mode: "open" })

  const esc = (s: string) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
    )

  // ----- posizionamento e ombra (condivisi tra i widget) -----
  const shadows: Record<string, string> = {
    none: "none",
    sm: "0 2px 8px rgba(0,0,0,.10)",
    md: "0 8px 30px rgba(0,0,0,.18)",
    lg: "0 12px 48px rgba(0,0,0,.28)",
  }
  function cornerCss(c: string, m: number) {
    const v = c.indexOf("top") === 0 ? "top:" + m + "px;" : "bottom:" + m + "px;"
    const h =
      c.indexOf("center") >= 0
        ? "left:50%;transform:translateX(-50%);"
        : c.indexOf("left") >= 0
          ? "left:" + m + "px;"
          : "right:" + m + "px;"
    return v + h
  }
  // CSS del wrapper: fisso al viewport se floating, altrimenti nel flusso.
  function wrapCss(placement: string, corner: string) {
    return placement === "floating"
      ? ".wrap{position:fixed;z-index:2147483600;" + cornerCss(corner, 16) + "}"
      : ".wrap{}"
  }

  // ----- tracker visitatori (cookieless) -----
  // Guard: una sola registrazione per montaggio, anche se il widget viene
  // ri-disegnato al cambio lingua (evita pageview gonfiate).
  let visitTracked = false
  function trackVisit() {
    if (visitTracked) return
    visitTracked = true
    try {
      let newSession = true
      try {
        const k = "sa_rv_" + token
        if (sessionStorage.getItem(k)) newSession = false
        else sessionStorage.setItem(k, "1")
      } catch (_e) {
        /* no sessionStorage: conta come pageview */
      }
      const url = baseUrl + "/api/public/track?t=" + encodeURIComponent(token!) + "&ns=" + (newSession ? "1" : "0")
      if (navigator.sendBeacon) navigator.sendBeacon(url)
      else fetch(url, { method: "GET", keepalive: true, mode: "no-cors" }).catch(() => {})
    } catch (_e) {
      /* il tracking non deve mai rompere il widget */
    }
  }

  // Reviews path: visita + date di ricerca insieme.
  function track() {
    trackVisit()
    trackSearchDates()
  }

  // ----- tracker DATE DI RICERCA (per-data, cookieless) -----
  // Cattura le date di soggiorno cercate per alimentare il segnale di domanda
  // diretta PER-DATA nel pricing. Stesso gate del tracker visite (addon
  // web_traffic lato server). Fonti: parametri URL/HASH (override
  // data-checkin-param/data-checkout-param o nomi comuni) + API
  // window.santaddeoTrackSearch.
  //
  // BOOKING ENGINE (29/06/2026): i motori di prenotazione sono spesso SPA che
  // (1) mettono le date nell'HASH (#/results?checkin=...) e (2) cambiano le
  // date via navigazione client-side (pushState/hashchange) SENZA reload. Per
  // questo: leggiamo sia location.search sia la query dell'hash, e ri-scansioniamo
  // ad ogni cambio di URL. Il dedup per coppia di date (sessionStorage sa_sq_)
  // evita beacon duplicati, quindi ri-scansionare e' sicuro.
  let searchListenersBound = false
  function trackSearchDates() {
    try {
      const normDate = (raw: string | null | undefined): string | null => {
        if (!raw) return null
        const s = String(raw).trim()
        let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
        if (m) return m[1] + "-" + m[2] + "-" + m[3]
        m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
        if (m) return m[1] + "-" + m[2] + "-" + m[3]
        m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
        if (m) return m[3] + "-" + m[2] + "-" + m[1]
        return null
      }
      const validStay = (iso: string | null): string | null => {
        if (!iso) return null
        const d = new Date(iso + "T00:00:00Z")
        if (isNaN(d.getTime())) return null
        const now = Date.now()
        if (d.getTime() < now - 2 * 864e5 || d.getTime() > now + 730 * 864e5) return null
        return iso
      }
      const sendSearch = (rawIn: string | null, rawOut: string | null) => {
        const ci = validStay(normDate(rawIn))
        const co = validStay(normDate(rawOut))
        if (!ci || !co || co <= ci) return
        try {
          const k = "sa_sq_" + token + "_" + ci + "_" + co
          if (sessionStorage.getItem(k)) return
          sessionStorage.setItem(k, "1")
        } catch (_e2) {
          /* sessionStorage non disponibile */
        }
        const u =
          baseUrl +
          "/api/public/track?t=" +
          encodeURIComponent(token!) +
          "&ci=" +
          encodeURIComponent(ci) +
          "&co=" +
          encodeURIComponent(co)
        if (navigator.sendBeacon) navigator.sendBeacon(u)
        else fetch(u, { method: "GET", keepalive: true, mode: "no-cors" }).catch(() => {})
      }
      const ciOverride = self!.getAttribute("data-checkin-param")
      const coOverride = self!.getAttribute("data-checkout-param")
      const ciNames = ciOverride
        ? [ciOverride]
        : ["checkin", "check_in", "checkindate", "checkin_date", "arrival", "arrivo", "dataarrivo", "from", "start", "datein", "ci"]
      const coNames = coOverride
        ? [coOverride]
        : ["checkout", "check_out", "checkoutdate", "checkout_date", "departure", "partenza", "datapartenza", "to", "end", "dateout", "co"]
      // Estrae la porzione query ("a=1&b=2") da una stringa che puo' essere
      // sia "?a=1" sia un hash "#/path?a=1" sia "#a=1".
      const queryPart = (raw: string): string => {
        if (!raw) return ""
        const q = raw.indexOf("?")
        return q >= 0 ? raw.slice(q + 1) : raw.charAt(0) === "#" ? raw.slice(1) : raw
      }
      // Scansione 1: parametri URL + hash (siti vetrina e SPA che mettono le
      // date nella query/hash).
      const scanUrl = () => {
        const sources: URLSearchParams[] = [new URLSearchParams(window.location.search)]
        if (window.location.hash) {
          try {
            sources.push(new URLSearchParams(queryPart(window.location.hash)))
          } catch (_e4) {
            /* hash non parsabile come query */
          }
        }
        for (const params of sources) {
          const getParam = (names: string[]): string | null => {
            for (const n of names) {
              const v = params.get(n)
              if (v) return v
            }
            return null
          }
          const urlCi = getParam(ciNames)
          const urlCo = getParam(coNames)
          if (urlCi && urlCo) sendSearch(urlCi, urlCo)
        }
      }
      // Scansione 2: CAMPI DEL FORM (booking engine che tengono le date in
      // input/select di sessione, non nell'URL — es. molti motori di
      // prenotazione). Universale: cerchiamo per name/id/data-* che combaciano
      // con i nomi comuni, su qualunque dominio lo script sia caricato. Nessun
      // setup per-engine: gli stessi ciNames/coNames valgono per URL e form.
      const findField = (names: string[]): string | null => {
        for (const n of names) {
          const el = document.querySelector(
            'input[name="' + n + '"],input[id="' + n + '"],input[data-name="' + n + '"],' +
              'select[name="' + n + '"],select[id="' + n + '"]',
          ) as HTMLInputElement | HTMLSelectElement | null
          if (el && el.value && normDate(el.value)) return el.value
        }
        return null
      }
      const scanForms = () => {
        if (typeof document === "undefined" || !document.querySelector) return
        const formCi = findField(ciNames)
        const formCo = findField(coNames)
        if (formCi && formCo) sendSearch(formCi, formCo)
      }
      const scanOnce = () => {
        scanUrl()
        scanForms()
      }
      scanOnce()
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
      // SPA / booking engine: ri-scansiona quando l'URL cambia senza reload.
      if (!searchListenersBound) {
        searchListenersBound = true
        const reScan = () => {
          try {
            scanOnce()
          } catch (_e5) {
            /* mai rompere il sito ospite */
          }
        }
        window.addEventListener("hashchange", reScan)
        window.addEventListener("popstate", reScan)
        try {
          const h = window.history as unknown as Record<string, unknown>
          const wrap = (name: "pushState" | "replaceState") => {
            const orig = h[name]
            if (typeof orig !== "function") return
            h[name] = function (this: unknown, ...args: unknown[]) {
              const r = (orig as (...a: unknown[]) => unknown).apply(this, args)
              reScan()
              return r
            }
          }
          wrap("pushState")
          wrap("replaceState")
        } catch (_e6) {
          /* history non patchabile: restano hashchange/popstate */
        }
        // Booking engine con date nei CAMPI form: i valori compaiono dopo
        // l'interazione dell'utente, non al load. Ri-scansioniamo su change e,
        // come rete di sicurezza universale, con un breve polling iniziale
        // (~45s) che si ferma da solo. Il dedup per coppia evita invii doppi.
        try {
          document.addEventListener("change", reScan, true)
          let polls = 0
          const pid = setInterval(() => {
            polls++
            reScan()
            if (polls >= 45) clearInterval(pid)
          }, 1000)
        } catch (_e7) {
          /* document non disponibile: restano URL/hash/history */
        }
      }
    } catch (_e) {
      /* il tracking date non deve mai rompere il widget */
    }
  }

  // ----- stelle SVG (clipPath proporzionale al voto) -----
  function stars(value: number, accent: string, size: number) {
    const pct = Math.max(0, Math.min(100, (value / 5) * 100))
    const clipW = (pct / 100) * 120
    const id = "c" + Math.random().toString(36).slice(2, 8)
    const star = "M12 2l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.02 6.09 20.13 7.22 13.56 2.45 8.91l6.6-.96z"
    let row = ""
    for (let i = 0; i < 5; i++) row += '<path transform="translate(' + i * 24 + ',0)" d="' + star + '" __FILL__/>'
    let out = '<svg width="' + size * 5 + '" height="' + size + '" viewBox="0 0 120 24" aria-hidden="true">'
    out += '<defs><clipPath id="' + id + '"><rect x="0" y="0" width="' + clipW + '" height="24"/></clipPath></defs>'
    out += row.replace(/__FILL__/g, 'fill="#d4d4d8"')
    out += '<g clip-path="url(#' + id + ')">' + row.replace(/__FILL__/g, 'fill="' + accent + '"') + "</g>"
    out += "</svg>"
    return out
  }

  // ===================== WIDGET RECENSIONI =====================
  function renderReviews() {
    track()
    fetch(baseUrl + "/api/public/reviews-widget/" + encodeURIComponent(token!))
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const cfg = data.config || {}
        const dark = cfg.theme === "dark"
        const accent = cfg.accentColor || "#0d9488"
        const radius = (typeof cfg.radius === "number" ? cfg.radius : 12) + "px"
        const layout = cfg.layout || "bar"
        const bg = dark ? "#18181b" : "#ffffff"
        const fg = dark ? "#fafafa" : "#18181b"
        const muted = dark ? "#a1a1aa" : "#71717a"
        const border = dark ? "#27272a" : "#e4e4e7"
        const maxW = (typeof cfg.maxWidth === "number" ? cfg.maxWidth : 520) + "px"
        const placement = cfg.placement === "floating" ? "floating" : "inline"
        const corner = cfg.corner || "bottom-left"
        const shadowCss = shadows[cfg.shadow as string] || "none"
        const platforms = (data.platforms || []) as Array<{ platform: string; label: string; avg: number | null; count: number }>

        const css =
          "*{box-sizing:border-box;margin:0;padding:0}:host{all:initial}" +
          wrapCss(placement, corner) +
          ".w{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:" + bg + ";color:" + fg +
          ";border:1px solid " + border + ";border-radius:" + radius + ";padding:16px;max-width:" + maxW +
          ";line-height:1.4;box-shadow:" + shadowCss + "}" +
          ".title{font-size:14px;font-weight:600;margin-bottom:12px}" +
          ".overall{display:flex;align-items:center;gap:10px;margin-bottom:14px}" +
          ".overall .num{font-size:30px;font-weight:700}" +
          ".overall .scale{font-size:15px;font-weight:600;color:" + muted + ";margin-left:-6px;align-self:flex-end;margin-bottom:5px}" +
          ".overall .ten{font-size:13px;font-weight:600;color:" + muted + ";align-self:flex-end;margin-bottom:6px;margin-left:2px}" +
          ".overall .sub{font-size:12px;color:" + muted + "}" +
          ".row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0}" +
          ".row+.row{border-top:1px solid " + border + "}.lbl{font-size:13px;font-weight:500}" +
          ".meta{display:flex;align-items:center;gap:8px}.avg{font-size:13px;font-weight:700;min-width:30px;text-align:right}" +
          ".cnt{font-size:11px;color:" + muted + "}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}" +
          ".card{border:1px solid " + border + ";border-radius:" + radius + ";padding:10px}.card .lbl{display:block;margin-bottom:4px}" +
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
              (cfg.showCount !== false ? '<span class="cnt">(' + p.count + ")</span>" : "") + "</div></div>"
          }
          inner += "</div>"
        } else {
          for (const p of platforms) {
            inner +=
              '<div class="row"><span class="lbl">' + esc(p.label) + "</span>" +
              '<span class="meta">' + (p.avg != null ? stars(p.avg, accent, 14) : "") +
              '<span class="avg">' + (p.avg != null ? p.avg.toFixed(2) : "-") + "</span>" +
              (cfg.showCount !== false ? '<span class="cnt">(' + p.count + ")</span>" : "") + "</span></div>"
          }
        }
        inner += '<a class="pwr" href="https://santaddeo.com" target="_blank" rel="noopener">' + esc(t("verified")) + "</a>"
        inner += '<a class="pwr powered" href="https://santaddeo.com" target="_blank" rel="noopener">Powered by: Santaddeo RMS</a>'
        shadow.innerHTML = "<style>" + css + '</style><div class="wrap"><div class="w">' + inner + "</div></div>"
      })
      .catch((e) => console.warn("[santaddeo-reviews] errore:", e))
  }

  // ===================== WIDGET LAST MINUTE =====================
  function fmtRange(from: string | null, to: string | null) {
    if (!from) return ""
    try {
      const opt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
      const f = new Date(from + "T00:00:00").toLocaleDateString(lang, opt)
      if (!to || to === from) return f
      const tt = new Date(to + "T00:00:00").toLocaleDateString(lang, opt)
      return t("dateRange").replace("{from}", f).replace("{to}", tt)
    } catch (_e) {
      return ""
    }
  }

  function renderLastMinute() {
    fetch(baseUrl + "/api/public/last-minute/" + encodeURIComponent(token!))
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        // Niente offerta attiva -> non mostrare nulla (regola dati certi)
        if (!data || !data.active || !data.config) return
        const cfg = data.config
        const offer = data.offer || {}
        const dark = cfg.theme === "dark"
        const accent = cfg.accentColor || "#e11d48"
        const radius = (typeof cfg.radius === "number" ? cfg.radius : 12) + "px"
        const bg = dark ? "#18181b" : "#ffffff"
        const fg = dark ? "#fafafa" : "#18181b"
        const muted = dark ? "#a1a1aa" : "#71717a"
        const border = dark ? "#27272a" : "#e4e4e7"

        const discountTxt = offer.discountPct > 0 ? "-" + offer.discountPct + "%" : ""
        const datesTxt = fmtRange(offer.dateFrom, offer.dateTo)
        const roomsTxt = String(offer.roomsLeft || 0)
        // messageTemplate personalizzato dall'hotel -> usato as-is; altrimenti
        // il default tradotto nella lingua rilevata. NB: i default italiani
        // ("Offerta last minute {dates}", "Prenota ora") vengono spesso
        // PERSISTITI nella config JSONB anche quando l'hotel non li ha
        // personalizzati: se il valore salvato coincide col default IT lo
        // trattiamo come non-custom e usiamo la traduzione (altrimenti la prima
        // riga e il bottone restano in italiano su siti in altra lingua).
        const itDict = (i18n.dict as Record<string, Record<string, string>>).it || {}
        const savedTpl = String(cfg.messageTemplate || "")
        const tpl = !savedTpl || savedTpl === itDict.lmDefault ? t("lmDefault") : savedTpl
        const msg = tpl
          .replace(/\{discount\}/g, discountTxt)
          .replace(/\{dates\}/g, datesTxt)
          .replace(/\{rooms\}/g, roomsTxt)

        const det: string[] = []
        if (cfg.show && cfg.show.discount && discountTxt) det.push('<span class="d">' + esc(discountTxt) + "</span>")
        if (cfg.show && cfg.show.dates && datesTxt) det.push("<span>" + esc(datesTxt) + "</span>")
        // Soglia scarsita': se roomsLeftMaxThreshold > 0, mostra il conteggio
        // solo quando le camere rimaste sono <= soglia (0 = sempre).
        const roomsThreshold = typeof cfg.roomsLeftMaxThreshold === "number" ? cfg.roomsLeftMaxThreshold : 0
        const roomsWithinThreshold = roomsThreshold <= 0 || offer.roomsLeft <= roomsThreshold
        if (cfg.show && cfg.show.roomsLeft && offer.roomsLeft > 0 && roomsWithinThreshold)
          det.push("<span>" + esc(t("roomsLeft").replace("{n}", roomsTxt)) + "</span>")

        // Retrocompat: il vecchio campo si chiamava "position".
        const placement = (cfg.placement || cfg.position) === "floating" ? "floating" : "inline"
        const corner = cfg.corner || "bottom-right"
        const maxW = (typeof cfg.maxWidth === "number" ? cfg.maxWidth : 520) + "px"
        const shadowCss = shadows[cfg.shadow as string] || "none"
        const css =
          "*{box-sizing:border-box;margin:0;padding:0}:host{all:initial}" +
          ".lm{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:" + bg + ";color:" + fg +
          ";border:1px solid " + border + ";border-left:4px solid " + accent + ";border-radius:" + radius +
          ";padding:14px 16px;max-width:" + maxW +
          ";line-height:1.45;display:flex;align-items:center;gap:14px;flex-wrap:wrap;box-shadow:" + shadowCss + "}" +
          (placement === "floating"
            ? ".wrap{position:fixed;z-index:2147483600;" + cornerCss(corner, 16) + "}"
            : ".wrap{margin:12px 0}") +
          ".msg{flex:1;min-width:180px}.msg .t{font-size:14px;font-weight:600}" +
          ".det{font-size:12px;color:" + muted + ";margin-top:3px;display:flex;gap:10px;flex-wrap:wrap}" +
          ".det .d{font-weight:700;color:" + accent + "}" +
          ".cta{background:" + accent + ";color:#fff;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;text-decoration:none;white-space:nowrap}"

        let inner = '<div class="msg"><div class="t">' + esc(msg) + "</div>"
        if (det.length) inner += '<div class="det">' + det.join("") + "</div>"
        inner += "</div>"
        if (cfg.show && cfg.show.cta && cfg.ctaUrl) {
          // Stesso criterio del messaggio: il default IT ("Prenota ora")
          // persistito non e' una vera personalizzazione -> traducilo.
          const savedCta = String(cfg.ctaLabel || "")
          const ctaLabel = !savedCta || savedCta === itDict.book ? t("book") : savedCta
          inner += '<a class="cta" href="' + esc(cfg.ctaUrl) + '" target="_blank" rel="noopener">' + esc(ctaLabel) + "</a>"
        }
        shadow.innerHTML = "<style>" + css + '</style><div class="wrap"><div class="lm">' + inner + "</div></div>"
      })
      .catch((e) => console.warn("[santaddeo-lastminute] errore:", e))
  }

  function mountWidget() {
    // Modalita' SOLO TRACCIAMENTO (booking engine): nessun widget visibile,
    // cattura solo le date di ricerca. Le VISITE non vengono contate di default
    // per non mescolare il traffico del booking engine con la baseline del sito
    // (opt-in con data-track-visits="1"). Vedi web-traffic-tool.tsx.
    if (widget === "track") {
      if (self!.getAttribute("data-track-visits") === "1") trackVisit()
      trackSearchDates()
      return
    }
    if (widget === "lastminute") renderLastMinute()
    else renderReviews()
  }

  // Traduzione AL VOLO: se il sito ospite cambia <html lang> senza ricaricare,
  // ri-rileviamo la lingua e ri-montiamo il widget attivo nelle nuove stringhe.
  try {
    new MutationObserver(() => {
      const next = detectLang()
      if (next === lang) return
      lang = next
      L = (i18n.dict as Record<string, Record<string, string>>)[lang] || i18n.dict[i18n.fallback]
      mountWidget()
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] })
  } catch (_e) {
    /* MutationObserver non disponibile: resta la lingua iniziale */
  }

  mountWidget()
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  const body =
    "/* Santaddeo Embed Channel */\n;(" +
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
