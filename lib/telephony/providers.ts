export type TelephonyProviderId =
  | "3cx"
  | "wildix"
  | "nethvoice"
  | "voispeed"
  | "yeastar"
  | "teams_phone"
  | "webex_calling"
  | "asterisk_freepbx"
  | "avaya_ip_office"

export type ProviderConnectionMode = "api" | "guided" | "bridge"
export type ProviderFieldStorage =
  | "base_url"
  | "client_id"
  | "client_secret"
  | "default_extension"
  | `provider_config.${string}`

export type ProviderField = {
  storage: ProviderFieldStorage
  label: string
  help: string
  placeholder?: string
  required?: boolean
  secret?: boolean
  defaultValue?: string
}

export type ProviderGuideStep = {
  title: string
  body: string
  url?: string
  linkLabel?: string
}

export type ProviderGuideScreenshot = {
  src: string
  alt: string
  caption: string
  sourceUrl: string
}

export type TelephonyProviderDefinition = {
  id: TelephonyProviderId
  name: string
  shortDescription: string
  connectionMode: ProviderConnectionMode
  connectionNote: string
  capabilities: {
    automaticCheck: boolean
    clickToCall: boolean
    inboundEvents: boolean
    voiceAgent: boolean
  }
  fields: ProviderField[]
  guide: {
    intro: string
    steps: ProviderGuideStep[]
    screenshots: ProviderGuideScreenshot[]
    officialDocs: Array<{ label: string; url: string }>
  }
}

export const TELEPHONY_PROVIDER_IDS: readonly TelephonyProviderId[] = [
  "3cx",
  "wildix",
  "nethvoice",
  "voispeed",
  "yeastar",
  "teams_phone",
  "webex_calling",
  "asterisk_freepbx",
  "avaya_ip_office",
] as const

