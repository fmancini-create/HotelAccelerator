(() => {
  if (window.__anna4bidLoaded) return
  window.__anna4bidLoaded = true

  const script = document.currentScript || Array.from(document.scripts).find((s) => s.src && s.src.includes('/anna-chat.js'))
  if (!script) return

  const publicKey = script.dataset.publicKey
  if (!publicKey) return

  const hiddenPrefixes = (script.dataset.hideOn || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (hiddenPrefixes.some((prefix) => window.location.pathname.startsWith(prefix))) return

  const product = script.dataset.product || '4BID'
  const scriptOrigin = new URL(script.src, window.location.href).origin
  // hotelaccelerator.com is commonly redirected/canonicalized to www.
  // A redirected CORS preflight can surface in browsers only as "Failed to fetch".
  // Always call the canonical production host directly when the embed was loaded
  // from either public HotelAccelerator hostname. Preview/development origins keep
  // using their own origin so previews remain testable.
  const host =
    scriptOrigin === 'https://hotelaccelerator.com' || scriptOrigin === 'https://www.hotelaccelerator.com'
      ? 'https://www.hotelaccelerator.com'
      : scriptOrigin
  const apiUrl = `${host}/api/public/chat-widget/${encodeURIComponent(publicKey)}`
  const storageKey = `anna4bid:${publicKey}:conversation`

  const root = document.createElement('div')
  root.id = 'anna-4bid-widget'
  root.style.position = 'fixed'
  root.style.right = '20px'
  root.style.bottom = '20px'
  root.style.zIndex = '2147483000'
  root.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  document.body.appendChild(root)

  const shadow = root.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}
      button,input,textarea{font:inherit}
      .launcher{width:60px;height:60px;border:0;border-radius:999px;background:#111827;color:white;box-shadow:0 14px 35px rgba(15,23,42,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s ease}
      .launcher:hover{transform:translateY(-2px)}
      .launcher svg{width:27px;height:27px}
      .panel{position:absolute;right:0;bottom:72px;width:min(390px,calc(100vw - 24px));height:min(620px,calc(100vh - 110px));background:white;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 24px 65px rgba(15,23,42,.25);overflow:hidden;display:none;flex-direction:column;color:#111827}
      .panel.open{display:flex}
      .header{display:flex;align-items:center;gap:12px;padding:15px 16px;background:#111827;color:white}
      .avatar{width:38px;height:38px;border-radius:999px;background:white;color:#111827;display:grid;place-items:center;font-weight:800;flex:0 0 auto}
      .headtext{min-width:0;flex:1}.name{font-weight:750;font-size:15px}.sub{font-size:12px;color:#d1d5db;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .close{border:0;background:transparent;color:white;width:34px;height:34px;border-radius:9px;cursor:pointer;font-size:25px;line-height:1}.close:hover{background:rgba(255,255,255,.12)}
      .messages{flex:1;overflow:auto;padding:16px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}
      .bubble{max-width:86%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.42;white-space:pre-wrap;overflow-wrap:anywhere}
      .customer{align-self:flex-end;background:#111827;color:white;border-bottom-right-radius:4px}
      .agent,.system{align-self:flex-start;background:white;color:#111827;border:1px solid #e5e7eb;border-bottom-left-radius:4px}
      .system{color:#475569}
      .typing{font-size:12px;color:#64748b;padding:0 3px;display:none}.typing.show{display:block}
      .error{display:none;margin:0 12px 8px;padding:8px 10px;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:12px}.error.show{display:block}
      .composer{border-top:1px solid #e5e7eb;padding:10px;background:white;display:flex;gap:8px;align-items:flex-end}
      .input{flex:1;min-height:42px;max-height:110px;resize:none;border:1px solid #d1d5db;border-radius:12px;padding:10px 11px;outline:none;color:#111827;background:white}.input:focus{border-color:#111827;box-shadow:0 0 0 2px rgba(17,24,39,.08)}
      .send{height:42px;min-width:42px;padding:0 13px;border:0;border-radius:12px;background:#111827;color:white;cursor:pointer;font-weight:700}.send:disabled{opacity:.45;cursor:default}
      .privacy{font-size:10px;color:#94a3b8;text-align:center;padding:0 10px 9px;background:white}
      @media(max-width:520px){:host{right:12px!important;bottom:12px!important}.panel{position:fixed;inset:12px;width:auto;height:auto;max-height:none;border-radius:16px}.launcher{width:56px;height:56px}}
    </style>
    <section class="panel" aria-label="Chat con Anna" role="dialog" aria-hidden="true">
      <header class="header">
        <div class="avatar">A</div>
        <div class="headtext"><div class="name">Anna · 4BID</div><div class="sub">Assistenza ${escapeHtml(product)}</div></div>
        <button class="close" type="button" aria-label="Chiudi chat">×</button>
      </header>
      <main class="messages" aria-live="polite"></main>
      <div class="typing">Anna sta scrivendo…</div>
      <div class="error"></div>
      <form class="composer">
        <textarea class="input" rows="1" maxlength="4000" placeholder="Scrivi un messaggio…" aria-label="Messaggio"></textarea>
        <button class="send" type="submit" aria-label="Invia">➤</button>
      </form>
      <div class="privacy">La conversazione è gestita da 4BID tramite HotelAccelerator.</div>
    </section>
    <button class="launcher" type="button" aria-label="Apri chat con Anna" title="Chat con Anna">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A8 8 0 1 1 21 15Z"/></svg>
    </button>`

  const panel = shadow.querySelector('.panel')
  const launcher = shadow.querySelector('.launcher')
  const close = shadow.querySelector('.close')
  const messagesEl = shadow.querySelector('.messages')
  const form = shadow.querySelector('.composer')
  const input = shadow.querySelector('.input')
  const sendButton = shadow.querySelector('.send')
  const typing = shadow.querySelector('.typing')
  const errorEl = shadow.querySelector('.error')

  let conversationId = localStorage.getItem(storageKey) || ''
  let lastSeen = ''
  let pollTimer = null
  let starting = false
  let sending = false

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
  }

  function showError(message) {
    errorEl.textContent = message || 'Si è verificato un errore. Riprova.'
    errorEl.classList.add('show')
  }

  function clearError() {
    errorEl.classList.remove('show')
    errorEl.textContent = ''
  }

  async function post(payload) {
    // Use a CORS-safelisted content type. This keeps the public widget from
    // requiring an OPTIONS preflight before every request; the route still
    // parses the JSON body with request.json(). Credentials are intentionally
    // omitted because the public widget is authenticated only by its public key.
    const response = await fetch(apiUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Servizio chat non disponibile')
    return data
  }

  function appendMessage(message) {
    if (!message || !message.content) return
    if (message.id && messagesEl.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`)) return
    const bubble = document.createElement('div')
    bubble.className = `bubble ${message.sender_type === 'customer' ? 'customer' : message.sender_type === 'system' ? 'system' : 'agent'}`
    if (message.id) bubble.dataset.messageId = message.id
    bubble.textContent = message.content
    messagesEl.appendChild(bubble)
    if (message.stored_at && message.stored_at > lastSeen) lastSeen = message.stored_at
    messagesEl.scrollTop = messagesEl.scrollHeight
  }

  async function startConversation() {
    if (conversationId || starting) return
    starting = true
    clearError()
    try {
      const data = await post({
        action: 'start',
        visitor: {
          language: document.documentElement.lang || navigator.language || 'it',
          page_url: window.location.href,
          user_agent: navigator.userAgent,
        },
      })
      conversationId = data.conversation_id || ''
      if (!conversationId) throw new Error('Conversazione non disponibile')
      localStorage.setItem(storageKey, conversationId)
      if (data.welcome_message) appendMessage({ sender_type: 'system', content: data.welcome_message })
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Impossibile aprire la chat')
    } finally {
      starting = false
    }
  }

  async function refreshMessages() {
    if (!conversationId || document.hidden) return
    try {
      const payload = { action: 'messages', conversation_id: conversationId }
      if (lastSeen) payload.since = lastSeen
      const data = await post(payload)
      ;(data.messages || []).forEach(appendMessage)
      typing.classList.remove('show')
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (/non trovata/i.test(message)) {
        localStorage.removeItem(storageKey)
        conversationId = ''
        lastSeen = ''
      }
    }
  }

  function beginPolling() {
    if (pollTimer) return
    pollTimer = window.setInterval(refreshMessages, 2500)
  }

  function stopPolling() {
    if (!pollTimer) return
    window.clearInterval(pollTimer)
    pollTimer = null
  }

  async function openPanel() {
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')
    launcher.setAttribute('aria-label', 'Chat con Anna aperta')
    await startConversation()
    await refreshMessages()
    beginPolling()
    window.setTimeout(() => input.focus(), 50)
  }

  function closePanel() {
    panel.classList.remove('open')
    panel.setAttribute('aria-hidden', 'true')
    stopPolling()
  }

  launcher.addEventListener('click', () => panel.classList.contains('open') ? closePanel() : openPanel())
  close.addEventListener('click', closePanel)

  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      form.requestSubmit()
    }
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = input.value.trim()
    if (!text || sending) return
    await startConversation()
    if (!conversationId) return

    sending = true
    sendButton.disabled = true
    clearError()
    input.value = ''
    input.style.height = 'auto'
    appendMessage({ sender_type: 'customer', content: text })

    try {
      const data = await post({ action: 'send', conversation_id: conversationId, message: text })
      if (data.ai === 'risposta') typing.classList.add('show')
      window.setTimeout(refreshMessages, 500)
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Invio non riuscito')
      input.value = text
    } finally {
      sending = false
      sendButton.disabled = false
      input.focus()
    }
  })

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling()
    else if (panel.classList.contains('open')) {
      void refreshMessages()
      beginPolling()
    }
  })
})()
