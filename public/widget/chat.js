/**
 * Stable chat entrypoint -> 4BID Suite Loader + chat runtime.
 *
 * Gli snippet gia' installati NON cambiano. La stessa riga che prima caricava
 * solo la chat ora abilita anche tracking condiviso, messaggi promo e future
 * funzioni attivate dal manifest di suite.
 */
;(() => {
  var self =
    document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll("script[src*='/widget/chat.js'][data-widget-key]")
      return scripts.length ? scripts[scripts.length - 1] : null
    })()
  if (!self) return

  var key = self.getAttribute("data-widget-key") || ""
  if (!key) {
    console.error("[Chat] Manca l'attributo data-widget-key nello snippet")
    return
  }

  var base = ""
  try {
    base = new URL(self.getAttribute("src"), window.location.href).origin
  } catch (_) {}
  if (!base) return

  if (!window.__4BID_SUITE_BOOTSTRAP_REQUESTED__) {
    window.__4BID_SUITE_BOOTSTRAP_REQUESTED__ = true
    var suite = document.createElement("script")
    suite.src = base + "/suite.js"
    suite.async = true
    suite.setAttribute("data-chat-key", key)
    suite.setAttribute("data-source", "chat")
    ;(document.head || document.documentElement).appendChild(suite)
  }

  // Il runtime storico resta separato e stabile: il bridge sopra puo' evolvere
  // senza rischiare regressioni nell'interfaccia della chat.
  if (document.querySelector("script[data-4bid-chat-runtime='" + key + "']")) return
  var runtime = document.createElement("script")
  runtime.src = base + "/widget/chat-runtime.js"
  runtime.async = true
  runtime.setAttribute("data-widget-key", key)
  runtime.setAttribute("data-4bid-chat-runtime", key)
  ;(document.head || document.documentElement).appendChild(runtime)
})()
