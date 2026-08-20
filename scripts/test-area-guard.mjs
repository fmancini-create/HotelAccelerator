#!/usr/bin/env node
/**
 * Prove della mappa rotta -> area.
 *
 * Servono i casi VERDI quanto quelli ROSSI: senza i verdi non si distingue un
 * presidio che funziona da uno che blocca tutto. Un presidio sempre-rosso
 * supera qualunque prova fatta solo di casi da bloccare.
 */

import { resolveApiArea, isPublicApiPath, isSuperAdminApiPath } from "../lib/auth/api-area-map.ts"

const casi = [
  // --- Deve risolvere un'area concedibile (il controllo cambia qualcosa) ---
  ["/api/admin/crm/contacts", "crm", "CRM: contatti degli ospiti"],
  ["/api/admin/crm/contacts/abc-123/stays", "crm", "CRM: sottorotta profonda"],
  ["/api/admin/todos", "todos", "Todos"],
  ["/api/admin/photos", "photos", "Foto"],
  ["/api/admin/upload-photos", "photos", "Foto: caricamento"],
  ["/api/admin/marketing/campaigns", "marketing", "Marketing"],
  ["/api/cms/pages", "cms", "CMS: pagine"],
  ["/api/admin/tracking/sites", "tracking", "Tracking"],
  ["/api/admin/embed-scripts", "embed-scripts", "Embed scripts"],

  // --- Aree di base: risolvono, ma sono concesse a tutti ---
  ["/api/inbox/conversations", "inbox", "Inbox (di base)"],
  ["/api/platform/me", "profile", "Profilo (di base)"],

  // --- Pubbliche: NON devono risolvere alcuna area (romperebbe il servizio) ---
  ["/api/chat/widget", null, "Widget pubblico"],
  ["/api/track", null, "Tracciamento anonimo"],
  ["/api/stripe/webhook", null, "Webhook Stripe"],
  ["/api/channels/email/webhook/gmail", null, "Webhook Gmail"],
  ["/api/cron/poll-email-inbox", null, "Lavoro pianificato"],
  ["/api/external/manubot", null, "API esterna a token"],
  ["/api/cms/pages/by-slug", null, "Lettura pubblica per slug"],
  ["/api/channels/email/oauth/callback", null, "Callback OAuth"],
  ["/api/telephony/3cx/voice/v1/query", null, "Assistente vocale 3CX a token"],

  // --- Super admin: fuori dal controllo di area ---
  ["/api/super-admin/structures", null, "Super admin"],
]

let passati = 0
let falliti = 0

console.log("PROVE mappa rotta -> area\n")

for (const [percorso, atteso, descrizione] of casi) {
  const ottenuto = resolveApiArea(percorso)
  const ok = ottenuto === atteso
  if (ok) passati++
  else falliti++
  console.log(
    `  ${ok ? "OK  " : "ROTTO"} ${descrizione.padEnd(30)} ${percorso}\n` +
      (ok ? "" : `        atteso "${atteso}", ottenuto "${ottenuto}"\n`),
  )
}

// Controllo di coerenza: "by-slug" e' dentro "/api/cms" (mappata a cms) ma deve
// vincere come pubblica. Se questa regola si rompe, il sito pubblico smette di
// rendere le pagine.
const bySlugPubblica = isPublicApiPath("/api/cms/pages/by-slug")
const cmsNonPubblica = !isPublicApiPath("/api/cms/pages")
console.log(`  ${bySlugPubblica ? "OK  " : "ROTTO"} by-slug ha la precedenza sul gruppo cms`)
console.log(`  ${cmsNonPubblica ? "OK  " : "ROTTO"} /api/cms/pages NON e' pubblica`)
if (!bySlugPubblica || !cmsNonPubblica) falliti++
else passati++

const superOk = isSuperAdminApiPath("/api/super-admin/dashboard") && !isSuperAdminApiPath("/api/admin/users")
console.log(`  ${superOk ? "OK  " : "ROTTO"} super-admin riconosciuto senza catturare /api/admin`)
if (superOk) passati++
else falliti++

console.log(`\nPassati: ${passati}  Falliti: ${falliti}`)
process.exit(falliti > 0 ? 1 : 0)
