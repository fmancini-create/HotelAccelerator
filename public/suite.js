/**
 * 4BID Suite Loader v1
 *
 * Un solo bootstrap per il sito del cliente. Qualunque script storico della
 * suite (Santaddeo, HotelAccelerator, chat o tracker) puo' delegare qui: il
 * manifest pubblico decide quali funzioni caricare, senza chiedere di
 * modificare il sito.
 */
;(() => {
  if (window.__4BID_SUITE_BOOTSTRAP_RUNNING__) return
  window.__4BID_SUITE_BOOTSTRAP_RUNNING__ = true

  var self =
    document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll("script[src*='/suite.js']")
      return scripts.length ? scripts[scripts.length - 1] : null
    })()
  if (!self) {
    window.__4BID_SUITE_BOOTSTRAP_RUNNING__ = false
    return
  }

  var BASE = ""
  try {
    BASE = new URL(self.getAttribute("src"), window.location.href).origin
  } catch (_) {}
  if (!BASE) {
    window.__4BID_SUITE_BOOTSTRAP_RUNNING__ = false
    return
  }

  var PROPERTY = self.getAttribute("data-property") || ""
  var SANTADDEO_TOKEN = self.getAttribute("data-santaddeo-token") || ""
  var SANTADDEO_BASE = self.getAttribute("data-santaddeo-base") || "https://www.santaddeo.com"
  var CHAT_KEY = self.getAttribute("data-chat-key") || ""
  var TRACKING_KEY = self.getAttribute("data-tracking-key") || ""
  var SOURCE =
    self.getAttribute("data-source") ||
    (SANTADDEO_TOKEN ? "santaddeo" : CHAT_KEY ? "chat" : TRACKING_KEY ? "tracker" : "hotelaccelerator")
  var ALLOW_TRACKING = self.getAttribute("data-tracking") !== "false"
  var ALLOW_CHAT = self.getAttribute("data-chat") !== "false"
  var ALLOW_MESSAGES = self.getAttribute("data-messages") !== "false"

  var state = (window.__4BID_SUITE__ = window.__4BID_SUITE__ || {})
  state.source = SOURCE
  state.base = BASE

  function uid() {
    try {
      if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID()
    } catch (_) {}
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
    })
  }

  /**
   * Una sola sessione per Analytics Intelligence, CRM identity, promo e chat.
   * Se il bootstrap arriva da HotelAccelerator e deve caricare Santaddeo, crea
   * prima lo stesso sa_ai_sid che Analytics Intelligence riusera'.
   */
  function suiteSession(propertyId, santaddeoToken) {
    if (santaddeoToken) {
      try {
        var santaddeoKey = "sa_ai_sid_" + santaddeoToken
        var santaddeoSid = sessionStorage.getItem(santaddeoKey)
        if (santaddeoSid) return santaddeoSid
        santaddeoSid = uid()
        sessionStorage.setItem(santaddeoKey, santaddeoSid)
        return santaddeoSid
      } catch (_) {}
    }
    var key = "__4bid_suite_sid_" + propertyId
    try {
      var existing = sessionStorage.getItem(key)
      if (existing) return existing
      var created = uid()
      sessionStorage.setItem(key, created)
      return created
    } catch (_) {
      return uid()
    }
  }

  function getJson(url) {
    return fetch(url, { method: "GET", mode: "cors", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status)
      return r.json()
    })
  }

  function resolveProperty() {
    if (PROPERTY || CHAT_KEY || TRACKING_KEY) {
      return Promise.resolve({
        propertyId: PROPERTY,
        chatKey: CHAT_KEY,
        trackingKey: TRACKING_KEY,
        santaddeoHotelId: "",
      })
    }
    if (!SANTADDEO_TOKEN) {
      return Promise.resolve({ propertyId: "", chatKey: "", trackingKey: "", santaddeoHotelId: "" })
    }

    var url = SANTADDEO_BASE.replace(/\/$/, "") + "/api/public/suite-context?t=" + encodeURIComponent(SANTADDEO_TOKEN)
    return getJson(url)
      .then(function (data) {
        return {
          propertyId: "",
          chatKey: "",
          trackingKey: "",
          santaddeoHotelId: data && data.hotelId ? String(data.hotelId) : "",
        }
      })
      .catch(function () {
        return { propertyId: "", chatKey: "", trackingKey: "", santaddeoHotelId: "" }
      })
  }

  function manifest(context) {
    var u = new URL(BASE + "/api/public/suite/config")
    if (context.propertyId) u.searchParams.set("property_id", context.propertyId)
    if (context.santaddeoHotelId) u.searchParams.set("santaddeo_hotel_id", context.santaddeoHotelId)
    if (context.chatKey) u.searchParams.set("chat_key", context.chatKey)
    if (context.trackingKey) u.searchParams.set("tracking_key", context.trackingKey)
    u.searchParams.set("source", SOURCE)
    u.searchParams.set("origin", window.location.origin)
    return getJson(u.toString())
  }

  function loadScript(src, attrs, marker) {
    if (!src) return
    if (marker && document.querySelector(marker)) return
    var script = document.createElement("script")
    script.src = src
    script.async = true
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] != null && attrs[key] !== "") script.setAttribute(key, String(attrs[key]))
    })
    ;(document.head || document.documentElement).appendChild(script)
  }

  function loadTracking(feature) {
    if (!ALLOW_TRACKING || !feature || !feature.enabled || feature.alreadyPresent) return
    if (!feature.publicToken || !feature.scriptUrl) return
    var selector = "script[data-token='" + String(feature.publicToken).replace(/'/g, "") + "']"
    loadScript(
      feature.scriptUrl,
      {
        "data-token": feature.publicToken,
        "data-widget": "track",
        "data-suite-origin": "hotelaccelerator",
      },
      selector,
    )
  }

  function loadChat(feature) {
    if (!ALLOW_CHAT || !feature || !feature.enabled || !feature.publicKey) return
    if (window.__chatWidgetCaricato === feature.publicKey) return
    var src = feature.scriptUrl || "/widget/chat.js"
    if (src.charAt(0) === "/") src = BASE + src
    loadScript(
      src,
      { "data-widget-key": feature.publicKey, "data-suite-origin": "suite" },
      "script[data-widget-key='" + feature.publicKey + "']",
    )
  }

  function visitorData(propertyId) {
    var key = "__4bid_suite_visitor_" + propertyId
    var data = null
    try {
      data = JSON.parse(localStorage.getItem(key) || "null")
    } catch (_) {}
    if (!data || typeof data !== "object") {
      data = { first_visit: Date.now(), visit_count: 0, page_visits: {}, room_clicks: 0 }
    }
    data.__key = key
    return data
  }

  function saveVisitor(data) {
    try {
      localStorage.setItem(
        data.__key,
        JSON.stringify({
          first_visit: data.first_visit,
          last_visit: data.last_visit,
          visit_count: data.visit_count,
          page_visits: data.page_visits,
          room_clicks: data.room_clicks,
        }),
      )
    } catch (_) {}
  }

  function injectMessageStyles() {
    if (document.getElementById("__4bid_suite_message_css")) return
    var s = document.createElement("style")
    s.id = "__4bid_suite_message_css"
    s.textContent = [
      ".__4bid_promo_overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px;z-index:2147483000}",
      ".__4bid_promo{position:relative;width:min(420px,calc(100vw - 36px));padding:28px;border-radius:16px;background:#fff;color:#202124;box-shadow:0 20px 70px rgba(0,0,0,.28);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;text-align:center}",
      ".__4bid_promo_x{position:absolute;right:10px;top:8px;border:0;background:transparent;font-size:25px;cursor:pointer;opacity:.55}",
      ".__4bid_promo_img{display:block;max-width:100%;max-height:240px;object-fit:cover;margin:0 auto 14px;border-radius:10px}",
      ".__4bid_promo h3{margin:0 0 10px;font-size:22px;line-height:1.2}.__4bid_promo p{margin:0 0 18px;line-height:1.5}",
      ".__4bid_promo a{display:inline-block;padding:11px 22px;border-radius:9px;text-decoration:none;font-weight:600}",
    ].join("")
    document.head.appendChild(s)
  }

  function text(value) {
    var d = document.createElement("div")
    d.textContent = value == null ? "" : String(value)
    return d.innerHTML
  }

  function initMessages(propertyId, sessionId) {
    var shown = {}
    var visitor = visitorData(propertyId)
    var path = window.location.pathname || "/"
    visitor.visit_count = (visitor.visit_count || 0) + 1
    visitor.page_visits = visitor.page_visits || {}
    visitor.page_visits[path] = (visitor.page_visits[path] || 0) + 1
    visitor.last_visit = Date.now()
    saveVisitor(visitor)
    injectMessageStyles()

    function record(ruleId, kind) {
      fetch(BASE + "/api/messages/impression", {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          rule_id: ruleId,
          session_id: sessionId,
          impression_type: kind,
        }),
      }).catch(function () {})
    }

    function eligible(rule) {
      var c = rule.conditions || {}
      if (rule.rule_type === "page_visits" && c.page_visits) {
        var min = c.page_visits.min || 1
        var pattern = c.page_visits.page_pattern
        var visits = 0
        if (pattern) {
          var re = new RegExp("^" + String(pattern).replace(/\*/g, ".*") + "$")
          Object.keys(visitor.page_visits || {}).forEach(function (p) {
            if (re.test(p)) visits += visitor.page_visits[p] || 0
          })
        } else visits = visitor.visit_count || 0
        return visits >= min
      }
      if (rule.rule_type === "room_interest" && c.room_clicks) {
        return (visitor.room_clicks || 0) >= (c.room_clicks.min || 1)
      }
      if (rule.rule_type === "return_visitor" && c.return_days) {
        var days = (Date.now() - (visitor.first_visit || Date.now())) / 86400000
        return days >= (c.return_days.min || 0) && days <= (c.return_days.max || 999) && (visitor.visit_count || 0) > 1
      }
      return false
    }

    function show(rule) {
      if (shown[rule.id]) return
      shown[rule.id] = true
      var content = rule.message_content || {}
      var style = content.style || {}
      var overlay = document.createElement("div")
      overlay.className = "__4bid_promo_overlay"
      overlay.innerHTML =
        '<div class="__4bid_promo" style="background:' +
        text(style.bg_color || "#fff") +
        ";color:" +
        text(style.text_color || "#202124") +
        '">' +
        '<button class="__4bid_promo_x" aria-label="Chiudi">&times;</button>' +
        (content.image_url ? '<img class="__4bid_promo_img" src="' + text(content.image_url) + '" alt="">' : "") +
        (content.title ? "<h3>" + text(content.title) + "</h3>" : "") +
        "<p>" +
        text(content.body || "") +
        "</p>" +
        (content.cta_text
          ? '<a href="' +
            text(content.cta_url || "#") +
            '" style="background:' +
            text(style.cta_color || "#157347") +
            ';color:#fff">' +
            text(content.cta_text) +
            "</a>"
          : "") +
        "</div>"
      record(rule.id, "view")
      var close = overlay.querySelector(".__4bid_promo_x")
      if (close) {
        close.addEventListener("click", function () {
          record(rule.id, "dismiss")
          overlay.remove()
        })
      }
      var cta = overlay.querySelector("a")
      if (cta) cta.addEventListener("click", function () { record(rule.id, "click") })
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          record(rule.id, "dismiss")
          overlay.remove()
        }
      })
      document.body.appendChild(overlay)
    }

    function loadRules() {
      var u = new URL(BASE + "/api/messages/rules")
      u.searchParams.set("property_id", propertyId)
      u.searchParams.set("session_id", sessionId)
      u.searchParams.set("page", window.location.pathname || "/")
      getJson(u.toString())
        .then(function (data) {
          ;(data.rules || []).forEach(function (rule) {
            if (!eligible(rule)) return
            setTimeout(function () { show(rule) }, Math.max(0, Number(rule.delay_seconds || 0)) * 1000)
          })
        })
        .catch(function () {})
    }

    document.addEventListener(
      "click",
      function (e) {
        var target = e.target && e.target.closest ? e.target.closest("a[href]") : null
        if (!target) return
        var href = String(target.getAttribute("href") || "")
        if (/camere|rooms|suite|room/i.test(href)) {
          visitor.room_clicks = (visitor.room_clicks || 0) + 1
          saveVisitor(visitor)
        }
      },
      true,
    )

    loadRules()
  }

  function start(data) {
    if (!data || !data.propertyId || !data.features) return
    PROPERTY = data.propertyId
    state.propertyId = PROPERTY
    state.features = data.features

    var effectiveSantaddeoToken =
      SANTADDEO_TOKEN ||
      (data.features.tracking && data.features.tracking.publicToken ? String(data.features.tracking.publicToken) : "")
    state.trackingToken = effectiveSantaddeoToken || null
    state.sessionId = suiteSession(PROPERTY, effectiveSantaddeoToken)

    loadTracking(data.features.tracking)
    loadChat(data.features.chat)
    if (ALLOW_MESSAGES && data.features.messages && data.features.messages.enabled) {
      initMessages(PROPERTY, state.sessionId)
    }
    state.ready = true
    try {
      window.dispatchEvent(new CustomEvent("4bid:suite-ready", { detail: state }))
    } catch (_) {}
  }

  resolveProperty()
    .then(manifest)
    .then(start)
    .catch(function () {
      state.ready = false
      window.__4BID_SUITE_BOOTSTRAP_RUNNING__ = false
    })
})()
