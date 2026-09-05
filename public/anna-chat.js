(() => {
  /**
   * Compatibilita' per i siti 4BID che installano ancora /anna-chat.js.
   *
   * Il vecchio renderer aveva colori, testi e misure hardcoded e quindi ignorava
   * completamente la personalizzazione salvata nel tenant. Da ora questo file e'
   * solo un bridge: conserva i vecchi snippet gia' installati sui siti e inoltra
   * la loro public key al renderer unico /widget/chat.js, che legge appearance
   * dal database tramite /api/public/chat-widget/:key/config.
   *
   * In questo modo HotelAccelerator, HotelProfitAI, ManuBot, Santaddeo e gli altri
   * siti che usano anna-chat.js ricevono automaticamente logo, colori, posizione,
   * dimensioni e testi configurati dal pannello, senza dover cambiare gli snippet.
   */

  const sourceScript =
    document.currentScript ||
    Array.from(document.scripts).find((candidate) => candidate.src && candidate.src.includes('/anna-chat.js'))
  if (!sourceScript) return

  const publicKey = sourceScript.dataset.publicKey
  if (!publicKey) {
    console.error('[Chat] anna-chat.js: manca data-public-key')
    return
  }

  const hiddenPrefixes = (sourceScript.dataset.hideOn || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (hiddenPrefixes.some((prefix) => window.location.pathname.startsWith(prefix))) return

  // Evita doppi widget se lo snippet e' presente piu' volte nel tema del sito.
  window.__anna4bidLoadedKeys = window.__anna4bidLoadedKeys || {}
  if (window.__anna4bidLoadedKeys[publicKey]) return
  window.__anna4bidLoadedKeys[publicKey] = true

  let scriptOrigin = ''
  try {
    scriptOrigin = new URL(sourceScript.src, window.location.href).origin
  } catch (_) {
    scriptOrigin = ''
  }

  // Mantiene il dominio canonico gia' usato dal vecchio loader; per ambienti di
  // preview/dev usa invece l'origine da cui e' stato realmente caricato il file.
  const host =
    scriptOrigin === 'https://hotelaccelerator.com' || scriptOrigin === 'https://www.hotelaccelerator.com'
      ? 'https://www.hotelaccelerator.com'
      : scriptOrigin

  if (!host) {
    console.error('[Chat] anna-chat.js: origine piattaforma non valida')
    return
  }

  const widgetScript = document.createElement('script')
  widgetScript.src = `${host}/widget/chat.js`
  widgetScript.async = true
  widgetScript.dataset.widgetKey = publicKey
  widgetScript.dataset.legacyAnna4bid = sourceScript.dataset.anna4bid || sourceScript.dataset.product || '4bid'
  widgetScript.onerror = () => {
    delete window.__anna4bidLoadedKeys[publicKey]
    console.error('[Chat] Impossibile caricare il widget configurabile')
  }

  ;(document.head || document.body || document.documentElement).appendChild(widgetScript)
})()
