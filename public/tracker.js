/*! HotelAccelerator tracker -> 4BID Suite Loader
 *
 * Gli snippet storici restano validi:
 *   <script defer src="https://www.hotelaccelerator.com/tracker.js"
 *           data-key="tw_XXXX" data-endpoint="https://www.hotelaccelerator.com"></script>
 *
 * Non crea piu' un secondo flusso di pageview. La raccolta sito e' Santaddeo
 * Analytics Intelligence; questo bridge conserva l'API window.ha per eventi
 * CRM espliciti e identify, usando LA STESSA sessione della suite.
 */
(function () {
  "use strict"

  var s = document.currentScript
  var CFG = window.HAB_CONFIG && typeof window.HAB_CONFIG === "object" ? window.HAB_CONFIG : {}
  var KEY = (s && s.getAttribute("data-key")) || CFG.key || null
  var ENDPOINT =
    (s && s.getAttribute("data-endpoint")) ||
    CFG.endpoint ||
    (function () {
      try {
        return new URL(s ? s.src : location.href).origin
      } catch (_) {
        return location.origin
      }
    })()

  if (!KEY) {
    console.warn("[4BID Suite] missing legacy tracking write_key")
    return
  }

  var queued = []
  var AID_KEY = "ha_aid"
  var UTM_KEY = "ha_utm"

  function uuid() {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID()
    } catch (_) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
    })
  }

  function anonId() {
    try {
      var aid = localStorage.getItem(AID_KEY)
      if (aid) return aid
      aid = uuid()
      localStorage.setItem(AID_KEY, aid)
      return aid
    } catch (_) {
      return uuid()
    }
  }

  function firstTouchUtm() {
    try {
      var cached = sessionStorage.getItem(UTM_KEY)
      if (cached) return JSON.parse(cached)
    } catch (_) {}
    var q = new URLSearchParams(location.search)
    var utm = {}
    ;["source", "medium", "campaign", "content", "term"].forEach(function (k) {
      var v = q.get("utm_" + k)
      if (v) utm[k] = v
    })
    try {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm))
    } catch (_) {}
    return utm
  }

  function suiteState() {
    var state = window.__4BID_SUITE__
    return state && state.ready && state.sessionId ? state : null
  }

  function pageCtx() {
    return {
      page_url: location.href,
      referrer: document.referrer || null,
      utm: firstTouchUtm(),
    }
  }

  function post(path, body) {
    try {
      return fetch(ENDPOINT.replace(/\/$/, "") + path, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tracking-key": KEY },
        body: JSON.stringify(body),
        keepalive: true,
        credentials: "omit",
        mode: "cors",
      }).catch(function () {})
    } catch (_) {
      return Promise.resolve()
    }
  }

  function sendTrack(name, props) {
    var state = suiteState()
    if (!state) {
      queued.push({ type: "track", name: name, props: props || {} })
      return
    }
    var ctx = pageCtx()
    post("/api/track", {
      key: KEY,
      events: [
        {
          event_type: String(name || "custom").slice(0, 64),
          session_id: state.sessionId,
          anonymous_id: anonId(),
          page_url: ctx.page_url,
          referrer: ctx.referrer,
          utm: ctx.utm,
          payload: props || {},
        },
      ],
    })
  }

  function sendIdentify(traits) {
    if (!traits) return
    var state = suiteState()
    if (!state) {
      queued.push({ type: "identify", traits: traits })
      return
    }
    var ctx = pageCtx()
    post("/api/identify", {
      key: KEY,
      session_id: state.sessionId,
      anonymous_id: anonId(),
      email: traits.email,
      name: traits.name,
      phone: traits.phone,
      traits: traits,
      page_url: ctx.page_url,
      referrer: ctx.referrer,
      utm: ctx.utm,
    })
  }

  function flushQueue() {
    if (!suiteState() || !queued.length) return
    var pending = queued.slice()
    queued = []
    pending.forEach(function (item) {
      if (item.type === "identify") sendIdentify(item.traits)
      else sendTrack(item.name, item.props)
    })
  }

  function ensureSuite() {
    if (suiteState()) {
      flushQueue()
      return
    }
    if (window.__4BID_SUITE_BOOTSTRAP_REQUESTED__) return
    window.__4BID_SUITE_BOOTSTRAP_REQUESTED__ = true

    var suite = document.createElement("script")
    suite.src = ENDPOINT.replace(/\/$/, "") + "/suite.js"
    suite.async = true
    suite.setAttribute("data-tracking-key", KEY)
    suite.setAttribute("data-source", "tracker")
    ;(document.head || document.documentElement).appendChild(suite)
  }

  window.addEventListener("4bid:suite-ready", flushQueue)

  // Backward compatible facade. page() intentionally does NOT emit a second
  // page_view: Analytics Intelligence is the single source of visit tracking.
  window.ha = {
    __loaded: true,
    __suiteBridge: true,
    key: KEY,
    endpoint: ENDPOINT,
    track: function (name, props) {
      if (!name || name === "page_view") return
      sendTrack(name, props || {})
    },
    identify: sendIdentify,
    page: function () {},
    flush: flushQueue,
    getSessionId: function () {
      var state = suiteState()
      return state ? state.sessionId : null
    },
    getAnonymousId: anonId,
  }

  ensureSuite()
})()
