/**
 * HotelAccelerator legacy loader -> 4BID Suite Loader.
 *
 * Gli snippet gia' installati restano validi:
 * <script src="https://hotelaccelerator.com/loader.js" data-property="PROPERTY_ID"></script>
 *
 * Da qui in poi un solo bootstrap decide da remoto se caricare tracking
 * Santaddeo, chat, messaggi promo e le prossime funzioni della suite.
 */
;(() => {
  var self =
    document.currentScript ||
    document.querySelector("script[src*='/loader.js'][data-property]") ||
    document.querySelector("script[src*='/loader.js'][data-tenant]")
  if (!self) return

  var propertyId = self.getAttribute("data-property") || self.getAttribute("data-tenant") || ""
  if (!propertyId) {
    console.error("[4BID Suite] Missing data-property attribute")
    return
  }

  if (window.__4BID_SUITE_BOOTSTRAP_REQUESTED__) return
  window.__4BID_SUITE_BOOTSTRAP_REQUESTED__ = true

  var base = ""
  try {
    base = new URL(self.getAttribute("src"), window.location.href).origin
  } catch (_) {}
  if (!base) return

  var suite = document.createElement("script")
  suite.src = base + "/suite.js"
  suite.async = true
  suite.setAttribute("data-property", propertyId)
  suite.setAttribute("data-source", "hotelaccelerator")

  ;["data-chat", "data-messages", "data-tracking"].forEach(function (name) {
    var value = self.getAttribute(name)
    if (value != null) suite.setAttribute(name, value)
  })

  ;(document.head || document.documentElement).appendChild(suite)
})()
