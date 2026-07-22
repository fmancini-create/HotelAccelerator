import { streamText } from "ai"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { getPageContext } from "@/lib/page-guides"

/**
 * FIX 02/05/2026: prima questa route faceva solo `streamText` e ritornava lo
 * stream — nessuna conversazione veniva persistita. Risultato: il SuperAdmin
 * tab "Comunicazioni > Chat Guida" mostrava sempre 0 lead/conversazioni anche
 * con utenti loggati che usavano la guida quotidianamente.
 *
 * Ora ogni messaggio fa upsert su `page_guide_conversations`:
 *  - prima di iniziare lo stream creiamo/aggiorniamo la riga (per avere id stabile)
 *  - alla fine dello stream salviamo la risposta dell'AI nei messages JSONB
 *  - flag `has_unread_for_admin=true` accende il pallino rosso nel menu superadmin
 *  - per autenticati riempiamo user_id + hotel_id, per anonimi lasciamo null
 *  - se l'utente lascia nome+email (lead capture), li scriviamo su visitor_name/email
 *
 * Mantenuto il vecchio comportamento [UNCERTAIN] -> `page_guide_questions`
 * e la scrittura legacy su `guide_leads` per compat con la UI esistente.
 */

// Service-role client (bypassa RLS — la chat guida deve scrivere anche per anon).
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const {
    pathname,
    messages,
    leadName,
    leadEmail,
    conversationId: incomingConversationId,
  } = body as {
    pathname?: string
    messages?: Array<{ role: string; content: string }>
    leadName?: string
    leadEmail?: string
    conversationId?: string
  }

  // Auth is optional - visitors on public pages can use the guide too
  let userId: string | null = null
  let hotelId: string | null = null
  let userFirstName = ""
  let hotelContext = ""
  let knowledgeContext = ""

  try {
    const { user, supabase } = await getAuthUserOrDev()

    if (user) {
      userId = user.id

      // Load platform knowledge for authenticated users
      try {
        const { data: knowledge } = await supabase
          .from("platform_knowledge")
          .select("title, content, category")
          .eq("is_active", true)
          .limit(20)

        if (knowledge && knowledge.length > 0) {
          knowledgeContext =
            "\n\nConoscenza della piattaforma:\n" +
            knowledge.map((k) => `[${k.category}] ${k.title}: ${k.content}`).join("\n")
        }
      } catch {}

      // Get user's hotel context
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, organization_id, role")
          .eq("id", user.id)
          .single()

        if (profile?.first_name) {
          userFirstName = profile.first_name
        }
        if (profile?.organization_id) {
          const { data: hotels } = await supabase
            .from("hotels")
            .select("id, name")
            .eq("organization_id", profile.organization_id)
            .limit(1)

          if (hotels?.[0]) {
            hotelId = hotels[0].id
            hotelContext = `\nL'utente gestisce la struttura "${hotels[0].name}".`
          }
        }
      } catch {}
    }
  } catch {}

  // Get page context
  const pageContext = getPageContext(pathname || "/home")

  const userInfo = userId && userFirstName
    ? `\nL'utente autenticato si chiama ${userFirstName}. Chiamalo per nome in modo amichevole.`
    : !userId && leadName
      ? `\nIl visitatore si chiama ${leadName} (${leadEmail}). Chiamalo per nome.`
      : ""

  const systemPrompt = `Sei l'assistente della piattaforma SANTADDEO, una piattaforma italiana di revenue management per strutture ricettive.

CONTESTO PAGINA CORRENTE:
${pageContext}
${hotelContext}
${userInfo}
${knowledgeContext}

REGOLE IMPORTANTI:
1. Rispondi SEMPRE in italiano.
2. Sii preciso, conciso e utile. Usa un tono professionale ma amichevole.
3. Puoi rispondere a domande su:
   - La piattaforma SANTADDEO e le sue funzionalita'
   - Revenue management alberghiero (KPI, strategie di pricing, benchmark, etc.)
   - La pagina corrente e come usarla
4. Se la domanda riguarda funzionalita' specifiche della pagina, spiega nel dettaglio come usarle.
5. Se NON sei sicuro al 100% della risposta, o se la domanda riguarda prezzi, contratti, problemi tecnici specifici, o qualcosa che richiede intervento umano, rispondi includendo ESATTAMENTE questa riga alla fine:
   [UNCERTAIN]
   In quel caso, prima della riga [UNCERTAIN], dai comunque la migliore risposta possibile spiegando che il team verifichera'.
6. REGOLA CRITICA: NON inventare MAI funzionalita' che non sono elencate nel CONTESTO PAGINA CORRENTE.
   - Rispondi ESCLUSIVAMENTE basandoti sulle funzionalita' elencate sopra.
   - Se una funzionalita' non e' nella lista, NON dire che esiste.
   - Se non sai come fare qualcosa, di' "Questa funzionalita' non e' attualmente disponibile in questa pagina" e aggiungi [UNCERTAIN].
   - MAI inventare bottoni, menu, scorciatoie da tastiera o procedure che non sono nella lista.
7. Se ti chiedono come fare qualcosa nella pagina, guida l'utente passo per passo SOLO usando le funzionalita' elencate.
8. Se il visitatore non e' autenticato e chiede informazioni specifiche sull'uso della piattaforma, invitalo a registrarsi o fare login.`

  // Build messages for AI
  const aiMessages = (messages || []).map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }))

  // ─── Persist conversation: pre-create or fetch existing row ────────────────
  // Cosi' otteniamo l'id da restituire al client, e a fine stream lo aggiorniamo
  // con la risposta dell'AI completa.
  const service = getServiceClient()
  const currentPath = pathname || "/"
  let conversationId = incomingConversationId || null

  try {
    if (conversationId) {
      // Conversazione esistente: aggiorniamo solo i campi mutabili (lead capture
      // tardivo, ultima pagina, contatori). Service-role bypassa RLS.
      await service
        .from("page_guide_conversations")
        .update({
          page_path: currentPath,
          ...(leadName ? { visitor_name: leadName } : {}),
          ...(leadEmail ? { visitor_email: leadEmail } : {}),
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
    } else {
      const { data: inserted } = await service
        .from("page_guide_conversations")
        .insert({
          user_id: userId,
          hotel_id: hotelId,
          visitor_name: leadName || null,
          visitor_email: leadEmail || null,
          page_path: currentPath,
          messages: aiMessages, // include il primo messaggio utente
          is_authenticated: !!userId,
          has_unread_for_admin: true,
          message_count: aiMessages.length,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single()
      if (inserted?.id) conversationId = inserted.id
    }
  } catch (err) {
    // Non bloccare la chat se il DB ha un hiccup. Logghiamo e continuiamo:
    // l'utente avra' comunque la risposta, semplicemente non viene tracciata.
    console.error("[page-guide] persist insert failed:", err)
  }

  const result = streamText({
    model: "openai/gpt-4o-mini",
    system: systemPrompt,
    messages: aiMessages,
    onFinish: async ({ text }) => {
      // Salva la risposta AI nella conversazione + gestisce [UNCERTAIN] + lead.
      try {
        const fullMessages = [...aiMessages, { role: "assistant", content: text }]

        if (conversationId) {
          await service
            .from("page_guide_conversations")
            .update({
              messages: fullMessages,
              message_count: fullMessages.length,
              has_unread_for_admin: true,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conversationId)
        }

        // Pattern legacy [UNCERTAIN]: scriviamo anche su page_guide_questions
        // per la dashboard "Domande Incerte" esistente.
        if (text.includes("[UNCERTAIN]")) {
          const lastUserMsg =
            [...aiMessages].reverse().find((m) => m.role === "user")?.content || ""
          if (lastUserMsg.trim()) {
            await service.from("page_guide_questions").insert({
              question: lastUserMsg.trim(),
              page_path: currentPath,
              user_id: userId,
            })
          }
        }

        // Lead capture legacy: se ci sono nome+email + utente non autenticato,
        // upsert su `guide_leads` (UI superadmin esistente continua a funzionare).
        if (!userId && leadName && leadEmail) {
          await service.from("guide_leads").upsert(
            {
              email: leadEmail,
              name: leadName,
              page_path: currentPath,
              conversation: fullMessages,
            },
            { onConflict: "email" },
          )
        }
      } catch (err) {
        console.error("[page-guide] persist onFinish failed:", err)
      }
    },
  })

  // Restituiamo lo stream UI standard di AI SDK 6, esponendo l'id della
  // conversazione tramite header per consentire al client di tracciarla
  // sulle prossime chiamate (idempotenza messaggio + visualizzazione history).
  const response = result.toUIMessageStreamResponse()
  if (conversationId) {
    response.headers.set("x-conversation-id", conversationId)
    response.headers.set("Access-Control-Expose-Headers", "x-conversation-id")
  }
  return response
}
