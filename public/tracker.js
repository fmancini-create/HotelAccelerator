/*! HotelAccelerator tracker (script-first, ~2KB gz)
 * Usage:
 *   <script defer src="https://app.hotelaccelerator.com/tracker.js"
 *           data-key="tw_XXXX" data-endpoint="https://app.hotelaccelerator.com"></script>
 *   window.ha?.track('cta_click', {cta: 'book_now'})
 *   window.ha?.identify({ email: 'a@b.com', name: 'Ana' })
 * Contract:
 *   - session_id: sessionStorage, 30 min sliding
 *   - anonymous_id: localStorage, 2 years
 *   - utm_* parsed once, cached in sessionStorage (first-touch)
 *   - events are queued and flushed on: 1s idle, every 10, pagehide, beforeunload
 *   - uses sendBeacon on unload; keeps fetch() with keepalive as fallback
 */
(function () {
  "use strict";
  if (window.ha && window.ha.__loaded) return;

  var s = document.currentScript;
  // Config sources (priority): data-* attrs > window.HAB_CONFIG > none.
  // HAB_CONFIG is the server-injected form used by the CMS layout.
  var CFG = (window.HAB_CONFIG && typeof window.HAB_CONFIG === "object") ? window.HAB_CONFIG : {};
  var KEY = (s && s.getAttribute("data-key")) || CFG.key || null;
  var SITE_ID = (s && s.getAttribute("data-site")) || CFG.site || null;
  var ENDPOINT =
    (s && s.getAttribute("data-endpoint")) ||
    CFG.endpoint ||
    (new URL(s ? s.src : location.href)).origin;
  if (!KEY) {
    console.warn("[ha] missing write_key (data-key or window.HAB_CONFIG.key)");
    return;
  }

  var SID_KEY = "ha_sid";
  var SID_EXP_KEY = "ha_sid_exp";
  var AID_KEY = "ha_aid";
  var UTM_KEY = "ha_utm";
  var SESSION_IDLE_MS = 30 * 60 * 1000;

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    // RFC4122-ish fallback
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0,
        v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function nowSession() {
    var now = Date.now();
    var sid = sessionStorage.getItem(SID_KEY);
    var exp = parseInt(sessionStorage.getItem(SID_EXP_KEY) || "0", 10);
    if (!sid || !exp || exp < now) {
      sid = uuid();
      sessionStorage.setItem(SID_KEY, sid);
    }
    sessionStorage.setItem(SID_EXP_KEY, String(now + SESSION_IDLE_MS));
    return sid;
  }

  function anonId() {
    var aid = localStorage.getItem(AID_KEY);
    if (!aid) {
      aid = uuid();
      try {
        localStorage.setItem(AID_KEY, aid);
      } catch (e) {
        /* private mode: anon id won't persist, fine */
      }
    }
    return aid;
  }

  function firstTouchUtm() {
    try {
      var cached = sessionStorage.getItem(UTM_KEY);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    var q = new URLSearchParams(location.search);
    var utm = {};
    ["source", "medium", "campaign", "content", "term"].forEach(function (k) {
      var v = q.get("utm_" + k);
      if (v) utm[k] = v;
    });
    try {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    } catch (e) {}
    return utm;
  }

  function clean(obj) {
    var out = {};
    for (var k in obj) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k];
    return out;
  }

  function pageCtx() {
    return {
      page_url: location.href,
      referrer: document.referrer || null,
      utm: firstTouchUtm(),
    };
  }

  // ---- queue + flush ---------------------------------------------------------
  var queue = [];
  var flushTimer = null;
  var FLUSH_DEBOUNCE_MS = 1000;
  var FLUSH_MAX = 10;

  function enqueue(ev) {
    queue.push(ev);
    if (queue.length >= FLUSH_MAX) return flush();
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
  }

  function flush(useBeacon) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (queue.length === 0) return;
    var batch = queue.splice(0, queue.length);
    var body = JSON.stringify({ key: KEY, events: batch });
    var url = ENDPOINT + "/api/track";

    if (useBeacon && navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      } catch (e) {
        /* fallthrough */
      }
    }
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tracking-key": KEY },
        body: body,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
    } catch (e) {}
  }

  // ---- public API ------------------------------------------------------------
  function track(name, props) {
    if (!name) return;
    var ctx = pageCtx();
    enqueue(
      clean({
        event_type: String(name),
        session_id: nowSession(),
        anonymous_id: anonId(),
        page_url: ctx.page_url,
        referrer: ctx.referrer,
        utm: ctx.utm,
        payload: props || {},
      }),
    );
  }

  function identify(traits) {
    if (!traits) return;
    var ctx = pageCtx();
    var body = JSON.stringify(
      clean({
        key: KEY,
        session_id: nowSession(),
        anonymous_id: anonId(),
        email: traits.email,
        name: traits.name,
        phone: traits.phone,
        traits: traits,
        page_url: ctx.page_url,
        referrer: ctx.referrer,
        utm: ctx.utm,
      }),
    );
    try {
      fetch(ENDPOINT + "/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tracking-key": KEY },
        body: body,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
    } catch (e) {}
  }

  function page() {
    track("page_view", {});
  }

  // ---- auto events -----------------------------------------------------------
  // Initial page_view
  page();

  // SPA navigation
  var lastUrl = location.href;
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () {
    origPush.apply(this, arguments);
    setTimeout(checkUrl, 0);
  };
  history.replaceState = function () {
    origReplace.apply(this, arguments);
    setTimeout(checkUrl, 0);
  };
  window.addEventListener("popstate", checkUrl);
  function checkUrl() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      page();
    }
  }

  // Flush on unload so last events survive tab close.
  window.addEventListener("pagehide", function () {
    flush(true);
  });
  window.addEventListener("beforeunload", function () {
    flush(true);
  });

  // ---- expose ---------------------------------------------------------------
  window.ha = {
    __loaded: true,
    key: KEY,
    endpoint: ENDPOINT,
    track: track,
    identify: identify,
    page: page,
    flush: function () {
      flush();
    },
    getSessionId: nowSession,
    getAnonymousId: anonId,
  };
})();
