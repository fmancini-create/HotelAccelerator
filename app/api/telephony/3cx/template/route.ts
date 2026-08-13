import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { loadTelephonyRow, inboundSecretOf } from "@/lib/telephony/config"

/**
 * Genera il file di template CRM da caricare in 3CX.
 *
 * PERCHE' ESISTE: la rotta `inbound-urls` consegnava due indirizzi "da
 * incollare nel template CRM", ma nella console di 3CX NON c'e' alcun campo in
 * cui incollare un URL. La pagina Integrazioni -> CRM offre solo: scelta della
 * soluzione, "Aggiungi template" (che carica un file XML), e i parametri
 * dichiarati DENTRO quel file. Gli indirizzi vivono nell'XML: senza il file,
 * quei due URL non erano utilizzabili in nessun punto della console.
 *
 * PERCHE' CONVIENE: questa strada NON richiede il ruolo Proprietario del
 * sistema ne' l'applicazione API (Call Control). Riconoscimento del chiamante e
 * registro chiamate funzionano con il solo template, che un Amministratore puo'
 * caricare. Resta al Call Control la sola chiamata in uscita dal CRM.
 *
 * Struttura ricalcata sul template Scidoo gia' funzionante su questo
 * centralino: stessi attributi, stesso schema di autenticazione Basic, stessi
 * percorsi `contact.*`. Non e' inventata.
 */

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const row = await loadTelephonyRow(propertyId)
    const secret = inboundSecretOf(row)

    if (!row || !secret) {
      return NextResponse.json(
        { error: "Salvate prima la configurazione del centralino: serve il segreto per gli endpoint." },
        { status: 404 },
      )
    }

    // Host della richiesta, non NEXT_PUBLIC_APP_URL: su un dominio con redirect
    // verso www un indirizzo salvato sull'host sbagliato porterebbe 3CX a
    // seguire un 307, che il centralino non gestisce, e le chiamate non
    // arriverebbero mai. Stessa insidia gia' vista con il webhook di Telegram.
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
    const proto = request.headers.get("x-forwarded-proto") || "https"
    const base = forwardedHost ? `${proto}://${forwardedHost}` : process.env.NEXT_PUBLIC_APP_URL || ""
    const root = base.replace(/\/+$/, "")

    // Il segreto NON viene scritto nel file: viaggia come utente dell'intestazione
    // Basic, presa dal campo "API Key" che l'operatore compila nella console. Il
    // file resta quindi condivisibile (per esempio con il partner del centralino)
    // senza consegnare le credenziali.
    const lookupUrl = `${root}/api/telephony/3cx/lookup?property=${encodeURIComponent(propertyId)}&number=[Number]`
    const journalUrl = `${root}/api/telephony/3cx/journal?property=${encodeURIComponent(propertyId)}`

    const contactVariables = [
      ["ContactID", "contact.id"],
      ["FirstName", "contact.firstname"],
      ["LastName", "contact.lastname"],
      ["CompanyName", "contact.company"],
      ["Email", "contact.email"],
      ["PhoneBusiness", "contact.businessphone"],
      ["PhoneMobile", "contact.mobilephone"],
    ]
      .map(
        ([name, path]) =>
          `        <Variable Name="${name}" LookupValue="" Path="${path}" Skip="0" IsArray="false"><Filter /></Variable>`,
      )
      .join("\n")

    const contactOutputs = [
      ["ContactID", "[ContactID]"],
      ["FirstName", "[FirstName]"],
      ["LastName", "[LastName]"],
      ["CompanyName", "[CompanyName]"],
      ["Email", "[Email]"],
      ["PhoneBusiness", "[PhoneBusiness]"],
      ["PhoneMobile", "[PhoneMobile]"],
      ["ContactUrl", "[ContactUrl]"],
      ["EntityId", "[ContactID]"],
      ["EntityType", "Contacts"],
    ]
      .map(([type, value]) => `        <Output Type="${type}" Passes="0" Value="${xmlEscape(value)}" />`)
      .join("\n")

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Crm xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Country="IT" Name="HotelAccelerator" Version="1" SupportsEmojis="true" SupportsTranscription="false" ListPageSize="0">
  <Number Prefix="AsIs" MaxLength="" />
  <Connection MaxConcurrentRequests="16" />
  <Parameters>
    <Parameter Name="APIkey" Type="String" Parent="General Configuration" Editor="String" Title="Chiave di collegamento HotelAccelerator:" Default="" ListValues="" RequestUrl="" RequestUrlParameters="" ResponseScenario="" />
    <Parameter Name="ReportCallEnabled" Type="Boolean" Parent="" Editor="String" Title="Registra le chiamate nel CRM" Default="True" ListValues="" RequestUrl="" RequestUrlParameters="" ResponseScenario="" />
  </Parameters>
  <Authentication Type="Basic" DefaultExpiration="3600" StoreAllValues="true">
    <Value>[APIkey]:X</Value>
  </Authentication>
  <Scenarios>
    <Scenario Id="" Type="REST" EntityId="" EntityOrder="">
      <Request SkipIf="" Url="${xmlEscape(lookupUrl)}" MessagePasses="0" Message="" RequestContentType="" RequestEncoding="UrlEncoded" RequestType="Get" ResponseType="Json">
        <QueryParams />
        <Values />
      </Request>
      <Rules>
        <Rule Type="Any" Ethalon="">contact.id</Rule>
      </Rules>
      <Variables>
