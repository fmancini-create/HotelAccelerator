import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"

/**
 * llms.txt - File per AI crawlers (ChatGPT, Claude, Perplexity, Google AI)
 * Specifica: https://llmstxt.org/
 *
 * Questo file aiuta gli LLM a comprendere il sito e fornire risposte accurate
 */
export async function GET() {
  const headersList = await headers()
  const host = headersList.get("host") || "hotelaccelerator.com"
  const protocol = headersList.get("x-forwarded-proto") || "https"
  const baseUrl = `${protocol}://${host}`

  const isPlatform = await isPlatformDomain()

  if (isPlatform) {
    // llms.txt per la piattaforma HotelAccelerator
    const content = `# HotelAccelerator

> La piattaforma SaaS all-in-one per hotel e strutture ricettive

HotelAccelerator è un software gestionale completo per hotel che include CMS, CRM, Email Marketing, Inbox Omnicanale e AI Assistant. Aiuta gli hotel ad aumentare le prenotazioni dirette fino al 35%.

## Funzionalità Principali

- **CMS**: Creazione siti web ottimizzati per hotel con prenotazioni dirette
- **CRM**: Gestione clienti e segmentazione avanzata
- **Email Marketing**: Campagne automatizzate e personalizzate
- **Inbox Omnicanale**: Gestione unificata di Email, WhatsApp, Telegram, Chat
- **Analytics**: Dashboard con metriche e KPI in tempo reale
- **AI Assistant**: Chatbot intelligente 24/7 multilingua

## Link Utili

- Home: ${baseUrl}/
- CMS Hotel: ${baseUrl}/features/cms
- CRM Hotel: ${baseUrl}/features/crm
- Email Marketing: ${baseUrl}/features/email-marketing
- Inbox Omnicanale: ${baseUrl}/features/inbox-omnicanale
- Analytics: ${baseUrl}/features/analytics
- AI Assistant: ${baseUrl}/features/ai-assistant
- Richiedi Demo: ${baseUrl}/request-access

## Contatti

- Website: ${baseUrl}
- Email: info@hotelaccelerator.com

## Informazioni Tecniche

- Tecnologia: Next.js, React, TypeScript, Supabase
- Tipo: SaaS Multi-tenant
- Target: Hotel, B&B, Resort, Agriturismi
- Lingue: Italiano, Inglese, Tedesco, Francese, Spagnolo
`
    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    })
  }

  // llms.txt per tenant (es. Villa I Barronci)
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return new NextResponse("# Site not found", { status: 404 })
  }

  const content = `# ${tenant.name || "Hotel"}

> ${tenant.seo_description || `Benvenuti a ${tenant.name}`}

## Informazioni Struttura

${tenant.name} è un hotel/resort situato in Italia. Offriamo camere eleganti, ristorante, spa e servizi di alta qualità per una vacanza indimenticabile.

## Servizi Principali

- **Camere**: Diverse tipologie di camere e suite
- **Ristorante**: Cucina toscana e mediterranea
- **Spa & Wellness**: Area relax, massaggi, trattamenti
- **Piscina**: Piscina panoramica con jacuzzi
- **Esperienze**: Tour enogastronomici, degustazioni

## Posizione

- Regione: Toscana, Italia
- Zona: Chianti, vicino a Firenze e Siena
- Ideale per: Coppie, famiglie, viaggi enogastronomici

## Lingue Disponibili

- Italiano: ${baseUrl}/
- English: ${baseUrl}/en
- Deutsch: ${baseUrl}/de
- Français: ${baseUrl}/fr

## Pagine Principali

- Home: ${baseUrl}/
- Camere: ${baseUrl}/camere
- Ristorante: ${baseUrl}/ristorante
- Spa: ${baseUrl}/spa
- Servizi: ${baseUrl}/servizi
- Dove Siamo: ${baseUrl}/dove-siamo
- Contatti: ${baseUrl}/richiesta-informazioni
- Offerte: ${baseUrl}/offerte-speciali

## Prenotazioni

Per prenotare direttamente:
- Visita: ${baseUrl}
- Telefono: +39 055 820598
- Email: info@ibarronci.com

## Social

- Instagram: @villaibarronci
- Facebook: /villaibarronci
`

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  })
}
