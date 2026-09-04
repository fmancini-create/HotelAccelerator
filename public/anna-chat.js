(() => {
  const script = document.currentScript
  if (!script) return

  const publicKey = script.getAttribute("data-widget-key") || ""
  if (!publicKey.startsWith("wk_")) return

  const instanceId = `anna-4bid-${publicKey}`
  if (document.getElementById(instanceId)) return

  const blockedPrefixes = (script.getAttribute("data-exclude-paths") || "/admin,/super-admin,/login,/register,/onboarding")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  if (blockedPrefixes.some((prefix) => window.location.pathname.startsWith(prefix))) return

  const sourceOrigin = new URL(script.src, window.location.href).origin
  const layer = document.createElement("div")
  layer.id = instanceId
  layer.style.position = "fixed"
  layer.style.right = "18px"
  layer.style.bottom = "18px"
  layer.style.zIndex = "2147483000"
  layer.style.fontFamily = "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  document.body.appendChild(layer)

  const launcher = document.createElement("button")
  launcher.type = "button"
  launcher.setAttribute("aria-label", "Apri la chat con Anna di 4BID")
  launcher.title = "Chat con Anna · 4BID"
  launcher.style.width = "58px"
  launcher.style.height = "58px"
  launcher.style.borderRadius = "9999px"
  launcher.style.border = "0"
  launcher.style.background = "#111827"
  launcher.style.color = "#ffffff"
  launcher.style.boxShadow = "0 14px 35px rgba(15,23,42,.28)"
  launcher.style.cursor = "pointer"
  launcher.style.display = "grid"
  launcher.style.placeItems = "center"
  launcher.style.fontWeight = "800"
  launcher.style.fontSize = "20px"
  launcher.style.letterSpacing = "-.02em"
  launcher.textContent = "A"
  layer.appendChild(launcher)

  let frame = null

  function closeWidget() {
    if (!frame) return
    frame.remove()
    frame = null
    launcher.style.display = "grid"
  }

  function openWidget() {
    if (frame) return
    frame = document.createElement("iframe")
    const pageUrl = window.location.href
    frame.src = `${sourceOrigin}/widget/anna/${encodeURIComponent(publicKey)}?page=${encodeURIComponent(pageUrl)}`
    frame.title = "Anna · Assistente virtuale 4BID"
    frame.setAttribute("allow", "clipboard-write")
    frame.style.position = "fixed"
    frame.style.right = "18px"
    frame.style.bottom = "18px"
    frame.style.width = "min(390px, calc(100vw - 24px))"
    frame.style.height = "min(620px, calc(100vh - 24px))"
    frame.style.border = "0"
    frame.style.borderRadius = "18px"
    frame.style.background = "transparent"
    frame.style.boxShadow = "0 24px 70px rgba(15,23,42,.30)"
    frame.style.zIndex = "2147483001"
    frame.style.overflow = "hidden"
    frame.style.colorScheme = "light"
    layer.appendChild(frame)
    launcher.style.display = "none"
  }

  launcher.addEventListener("click", openWidget)

  window.addEventListener("message", (event) => {
    if (event.origin !== sourceOrigin) return
    if (event.data?.type === "anna-4bid-close" && event.data?.publicKey === publicKey) closeWidget()
  })

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWidget()
  })
})()