${contactVariables}
        <Variable Name="ContactUrl" LookupValue="" Path="contact.url" Skip="0" IsArray="false"><Filter /></Variable>
      </Variables>
      <Outputs AllowEmpty="false">
${contactOutputs}
      </Outputs>
    </Scenario>
    <Scenario Id="ReportCall" Type="REST" EntityId="" EntityOrder="">
      <Request SkipIf="" Url="${xmlEscape(journalUrl)}" MessagePasses="0" Message="" RequestContentType="application/json" RequestEncoding="Json" RequestType="Post" ResponseType="Json">
        <PostValues Key="" If="" SkipIf="">
          <Value Key="number" If="" SkipIf="" Passes="1" Type="String">[Number]</Value>
          <Value Key="call_type" If="" SkipIf="" Passes="1" Type="String">[CallType]</Value>
          <Value Key="direction" If="" SkipIf="" Passes="1" Type="String">[CallDirection]</Value>
          <Value Key="name" If="" SkipIf="" Passes="1" Type="String">[Name]</Value>
          <Value Key="entity_id" If="" SkipIf="" Passes="1" Type="String">[EntityId]</Value>
          <Value Key="agent" If="" SkipIf="" Passes="1" Type="String">[Agent]</Value>
          <Value Key="agent_email" If="" SkipIf="" Passes="1" Type="String">[AgentEmail]</Value>
          <Value Key="duration" If="" SkipIf="" Passes="1" Type="String">[Duration]</Value>
          <Value Key="started_at" If="" SkipIf="" Passes="2" Type="String">[[CallStartTimeUTC].ToString("yyyy-MM-ddTHH:mm:ssZ")]</Value>
          <Value Key="answered_at" If="" SkipIf="" Passes="2" Type="String">[[CallEstablishedTimeUTC].ToString("yyyy-MM-ddTHH:mm:ssZ")]</Value>
          <Value Key="ended_at" If="" SkipIf="" Passes="2" Type="String">[[CallEndTimeUTC].ToString("yyyy-MM-ddTHH:mm:ssZ")]</Value>
        </PostValues>
        <QueryParams />
        <Values />
      </Request>
      <Variables />
      <Outputs AllowEmpty="false" />
    </Scenario>
  </Scenarios>
</Crm>
`

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="HotelAccelerator.pv.xml"',
        // Il file contiene gli indirizzi degli endpoint: non deve restare nelle
        // cache intermedie.
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
