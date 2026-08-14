/**
 * Caricatore del widget chat.
 *
 * Si installa sul sito del cliente con una riga sola:
 *
 *   <script src="https://LA-PIATTAFORMA/widget/chat.js" data-widget-key="wk_..." async></script>
 *
 * Note che spiegano le scelte fatte qui:
 *
 * - NIENTE dipendenze e niente framework: gira su siti altrui (WordPress, Wix,
 *   HTML scritto a mano) dove non possiamo sapere cosa e' gia' caricato.
 * - Tutta l'interfaccia sta in una Shadow Root: il CSS del sito ospite non puo'
 *   entrare e il nostro non puo' uscire. Senza, il primo `button { width:100% }`
 *   del tema del cliente sfascerebbe il widget.
 * - L'unico dato incorporato e' la chiave pubblica. Colori, testi e misure
 *   arrivano dalla configurazione, quindi una modifica nel pannello si vede sul
 *   sito senza toccare lo snippet.
 * - La base delle chiamate si ricava dall'attributo `src` dello script, non da
 *   `window.location`: `location` e' il sito del CLIENTE, non la piattaforma.
 */
;(() => {
  var script =
    document.currentScript ||
    (function () {
      var tutti = document.querySelectorAll("script[data-widget-key]")
      return tutti.length ? tutti[tutti.length - 1] : null
    })()

  if (!script) return

  var CHIAVE = script.getAttribute("data-widget-key")
  if (!CHIAVE) {
    console.error("[Chat] Manca l'attributo data-widget-key nello snippet")
    return
  }

  // Un solo widget per pagina: se lo snippet finisce due volte nel tema (accade
  // spesso su WordPress) si vedrebbero due pulsanti sovrapposti.
  if (window.__chatWidgetCaricato === CHIAVE) return
  window.__chatWidgetCaricato = CHIAVE

  var BASE = (function () {
    try {
      return new URL(script.getAttribute("src"), window.location.href).origin
    } catch (e) {
      return ""
    }
  })()

  var API = BASE + "/api/public/chat-widget/" + encodeURIComponent(CHIAVE)
  var CHIAVE_SESSIONE = "__chat_conv_" + CHIAVE

  var conversazione = null
  var ultimoMessaggio = null
  var sondaggio = null
  var aperto = false
  var conf = null
  var inviati = {}

  function chiama(corpo) {
    return fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d && d.error ? d.error : "Errore")
        return d
      })
    })
  }

  var ICONE = {
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    sparkles: '<path d="m12 3-1.9 5.8L4 10.7l6.1 1.9L12 18.4l1.9-5.8 6.1-1.9-6.1-1.9z"/>',
    phone:
      '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  }

  function svg(nome, lato) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      lato +
      '" height="' +
      lato +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONE[nome] || ICONE.chat) +
      "</svg>"
    )
  }

  /** Testo del sito ospite dentro il nostro HTML: va sempre neutralizzato,
   *  altrimenti un messaggio con `<img onerror>` eseguirebbe codice. */
  function testo(valore) {
    var d = document.createElement("div")
    d.textContent = valore == null ? "" : String(valore)
    return d.innerHTML
  }

  function raggi(forma, lato) {
    if (forma === "square") return { pulsante: 8, finestra: 10 }
    if (forma === "pill") return { pulsante: Math.round(lato / 2), finestra: 20 }
    return { pulsante: 16, finestra: 16 }
  }

  function avvia() {
    fetch(API + "/config", { method: "GET" })
      .then(function (r) {
        return r.json()
      })
      .then(function (d) {
        // Widget spento o chiave revocata: non si disegna nulla. Il sito del
        // cliente non deve mostrare una chat che non risponde a nessuno.
        if (!d || !d.isActive || !d.appearance) return
        conf = d.appearance
        disegna()
      })
      .catch(function () {
        /* Rete assente: il sito del cliente resta come se il widget non ci fosse. */
      })
  }

  function disegna() {
    var host = document.createElement("div")
    host.setAttribute("data-chat-widget", "")
    // z-index alto ma non massimo: lascia sopra eventuali banner di consenso,
    // che per legge devono restare cliccabili.
    host.style.cssText = "position:fixed;z-index:2147482000;top:0;left:0;width:0;height:0"
    document.body.appendChild(host)

    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host
    var r = raggi(conf.shape, conf.buttonSize)
    var lato = conf.position === "bottom-left" ? "left" : "right"

    root.innerHTML =
      "<style>" +
      ":host,*{box-sizing:border-box}" +
      ".w{position:fixed;bottom:" +
      conf.offsetY +
      "px;" +
      lato +
      ":" +
      conf.offsetX +
      "px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}" +
      ".b{width:" +
      conf.buttonSize +
      "px;height:" +
      conf.buttonSize +
      "px;border-radius:" +
      r.pulsante +
      "px;background:" +
      conf.primaryColor +
      ";color:" +
      conf.textColor +
      ";border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(0,0,0,.18);transition:transform .15s}" +
      ".b:hover{transform:scale(1.05)}" +
      ".p{position:absolute;bottom:" +
      (conf.buttonSize + 14) +
      "px;" +
      lato +
      ":0;width:" +
      conf.windowWidth +
      "px;height:" +
      conf.windowHeight +
      "px;max-width:calc(100vw - 32px);max-height:calc(100vh - 120px);background:#fff;border-radius:" +
      r.finestra +
      "px;box-shadow:0 18px 60px rgba(0,0,0,.24);display:none;flex-direction:column;overflow:hidden}" +
      ".p.on{display:flex}" +
      ".h{background:" +
      conf.primaryColor +
      ";color:" +
      conf.textColor +
      ";padding:14px 16px;display:flex;align-items:center;gap:10px;flex:0 0 auto}" +
      ".h img{width:32px;height:32px;border-radius:6px;object-fit:cover;flex:0 0 auto}" +
      ".h .t{font-size:14px;font-weight:600;line-height:1.3}" +
      ".h .s{font-size:12px;opacity:.85;line-height:1.3}" +
      ".x{margin-left:auto;background:transparent;border:0;color:inherit;cursor:pointer;opacity:.8;font-size:20px;line-height:1;padding:0 2px}" +
      ".m{flex:1 1 auto;overflow-y:auto;padding:14px;background:#f6f6f7;display:flex;flex-direction:column;gap:8px}" +
      ".r{max-width:82%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
      ".r.me{align-self:flex-end;background:" +
      conf.primaryColor +
      ";color:" +
      conf.textColor +
      "}" +
      ".r.them{align-self:flex-start;background:#fff;color:#1f2937;box-shadow:0 1px 2px rgba(0,0,0,.08)}" +
      ".r.sys{align-self:center;background:#e8eaed;color:#3c4043;font-size:13px;text-align:center;max-width:92%}" +
      ".dots{align-self:flex-start;display:none;gap:4px;padding:10px 12px;background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.08)}" +
      ".dots.on{display:flex}" +
      ".dots i{width:6px;height:6px;border-radius:50%;background:#9aa0a6;animation:bl 1.2s infinite}" +
      ".dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}" +
      "@keyframes bl{0%,60%,100%{opacity:.3}30%{opacity:1}}" +
      ".f{flex:0 0 auto;border-top:1px solid #e5e7eb;padding:10px;display:flex;gap:8px;background:#fff}" +
      ".f input{flex:1;border:1px solid #d2d5da;border-radius:10px;padding:9px 11px;font-size:14px;font-family:inherit;color:#1f2937;min-width:0}" +
      ".f input:focus{outline:2px solid " +
      conf.primaryColor +
      ";outline-offset:-1px}" +
      ".f button{background:" +
      conf.primaryColor +
      ";color:" +
      conf.textColor +
      ";border:0;border-radius:10px;padding:0 14px;cursor:pointer;font-size:14px;font-family:inherit}" +
      ".f button:disabled{opacity:.5;cursor:default}" +
      ".e{color:#b3261e;font-size:12px;padding:0 12px 8px;background:#fff}" +
      "</style>" +
      '<div class="w">' +
      '<div class="p" role="dialog" aria-label="' +
      testo(conf.title) +
      '">' +
      '<div class="h">' +
      (conf.logoUrl ? '<img src="' + testo(conf.logoUrl) + '" alt="">' : "") +
      '<div><div class="t">' +
      testo(conf.title) +
      '</div><div class="s">' +
      testo(conf.subtitle) +
      "</div></div>" +
      '<button class="x" aria-label="Chiudi la chat">&times;</button>' +
      "</div>" +
      '<div class="m" aria-live="polite"><div class="dots"><i></i><i></i><i></i></div></div>' +
      '<div class="e" hidden></div>' +
      '<form class="f"><input type="text" placeholder="' +
      testo(conf.placeholder) +
      '" aria-label="Scrivi un messaggio" maxlength="4000"><button type="submit">Invia</button></form>' +
      "</div>" +
      '<button class="b" aria-label="' +
      testo(conf.title) +
      '" aria-expanded="false">' +
      svg(conf.icon, Math.round(conf.buttonSize * 0.42)) +
      "</button>" +
      "</div>"

    var pulsante = root.querySelector(".b")
    var pannello = root.querySelector(".p")
    var elenco = root.querySelector(".m")
    var puntini = root.querySelector(".dots")
    var errore = root.querySelector(".e")
    var form = root.querySelector(".f")
    var input = root.querySelector(".f input")
    var invio = root.querySelector(".f button")

    function mostraErrore(msg) {
      if (!msg) {
        errore.hidden = true
        errore.textContent = ""
        return
      }
      errore.hidden = false
      errore.textContent = msg
    }

    function aggiungi(m) {
      // Le risposte automatiche arrivano dal sondaggio: senza questo controllo
      // un messaggio comparirebbe due volte (una dall'invio, una dal sondaggio).
      if (m.id && inviati[m.id]) return
      if (m.id) inviati[m.id] = true

      var d = document.createElement("div")
      d.className = "r " + (m.sender_type === "customer" ? "me" : m.sender_type === "system" ? "sys" : "them")
      d.textContent = m.content
      elenco.insertBefore(d, puntini)
      elenco.scrollTop = elenco.scrollHeight
      if (m.stored_at) ultimoMessaggio = m.stored_at
    }

    function leggi() {
      if (!conversazione) return
      chiama({ action: "messages", conversation_id: conversazione, since: ultimoMessaggio })
        .then(function (d) {
          ;(d.messages || []).forEach(aggiungi)
          if ((d.messages || []).length) puntini.classList.remove("on")
        })
        .catch(function () {
          /* Un sondaggio fallito non e' un errore da mostrare: riprova dopo. */
        })
    }

    function apri() {
      aperto = true
      pannello.classList.add("on")
      pulsante.setAttribute("aria-expanded", "true")
      input.focus()

      if (!conversazione) {
        // La conversazione si riprende dalla sessione: cambiando pagina la chat
        // non deve ripartire da zero.
        var salvata = null
        try {
          salvata = sessionStorage.getItem(CHIAVE_SESSIONE)
        } catch (e) {
          salvata = null
        }
        if (salvata) {
          conversazione = salvata
          leggi()
        } else {
          chiama({
            action: "start",
            visitor: { page_url: window.location.href, user_agent: navigator.userAgent, language: navigator.language },
          })
            .then(function (d) {
              conversazione = d.conversation_id
              try {
                sessionStorage.setItem(CHIAVE_SESSIONE, conversazione)
              } catch (e) {
                /* Sessione non disponibile: la chat funziona, ma non si riprende. */
              }
              leggi()
            })
            .catch(function () {
              mostraErrore("Non riesco ad aprire la chat. Riprova tra poco.")
            })
        }
      }

      // Sondaggio: la risposta dell'operatore o dell'IA arriva dopo, e senza
      // questo il visitatore vedrebbe una chat muta.
      if (!sondaggio) sondaggio = setInterval(leggi, 4000)
    }

    function chiudi() {
      aperto = false
      pannello.classList.remove("on")
      pulsante.setAttribute("aria-expanded", "false")
      if (sondaggio) {
        clearInterval(sondaggio)
        sondaggio = null
      }
    }

    pulsante.addEventListener("click", function () {
      if (aperto) chiudi()
      else apri()
    })
    root.querySelector(".x").addEventListener("click", chiudi)

    form.addEventListener("submit", function (e) {
      e.preventDefault()
      var valore = input.value.trim()
      if (!valore || !conversazione) return

      mostraErrore(null)
      input.value = ""
      invio.disabled = true
      aggiungi({ content: valore, sender_type: "customer" })

      chiama({ action: "send", conversation_id: conversazione, message: valore })
        .then(function (d) {
          if (d.message && d.message.stored_at) ultimoMessaggio = d.message.stored_at
          if (d.message && d.message.id) inviati[d.message.id] = true
          // I puntini si mostrano SOLO quando una risposta automatica sta
          // davvero arrivando: fingerli sempre farebbe aspettare invano.
          if (d.ai === "risposta") {
            puntini.classList.add("on")
            elenco.scrollTop = elenco.scrollHeight
          }
          leggi()
        })
        .catch(function () {
          mostraErrore("Messaggio non inviato. Controlla la connessione e riprova.")
        })
        .then(function () {
          invio.disabled = false
          input.focus()
        })
    })
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", avvia)
  } else {
    avvia()
  }
})()