export const TELEPHONY_PROVIDERS: readonly TelephonyProviderDefinition[] = [
  {
    id: "3cx",
    name: "3CX",
    shortDescription: "PBX software/cloud con Call Control API e integrazione CRM gia usata da HotelAccelerator.",
    connectionMode: "api",
    connectionNote: "Connettore reale: verifica API, click-to-call, lookup/journal e Voice Agent 3CX restano disponibili.",
    capabilities: { automaticCheck: true, clickToCall: true, inboundEvents: true, voiceAgent: true },
    fields: [
      { storage: "base_url", label: "Indirizzo 3CX", help: "L'indirizzo HTTPS con cui apri il tuo 3CX.", placeholder: "https://azienda.3cx.it", required: true },
      { storage: "client_id", label: "Client ID", help: "Il Client ID creato in Admin > Integrazioni > API.", required: true },
      { storage: "client_secret", label: "API key / Client Secret", help: "La chiave mostrata da 3CX una sola volta. HotelAccelerator la cifra a riposo.", required: true, secret: true },
      { storage: "default_extension", label: "Interno predefinito", help: "Usato solo se l'utente non ha un interno personale assegnato.", placeholder: "200" },
    ],
    guide: {
      intro: "In 3CX devi creare una piccola applicazione API e copiare due valori dentro HotelAccelerator.",
      steps: [
        { title: "Apri 3CX come amministratore", body: "Entra nel Web Client 3CX e apri Admin." },
        { title: "Vai in Integrazioni > API", body: "Clicca Aggiungi per creare una nuova applicazione. Puoi chiamarla HotelAccelerator.", url: "https://www.3cx.it/doc/configurazione-api-3cx/", linkLabel: "Apri la guida 3CX in italiano" },
        { title: "Abilita Call Control", body: "Attiva l'accesso alla Call Control API. Se vuoi usare anche le funzioni di configurazione/Voice AI, abilita gli scope indicati nella guida 3CX avanzata." },
        { title: "Copia Client ID e API key", body: "3CX mostra la chiave una sola volta: copiala subito. Non inviarla per email e non salvarla in documenti condivisi." },
        { title: "Incolla i dati qui e salva", body: "Inserisci indirizzo HTTPS, Client ID, API key e l'eventuale interno predefinito. HotelAccelerator prova subito la connessione." },
        { title: "Configura le funzioni avanzate", body: "Dopo che 3CX e attivo, usa Configurazione avanzata 3CX per lookup CRM, journal e Voice Agent." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "3CX - Configuration API", url: "https://www.3cx.it/doc/configurazione-api-3cx/" },
        { label: "3CX - Call Control API", url: "https://www.3cx.com/docs/call-control-api/" },
      ],
    },
  },
  {
    id: "wildix",
    name: "Wildix",
    shortDescription: "Unified Communications con Company API Key e PBX API.",
    connectionMode: "api",
    connectionNote: "HotelAccelerator verifica realmente la Company API Key. Click-to-call resta disabilitato finche il payload Call Control non viene collaudato su un PBX reale.",
    capabilities: { automaticCheck: true, clickToCall: false, inboundEvents: true, voiceAgent: false },
    fields: [
      { storage: "base_url", label: "Indirizzo Wildix", help: "Il FQDN HTTPS del PBX Wildix.", placeholder: "https://azienda.wildixin.com", required: true },
      { storage: "client_secret", label: "Company API Key", help: "Chiave wsk-v1-... creata in WMS con i permessi minimi necessari.", required: true, secret: true },
      { storage: "default_extension", label: "Interno predefinito", help: "Facoltativo; utile quando la chiave e legata a un utente PBX." },
    ],
    guide: {
      intro: "Wildix usa una Company API Key. Non serve consegnare la password dell'amministratore a HotelAccelerator.",
      steps: [
        { title: "Accedi a WMS come root admin", body: "Apri il tuo PBX Wildix con un amministratore autorizzato." },
        { title: "PBX > Integrations > Company API Keys", body: "Crea una nuova chiave e chiamala HotelAccelerator.", url: "https://docs.wildix.com/guides/2025/10/01/api-keys-auth-guide/", linkLabel: "Apri la guida ufficiale Wildix" },
        { title: "Dai solo i permessi necessari", body: "Per il test usa info:read. Per cronologia/eventi aggiungi gli scope specifici; evita *:* e pbx:* se non servono." },
        { title: "Copia la chiave", body: "La chiave inizia con wsk-v1-. Copiala subito e conservala in modo sicuro." },
        { title: "Incolla indirizzo e chiave", body: "HotelAccelerator prova GET /api/v1/pbx/version/ usando la chiave e ti dice se il PBX risponde." },
        { title: "Per gli eventi chiamata", body: "La guida Wildix spiega i webhook call:completed. Attivali solo dopo che il collegamento base e verificato." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "Wildix - Company API Keys", url: "https://docs.wildix.com/guides/2026/05/25/company-api-key-pbx-guide/" },
        { label: "Wildix - PBX API", url: "https://docs.wildix.com/api-reference/rest/wms/pbx/" },
        { label: "Wildix - Call webhooks", url: "https://docs.wildix.com/docs/calls/webhooks/" },
      ],
    },
  },
  {
    id: "nethvoice",
    name: "NethVoice",
    shortDescription: "Centralino Nethesis/NethVoice con REST API NethCTI e WebSocket eventi.",
    connectionMode: "api",
    connectionNote: "HotelAccelerator verifica realmente l'autenticazione NethCTI senza abilitare API non autenticate.",
    capabilities: { automaticCheck: true, clickToCall: false, inboundEvents: true, voiceAgent: false },
    fields: [
      { storage: "base_url", label: "Indirizzo NethVoice", help: "Il dominio HTTPS del server NethVoice/NethCTI.", placeholder: "https://centralino.example.it", required: true },
      { storage: "client_id", label: "Utente NethCTI", help: "Un utente dedicato all'integrazione, con i soli permessi necessari.", required: true },
      { storage: "client_secret", label: "Password NethCTI", help: "Password dell'utente tecnico dedicato. Viene cifrata a riposo.", required: true, secret: true },
      { storage: "default_extension", label: "Interno predefinito", help: "Facoltativo. Non abilitiamo l'API unauthe_call per motivi di sicurezza." },
    ],
    guide: {
      intro: "NethVoice espone le REST API tramite NethCTI. HotelAccelerator usa l'autenticazione documentata e non richiede di aprire chiamate anonime.",
      steps: [
        { title: "Verifica l'accesso HTTPS a NethVoice", body: "Il server deve avere un indirizzo HTTPS raggiungibile da HotelAccelerator. Non pubblicare pannelli amministrativi senza protezioni." },
        { title: "Crea/usa un utente tecnico NethCTI", body: "Assegna a quell'utente soltanto le autorizzazioni necessarie all'integrazione." },
        { title: "Inserisci server, utente e password", body: "HotelAccelerator esegue il login NethCTI e verifica il nonce Digest come previsto dalla documentazione ufficiale.", url: "https://nethvoice.docs.nethesis.it/it/v14/cti_dev.html", linkLabel: "Apri le REST API NethCTI" },
        { title: "Non attivare unauthe_call", body: "NethVoice documenta una API di chiamata non autenticata, ma e disabilitata di default per sicurezza: HotelAccelerator non ti chiede di abilitarla." },
        { title: "Eventi e CRM", body: "Per eventi live e integrazione CRM usa le REST API/WebSocket NethCTI e le funzioni di integrazione ufficiali." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "NethVoice - API NethCTI", url: "https://nethvoice.docs.nethesis.it/it/v14/cti_dev.html" },
        { label: "NethVoice - Click2Call e sicurezza", url: "https://nethvoice.docs.nethesis.it/it/v14/howto.html" },
        { label: "NethVoice - NethHotel", url: "https://nethvoice.docs.nethesis.it/it/v14/hotel.html" },
      ],
    },
  },
  {
    id: "voispeed",
    name: "VOIspeed UCloud",
    shortDescription: "Centralino TeamSystem con integrazione SERI HTTP/HTTPS, eventi e click-to-call.",
    connectionMode: "api",
    connectionNote: "Connettore reale per verifica e click-to-call tramite interfaccia SERI documentata da VOIspeed.",
    capabilities: { automaticCheck: true, clickToCall: true, inboundEvents: true, voiceAgent: false },
    fields: [
      { storage: "base_url", label: "URL integrazione SERI", help: "L'URL integrazione mostrato nei dettagli del modulo VOIspeed. Deve essere HTTPS.", placeholder: "https://.../PBX/seri_endpoint.php", required: true },
      { storage: "client_secret", label: "Token password", help: "Il token generato da VOIspeed quando abiliti i comandi.", required: true, secret: true },
      { storage: "default_extension", label: "Interno predefinito", help: "Interno da usare per il test e come fallback del click-to-call.", placeholder: "35", required: true },
    ],
    guide: {
      intro: "VOIspeed ha un modulo di integrazione generico: abiliti i comandi, copi token e URL, poi HotelAccelerator puo usare il click-to-call.",
      steps: [
        { title: "Apri Configurazione > Azienda", body: "Nella sezione Integrazione clicca Aggiungi integrazione." },
        { title: "Scegli il modulo Generico", body: "Dagli il nome HotelAccelerator, abilitalo e seleziona gli interni che vuoi usare." },
        { title: "Attiva Comandi abilitati", body: "VOIspeed genera automaticamente un token password. Copialo e non condividerlo.", url: "https://integrazione.voispeed.com/api/", linkLabel: "Apri la documentazione VOIspeed" },
        { title: "Apri Mostra dettagli", body: "Copia anche l'URL integrazione (SERI)." },
        { title: "Inserisci URL, token e interno", body: "HotelAccelerator esegue una richiesta innocua allo storico utente per verificare token e interno; poi abilita il click-to-call." },
        { title: "Configura l'URL eventi", body: "Nel modulo VOIspeed puoi indicare l'URL di notifica per ricevere gli eventi chiamata. Questa parte va collaudata sul tenant prima di abilitarla in produzione." },
      ],
      screenshots: [
        { src: "https://integrazione.voispeed.com/api/images/figura_2_2.png", alt: "Finestra ufficiale VOIspeed per aggiungere una integrazione", caption: "Schermata ufficiale VOIspeed: creazione del modulo di integrazione generico.", sourceUrl: "https://integrazione.voispeed.com/api/" },
      ],
      officialDocs: [{ label: "VOIspeed - Guida integrazione/API", url: "https://integrazione.voispeed.com/api/" }],
    },
  },
  {
    id: "yeastar",
    name: "Yeastar P-Series",
    shortDescription: "P-Series Cloud/Software/Appliance con OpenAPI, webhook e call control.",
    connectionMode: "api",
    connectionNote: "Connettore reale per token, verifica sistema e click-to-call P-Series.",
    capabilities: { automaticCheck: true, clickToCall: true, inboundEvents: true, voiceAgent: false },
    fields: [
      { storage: "base_url", label: "Indirizzo Yeastar", help: "FQDN HTTPS del PBX P-Series. HotelAccelerator usa /openapi/v1.0.", placeholder: "https://pbx.example.com", required: true },
      { storage: "client_id", label: "Client ID", help: "Lo trovi in Integrations > API sul PBX.", required: true },
      { storage: "client_secret", label: "Client Secret", help: "Lo trovi insieme al Client ID. Viene cifrato a riposo.", required: true, secret: true },
      { storage: "default_extension", label: "Interno predefinito", help: "L'interno che squilla prima della chiamata esterna.", placeholder: "1005", required: true },
    ],
    guide: {
      intro: "Su Yeastar P-Series abiliti l'API, copi Client ID e Client Secret e, se vuoi gli eventi, aggiungi un webhook firmato.",
      steps: [
        { title: "Apri Integrations > API", body: "Abilita le API del tuo P-Series e crea/leggi le credenziali dell'applicazione." },
        { title: "Copia Client ID e Client Secret", body: "Sono username/password dell'endpoint get_token.", url: "https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/get-access-token.html", linkLabel: "Apri la guida token Yeastar" },
        { title: "Inserisci il dominio HTTPS", body: "Non aggiungere /openapi/v1.0: lo aggiunge HotelAccelerator." },
        { title: "Indica l'interno", body: "E l'interno che HotelAccelerator usa come caller nel click-to-call." },
        { title: "Salva e verifica", body: "HotelAccelerator richiede un token e interroga system/information. Se entrambi riescono, la connessione e verificata." },
        { title: "Webhook eventi (facoltativo)", body: "In Integrations > API abilita Webhook Event Push, aggiungi l'URL e usa il secret HMAC. L'ingestione eventi va attivata solo dopo collaudo reale.", url: "https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/monitor-events-via-webhook.html", linkLabel: "Apri guida webhook Yeastar" },
      ],
      screenshots: [
        { src: "https://help.yeastar.com/en/p-series-cloud-edition/images/screenshoots/api/webhook-on.png", alt: "Abilitazione Webhook Event Push Yeastar", caption: "Schermata ufficiale Yeastar: abilita Webhook Event Push.", sourceUrl: "https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/monitor-events-via-webhook.html" },
        { src: "https://help.yeastar.com/en/p-series-cloud-edition/images/screenshoots/api/webhook-add1.png", alt: "Aggiunta webhook Yeastar", caption: "Schermata ufficiale Yeastar: aggiunta dell'URL webhook.", sourceUrl: "https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/monitor-events-via-webhook.html" },
      ],
      officialDocs: [
        { label: "Yeastar - Get access token", url: "https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/get-access-token.html" },
        { label: "Yeastar - Call control", url: "https://help.yeastar.com/en/p-series-cloud-edition/developer-guide/api-interfaces-and-events-summary.html" },
      ],
    },
  },
  {
    id: "teams_phone",
    name: "Microsoft Teams Phone",
    shortDescription: "Telefonia Microsoft 365 tramite Microsoft Graph e Cloud Communications.",
    connectionMode: "guided",
    connectionNote: "Guida e modello provider pronti. Il collegamento OAuth/Graph richiede un'app Entra del tenant e collaudo amministrativo prima di essere dichiarato connesso.",
    capabilities: { automaticCheck: false, clickToCall: false, inboundEvents: false, voiceAgent: false },
    fields: [],
    guide: {
      intro: "Teams Phone non usa una semplice API key: serve registrare una applicazione Microsoft Entra e concedere permessi amministrativi specifici.",
      steps: [
        { title: "Verifica che usiate Teams Phone", body: "Serve una configurazione telefonica Teams reale (Calling Plan, Operator Connect o Direct Routing)." },
        { title: "Apri Microsoft Entra admin center", body: "Un amministratore deve registrare una app dedicata a HotelAccelerator. Non riutilizzare app con privilegi non collegati alla telefonia." },
        { title: "Configura Microsoft Graph", body: "Le API Cloud Communications gestiscono chiamate/bot; Call Records gestisce i CDR. I permessi sono application permissions e richiedono admin consent.", url: "https://learn.microsoft.com/en-us/graph/cloud-communications-concept-overview", linkLabel: "Apri Cloud Communications" },
        { title: "Non inserire ancora segreti qui", body: "HotelAccelerator non raccoglie credenziali Teams finche l'OAuth specifico non e collaudato sul vostro tenant Microsoft 365." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "Microsoft Graph - Cloud Communications", url: "https://learn.microsoft.com/en-us/graph/cloud-communications-concept-overview" },
        { label: "Microsoft Graph - Call Records", url: "https://learn.microsoft.com/en-us/graph/api/resources/callrecords-api-overview?view=graph-rest-1.0" },
      ],
    },
  },
  {
    id: "webex_calling",
    name: "Cisco Webex Calling",
    shortDescription: "Telefonia cloud Cisco con Webex Calling APIs, CDR e webhook.",
    connectionMode: "guided",
    connectionNote: "Guida e modello provider pronti. OAuth Webex e Call Control restano da collaudare con una organizzazione cliente reale.",
    capabilities: { automaticCheck: false, clickToCall: false, inboundEvents: false, voiceAgent: false },
    fields: [],
    guide: {
      intro: "Webex Calling usa applicazioni OAuth/Integration Webex e scope amministrativi: non c'e una password PBX da incollare.",
      steps: [
        { title: "Accedi a Webex for Developers", body: "Usa un amministratore della vostra organizzazione Webex Calling." },
        { title: "Crea una integrazione OAuth dedicata", body: "Concedi solo gli scope Calling necessari. Per i CDR serve lo scope documentato per Detailed Call History." },
        { title: "Verifica Call History e webhook", body: "Webex espone CDR e webhook/call control attraverso le API ufficiali.", url: "https://developer.webex.com/calling/docs/api/v1/reports-detailed-call-history", linkLabel: "Apri Detailed Call History" },
        { title: "Attendi il collaudo OAuth HotelAccelerator", body: "Finche non eseguiamo il primo test con una organizzazione reale, la UI resta volutamente in stato Configurazione guidata." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "Webex - Detailed Call History", url: "https://developer.webex.com/calling/docs/api/v1/reports-detailed-call-history" },
        { label: "Webex - Call Control APIs", url: "https://developer.webex.com/blog/webex-calling-getting-started-with-call-control-apis" },
      ],
    },
  },
  {
    id: "asterisk_freepbx",
    name: "Asterisk / FreePBX",
    shortDescription: "Asterisk e distribuzioni FreePBX tramite Asterisk REST Interface (ARI).",
    connectionMode: "api",
    connectionNote: "Connettore ARI reale per verifica e originate. Richiede ARI esposto in HTTPS in modo sicuro: mai pubblicare la porta senza TLS/firewall.",
    capabilities: { automaticCheck: true, clickToCall: true, inboundEvents: false, voiceAgent: false },
    fields: [
      { storage: "base_url", label: "URL ARI", help: "Base HTTPS del server Asterisk, senza /ari finale.", placeholder: "https://pbx.example.it:8089", required: true },
      { storage: "client_id", label: "Utente ARI", help: "Utente dedicato definito in ari.conf.", required: true },
      { storage: "client_secret", label: "Password ARI", help: "Password robusta dell'utente ARI. Viene cifrata a riposo.", required: true, secret: true },
      { storage: "default_extension", label: "Interno predefinito", help: "Interno PJSIP da far squillare nel click-to-call.", placeholder: "200", required: true },
      { storage: "provider_config.context", label: "Dialplan context", help: "Context usato dopo la risposta dell'interno.", placeholder: "from-internal", defaultValue: "from-internal" },
      { storage: "provider_config.endpoint_template", label: "Endpoint template", help: "Template ARI dell'interno. {extension} viene sostituito con l'interno reale.", placeholder: "PJSIP/{extension}", defaultValue: "PJSIP/{extension}" },
    ],
    guide: {
      intro: "Asterisk/FreePBX richiede ARI. Se il PBX e in LAN, non aprire ARI su Internet senza una terminazione HTTPS, firewall e credenziali dedicate.",
      steps: [
        { title: "Abilita il server HTTP/HTTPS Asterisk", body: "In http.conf abilita il servizio. In produzione usa TLS e limita l'accesso di rete." },
        { title: "Crea un utente ARI dedicato", body: "In ari.conf abilita ARI e crea un utente con password robusta. Per click-to-call read_only deve essere no.", url: "https://docs.asterisk.org/Configuration/Interfaces/Asterisk-REST-Interface-ARI/Asterisk-Configuration-for-ARI/", linkLabel: "Apri configurazione ARI" },
        { title: "Rendi l'endpoint raggiungibile in sicurezza", body: "HotelAccelerator gira nel cloud: un indirizzo 192.168.x.x non e raggiungibile. Usa un FQDN HTTPS protetto, senza esporre altri servizi del PBX." },
        { title: "Inserisci URL, utente e password", body: "HotelAccelerator verifica GET /ari/asterisk/info con Basic Auth." },
        { title: "Controlla context e endpoint", body: "FreePBX usa normalmente PJSIP/{extension}; il context dipende dal dialplan. Il valore predefinito proposto e from-internal, ma va verificato sul vostro impianto." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "Asterisk - Getting Started with ARI", url: "https://docs.asterisk.org/Configuration/Interfaces/Asterisk-REST-Interface-ARI/Getting-Started-with-ARI/" },
        { label: "Asterisk - ARI configuration", url: "https://docs.asterisk.org/Configuration/Interfaces/Asterisk-REST-Interface-ARI/Asterisk-Configuration-for-ARI/" },
      ],
    },
  },
  {
    id: "avaya_ip_office",
    name: "Avaya IP Office",
    shortDescription: "PBX Avaya con DevLink3 / TSPI; richiede normalmente un bridge applicativo persistente.",
    connectionMode: "bridge",
    connectionNote: "Guida pronta. Il protocollo DevLink/TSPI richiede un bridge persistente: non viene simulato con una falsa connessione HTTP serverless.",
    capabilities: { automaticCheck: false, clickToCall: false, inboundEvents: false, voiceAgent: false },
    fields: [],
    guide: {
      intro: "Avaya IP Office non si collega come una semplice REST API cloud: per DevLink3 serve un servizio/bridge persistente vicino al PBX.",
      steps: [
        { title: "Apri IP Office Manager", body: "Vai in File > Advanced > Security Settings." },
        { title: "Crea un Rights Group dedicato", body: "Nel tab Telephony APIs abilita solo DevLink3/diritti necessari.", url: "https://documentation.avaya.com/en-us/home/bundle/ip-office/IPOfficeDevLink/Overview/Configuring_the_IP_Office.html", linkLabel: "Apri guida DevLink ufficiale" },
        { title: "Crea un Service User", body: "Assegna il nuovo utente al Rights Group e usa una password dedicata." },
        { title: "Prevedi il bridge HotelAccelerator", body: "Il bridge deve stare su una macchina che raggiunge IP Office e mantenere la connessione. La Vercel Function del Core non finge di essere quel servizio persistente." },
      ],
      screenshots: [],
      officialDocs: [
        { label: "Avaya - Configuring IP Office for DevLink", url: "https://documentation.avaya.com/en-us/home/bundle/ip-office/IPOfficeDevLink/Overview/Configuring_the_IP_Office.html" },
        { label: "Avaya - Telephony API rights", url: "https://documentation.avaya.com/it-it/home/bundle/ip-office/IPOfficeManager_12_3/security-configuration/Html_The_Security_Interface/Rights_Groups/Enhanced_TSPI.html" },
      ],
    },
  },
] as const

export function isTelephonyProviderId(value: unknown): value is TelephonyProviderId {
  return typeof value === "string" && (TELEPHONY_PROVIDER_IDS as readonly string[]).includes(value)
}

export function getTelephonyProvider(id: string | null | undefined): TelephonyProviderDefinition | null {
  if (!id) return null
  return TELEPHONY_PROVIDERS.find((provider) => provider.id === id) ?? null
}

export function providerConfigKeys(provider: TelephonyProviderDefinition): string[] {
  return provider.fields
    .map((field) => field.storage)
    .filter((storage): storage is `provider_config.${string}` => storage.startsWith("provider_config."))
    .map((storage) => storage.slice("provider_config.".length))
}
