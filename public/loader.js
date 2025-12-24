/**
 * Platform Loader Script v1
 *
 * Usage:
 * <script src="https://yourplatform.com/loader.js" data-property="PROPERTY_ID"></script>
 */
;(() => {
  // Configuration
  var scriptTag =
    document.currentScript ||
    document.querySelector("script[data-property]") ||
    document.querySelector("script[data-tenant]")
  var PROPERTY_ID = scriptTag ? scriptTag.getAttribute("data-property") || scriptTag.getAttribute("data-tenant") : null
  var API_BASE = scriptTag ? scriptTag.getAttribute("data-api") || window.location.origin : window.location.origin
  var ENABLE_CHAT = scriptTag ? scriptTag.getAttribute("data-chat") !== "false" : true
  var ENABLE_MESSAGES = scriptTag ? scriptTag.getAttribute("data-messages") !== "false" : true

  if (!PROPERTY_ID) {
    console.error("[Platform] Missing data-property attribute")
    return
  }

  // Session management
  var SESSION_KEY = "__platform_session_" + PROPERTY_ID
  var SESSION_ID = getOrCreateSession()
  var VISITOR_KEY = "__platform_visitor_" + PROPERTY_ID

  function getOrCreateSession() {
    var stored = sessionStorage.getItem(SESSION_KEY)
    if (stored) return stored
    var newSession = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      var r = (Math.random() * 16) | 0
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
    })
    sessionStorage.setItem(SESSION_KEY, newSession)
    return newSession
  }

  // Visitor data (persistent)
  function getVisitorData() {
    try {
      var stored = localStorage.getItem(VISITOR_KEY)
      return stored ? JSON.parse(stored) : { first_visit: Date.now(), visit_count: 0, page_visits: {}, room_clicks: 0 }
    } catch (e) {
      return { first_visit: Date.now(), visit_count: 0, page_visits: {}, room_clicks: 0 }
    }
  }

  function saveVisitorData(data) {
    try {
      localStorage.setItem(VISITOR_KEY, JSON.stringify(data))
    } catch (e) {}
  }

  // UTM extraction
  function getUTMParams() {
    var params = new URLSearchParams(window.location.search)
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    }
  }

  // Track event
  function track(eventType, payload) {
    var data = {
      tenant_id: PROPERTY_ID,
      session_id: SESSION_ID,
      event_type: eventType,
      payload: payload || {},
      page_url: window.location.href,
      referrer: document.referrer,
    }

    var url = API_BASE + "/api/track"
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, JSON.stringify(data))
    } else {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true,
      })
    }
  }

  // ===========================================
  // MESSAGE ENGINE v1 - Solo 3 trigger, 2 formati
  // ===========================================

  var messageEngine = {
    rules: [],
    shownRules: {},

    init: function () {
      if (!ENABLE_MESSAGES) return
      this.loadRules()
      this.injectStyles()
    },

    loadRules: function () {
      
      var url = API_BASE + "/api/messages/rules?property_id=" + PROPERTY_ID + "&session_id=" + SESSION_ID

      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          this.rules = data.rules || []
          // Valuta immediatamente dopo caricamento
          setTimeout(() => {
            this.evaluateRules()
          }, 1000)
        })
        .catch(() => {})
    },

    evaluateRules: function () {
      
      var visitorData = getVisitorData()

      this.rules.forEach((rule) => {
        if (this.shownRules[rule.id]) return

        var shouldShow = this.checkConditions(rule, visitorData)

        if (shouldShow) {
          var delay = (rule.delay_seconds || 0) * 1000
          setTimeout(() => {
            this.showMessage(rule)
          }, delay)
          this.shownRules[rule.id] = true
        }
      })
    },

    checkConditions: (rule, visitorData) => {
      var conditions = rule.conditions || {}
      var ruleType = rule.rule_type

      // page_visits - N visite a pagine specifiche
      if (ruleType === "page_visits" && conditions.page_visits) {
        var minVisits = conditions.page_visits.min || 1
        var pattern = conditions.page_visits.page_pattern
        var visits = 0

        if (pattern) {
          var regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
          Object.keys(visitorData.page_visits || {}).forEach((page) => {
            if (regex.test(page)) visits += visitorData.page_visits[page] || 0
          })
        } else {
          visits = visitorData.visit_count || 0
        }
        return visits >= minVisits
      }

      // room_interest - Click su camere
      if (ruleType === "room_interest" && conditions.room_clicks) {
        var minClicks = conditions.room_clicks.min || 1
        return (visitorData.room_clicks || 0) >= minClicks
      }

      // return_visitor - Visitatore di ritorno
      if (ruleType === "return_visitor" && conditions.return_days) {
        var firstVisit = visitorData.first_visit || Date.now()
        var daysSinceFirst = (Date.now() - firstVisit) / (1000 * 60 * 60 * 24)
        var minDays = conditions.return_days.min || 0
        var maxDays = conditions.return_days.max || 999
        return daysSinceFirst >= minDays && daysSinceFirst <= maxDays && visitorData.visit_count > 1
      }

      return false
    },

    showMessage: function (rule) {
      var content = rule.message_content || {}
      this.recordImpression(rule.id, "view")

      if (rule.message_type === "popup") {
        this.showPopup(rule, content)
      } else if (rule.message_type === "chat") {
        this.showChatMessage(rule, content)
      }
    },

    showPopup: function (rule, content) {
      
      var style = content.style || {}

      var overlay = document.createElement("div")
      overlay.className = "__platform_popup_overlay"
      overlay.innerHTML =
        '<div class="__platform_popup" style="background:' +
        (style.bg_color || "#fff") +
        ";color:" +
        (style.text_color || "#333") +
        '">' +
        '<button class="__platform_popup_close">&times;</button>' +
        (content.image_url ? '<img src="' + content.image_url + '" class="__platform_popup_img">' : "") +
        (content.title ? '<h3 class="__platform_popup_title">' + content.title + "</h3>" : "") +
        '<p class="__platform_popup_body">' +
        content.body +
        "</p>" +
        (content.cta_text
          ? '<a href="' +
            (content.cta_url || "#") +
            '" class="__platform_popup_cta" style="background:' +
            (style.cta_color || "#8B7355") +
            '">' +
            content.cta_text +
            "</a>"
          : "") +
        "</div>"

      overlay.querySelector(".__platform_popup_close").onclick = () => {
        this.recordImpression(rule.id, "dismiss")
        overlay.remove()
      }

      if (content.cta_text) {
        overlay.querySelector(".__platform_popup_cta").onclick = () => {
          this.recordImpression(rule.id, "click")
        }
      }

      overlay.onclick = (e) => {
        if (e.target === overlay) {
          this.recordImpression(rule.id, "dismiss")
          overlay.remove()
        }
      }

      document.body.appendChild(overlay)
    },

    showChatMessage: (rule, content) => {
      var chatIframe = document.getElementById("__platform_chat_iframe")
      if (chatIframe && chatIframe.contentWindow) {
        chatIframe.contentWindow.postMessage(
          {
            type: "platform_inject_message",
            message: content.body,
            cta: content.cta_text ? { text: content.cta_text, url: content.cta_url } : null,
          },
          "*",
        )
        chatIframe.style.display = "block"
      }
    },

    recordImpression: (ruleId, type) => {
      fetch(API_BASE + "/api/messages/impression", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          rule_id: ruleId,
          session_id: SESSION_ID,
          impression_type: type,
        }),
      }).catch(() => {})
    },

    injectStyles: () => {
      var css = [
        ".__platform_popup_overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;animation:__pfade .3s}",
        ".__platform_popup{position:relative;max-width:400px;padding:32px;border-radius:16px;text-align:center;animation:__pslide .3s}",
        ".__platform_popup_close{position:absolute;top:12px;right:12px;background:none;border:none;font-size:24px;cursor:pointer;opacity:0.5}",
        ".__platform_popup_close:hover{opacity:1}",
        ".__platform_popup_img{max-width:100%;border-radius:8px;margin-bottom:16px}",
        ".__platform_popup_title{margin:0 0 12px;font-size:24px;font-weight:600}",
        ".__platform_popup_body{margin:0 0 20px;line-height:1.6}",
        ".__platform_popup_cta{display:inline-block;padding:12px 32px;color:#fff;text-decoration:none;border-radius:8px;font-weight:500}",
        "@keyframes __pfade{from{opacity:0}to{opacity:1}}",
        "@keyframes __pslide{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}",
      ].join("")

      var s = document.createElement("style")
      s.textContent = css
      document.head.appendChild(s)
    },
  }

  // ===========================================
  // TRACKING - Page views e room clicks
  // ===========================================

  function trackPageView() {
    var visitorData = getVisitorData()
    visitorData.visit_count = (visitorData.visit_count || 0) + 1
    var currentPath = window.location.pathname
    visitorData.page_visits = visitorData.page_visits || {}
    visitorData.page_visits[currentPath] = (visitorData.page_visits[currentPath] || 0) + 1
    visitorData.last_visit = Date.now()
    saveVisitorData(visitorData)

    track("page_view", { title: document.title, path: currentPath })

    // Re-evaluate rules after page view
    setTimeout(() => {
      messageEngine.evaluateRules()
    }, 500)
  }

  function trackRoomClicks() {
    document.addEventListener("click", (e) => {
      var link = e.target.closest("a[href*='/camere']")
      if (link) {
        var visitorData = getVisitorData()
        visitorData.room_clicks = (visitorData.room_clicks || 0) + 1
        saveVisitorData(visitorData)

        track("room_click", { href: link.href })

        // Re-evaluate rules after room click
        setTimeout(() => {
          messageEngine.evaluateRules()
        }, 500)
      }
    })
  }

  // ===========================================
  // CHAT WIDGET
  // ===========================================

  function initChat() {
    if (!ENABLE_CHAT) return

    var button = document.createElement("div")
    button.id = "__platform_chat_button"
    button.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>'
    button.style.cssText =
      "position:fixed;bottom:20px;right:20px;width:56px;height:56px;background:#8B7355;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:99999"
    button.querySelector("svg").style.cssText = "width:24px;height:24px;color:#fff"

    var iframe = document.createElement("iframe")
    iframe.id = "__platform_chat_iframe"
    iframe.src = API_BASE + "/chat-widget?property=" + PROPERTY_ID + "&session=" + SESSION_ID
    iframe.style.cssText =
      "position:fixed;bottom:90px;right:20px;width:380px;height:500px;border:none;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.2);display:none;z-index:99998"

    button.onclick = () => {
      var isVisible = iframe.style.display !== "none"
      iframe.style.display = isVisible ? "none" : "block"
    }

    document.body.appendChild(button)
    document.body.appendChild(iframe)
  }

  // ===========================================
  // INIT
  // ===========================================

  function init() {
    trackPageView()
    trackRoomClicks()
    messageEngine.init()
    initChat()

    // Identify session
    fetch(API_BASE + "/api/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ tenant_id: PROPERTY_ID, session_id: SESSION_ID }, getUTMParams())),
    }).catch(() => {})
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
