if (typeof window !== "undefined" && typeof document !== "undefined") {
  try {
    // Only run when document.body exists
    const initFetch = () => {
      // Create hidden iframe to get native fetch
      const iframe = document.createElement("iframe")
      iframe.style.display = "none"
      document.body.appendChild(iframe)

      // Get native fetch from iframe's contentWindow
      const nativeFetch = iframe.contentWindow?.fetch

      // Clean up iframe immediately
      iframe.remove()

      if (nativeFetch) {
        const boundFetch = nativeFetch.bind(iframe.contentWindow)
        // Override all fetch references
        window.fetch = boundFetch
        globalThis.fetch = boundFetch

        // Override v0 internal wrapper if exists
        if ((globalThis as any).__v0__?.globalThis) {
          ;(globalThis as any).__v0__.globalThis.fetch = boundFetch
        }
      }
    }

    // Run immediately if body exists, otherwise wait for DOMContentLoaded
    if (document.body) {
      initFetch()
    } else {
      document.addEventListener("DOMContentLoaded", initFetch, { once: true })
    }
  } catch (e) {
    // Silently ignore errors - use default fetch
    console.warn("[v0] reset-fetch failed:", e)
  }
}

export {}
