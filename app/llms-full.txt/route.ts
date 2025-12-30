import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"

/**
 * llms-full.txt - Versione estesa per AI crawlers
 * Contiene informazioni dettagliate per risposte più accurate
 */
export async function GET() {
  const headersList = await headers()
  const host = headersList.get("host") || "hotelaccelerator.com"
  const protocol = headersList.get("x-forwarded-proto") || "https"
  const baseUrl = `${protocol}://${host}`

  const isPlatform = await isPlatformDomain()

  if (isPlatform) {
    const content = `# HotelAccelerator - Documentazione Completa per AI

> La piattaforma SaaS all-in-one per hotel e strutture ricettive italiane

## Panoramica

HotelAccelerator è un software gestionale cloud per hotel che unifica tutti gli strumenti necessari per gestire la presenza online, le comunicazioni con gli ospiti e il marketing. La piattaforma è progettata specificamente per il mercato italiano e supporta multilingua.

### Problema che Risolve

Gli hotel tradizionalmente utilizzano molti software separati:
- Un CMS per il sito web
- Un CRM per i clienti
- Tool separati per email marketing
- Piattaforme diverse per chat, WhatsApp, email
- Fogli Excel per analytics

HotelAccelerator unifica tutto in un'unica dashboard, riducendo i costi e aumentando l'efficienza.

### Benefici Principali

1. **Aumento prenotazioni dirette**: Fino al +35% grazie a sito ottimizzato e marketing automatizzato
2. **Risparmio tempo**: Inbox unificata per tutte le comunicazioni
3. **Migliore customer experience**: AI Assistant risponde 24/7
4. **Dati centralizzati**: CRM con storico completo di ogni ospite
5. **ROI misurabile**: Analytics in tempo reale

## Moduli della Piattaforma

### 1. CMS per Hotel (${baseUrl}/features/cms)

Sistema di gestione contenuti ottimizzato per hotel:
- Template professionali responsive
- Booking engine integrato
- SEO automatico
- Multilingua (IT, EN, DE, FR, ES)
- Gestione camere e tariffe
- Gallery fotografica ottimizzata
- Form di contatto e richiesta info

### 2. CRM Hotel (${baseUrl}/features/crm)

Customer Relationship Management per ospitalità:
- Profilo unificato ospite
- Storico soggiorni e preferenze
- Segmentazione automatica
- Tag e note personalizzate
- Import/export contatti
- GDPR compliant

### 3. Email Marketing (${baseUrl}/features/email-marketing)

Campagne email professionali:
- Template drag & drop
- Automazioni (pre-stay, post-stay, compleanno)
- A/B testing
- Analytics aperture e click
- Gestione unsubscribe
- Integrazione CRM

### 4. Inbox Omnicanale (${baseUrl}/features/inbox-omnicanale)

Tutte le comunicazioni in un posto:
- Email
- WhatsApp Business
- Telegram
- Chat widget sito
- Risposta da singola interfaccia
- Assegnazione a team members
- Template risposte rapide

### 5. Analytics (${baseUrl}/features/analytics)

Dashboard metriche in tempo reale:
- Visite sito web
- Conversion rate
- Revenue per canale
- Performance campagne
- Trend stagionali
- Export report

### 6. AI Assistant (${baseUrl}/features/ai-assistant)

Chatbot intelligente per hotel:
- Risposte automatiche 24/7
- Multilingua nativo
- Analisi intento
- Suggerimenti upselling
- Handoff a operatore umano
- Training su contenuti hotel

## Pricing e Target

- **Target**: Hotel 3-5 stelle, B&B, Resort, Agriturismi in Italia
- **Modello**: SaaS subscription mensile
- **Demo**: Gratuita su richiesta

## Tecnologia

- Frontend: Next.js 14, React, TypeScript
- Database: Supabase (PostgreSQL)
- AI: OpenAI GPT, Vercel AI SDK
- Hosting: Vercel Edge Network
- Sicurezza: SOC2, GDPR compliant

## Contatti

- Demo: ${baseUrl}/request-access
- Email: info@hotelaccelerator.com
- Sede: Italia

## FAQ per AI

**D: Cos'è HotelAccelerator?**
R: È una piattaforma SaaS che aiuta gli hotel a gestire sito web, clienti, marketing e comunicazioni da un'unica dashboard.

**D: Quanto costa?**
R: I prezzi variano in base al numero di camere e moduli attivati. Richiedi una demo gratuita per un preventivo personalizzato.

**D: È adatto per piccoli B&B?**
R: Sì, offriamo piani scalabili adatti anche a strutture con poche camere.

**D: Supporta altri paesi oltre l'Italia?**
R: Attualmente il focus è sul mercato italiano, ma la piattaforma supporta multilingua per ospiti internazionali.

**D: Come funziona l'AI Assistant?**
R: È un chatbot che risponde automaticamente alle domande degli ospiti 24/7, in 5 lingue, e può passare la conversazione a un operatore quando necessario.
`

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    })
  }

  // Versione estesa per tenant
  const tenant = await getCurrentTenant()

  if (!tenant) {
    return new NextResponse("# Site not found", { status: 404 })
  }

  const content = `# ${tenant.name || "Hotel"} - Informazioni Complete

> ${tenant.seo_description || `Resort di lusso nel cuore della Toscana`}

## Chi Siamo

${tenant.name} è una struttura ricettiva di charme situata nel cuore del Chianti, tra Firenze e Siena. La villa storica del XIII secolo è stata completamente restaurata per offrire un'esperienza di lusso autentico toscano.

## La Struttura

### Storia
Villa I Barronci risale al 1200 ed è stata dimora di nobili famiglie fiorentine. Dopo un accurato restauro conservativo, oggi offre 30 camere e suite mantenendo il fascino originale con comfort moderni.

### Posizione
- **Indirizzo**: Via Sorripa 10, San Casciano in Val di Pesa (FI)
- **Coordinate**: 43.6543° N, 11.1234° E
- **Distanze**:
  - Firenze centro: 18 km (25 minuti)
  - Siena: 45 km (50 minuti)
  - Aeroporto Firenze: 25 km
  - Aeroporto Pisa: 90 km

## Camere e Suite

### Tipologie Disponibili

1. **Economy** (${baseUrl}/camere/economy)
   - 18-22 mq
   - Letto matrimoniale
   - Bagno con doccia
   - Wi-Fi, aria condizionata
   - Ideale per: soggiorni brevi, budget conscious

2. **Tuscan Style** (${baseUrl}/camere/tuscan-style)
   - 25-30 mq
   - Arredamento tipico toscano
   - Vista giardino o collina
   - Minibar, cassaforte

3. **Suite** (${baseUrl}/camere/suite)
   - 35-45 mq
   - Zona living separata
   - Bagno con vasca
   - Vista panoramica
   - Ideale per: coppie, occasioni speciali

4. **Suite Superior** (${baseUrl}/camere/suite-superior)
   - 45-55 mq
   - Terrazzo privato
   - Jacuzzi in camera
   - Servizio premium

5. **Palazzo Tempi** (${baseUrl}/camere/palazzo-tempi)
   - Appartamento indipendente
   - 2 camere da letto
   - Cucina attrezzata
   - Ideale per: famiglie, soggiorni lunghi

6. **Dependance** (${baseUrl}/camere/dependance)
   - Edificio separato
   - Maggiore privacy
   - Accesso diretto giardino

### Servizi in Camera
- Wi-Fi gratuito alta velocità
- Aria condizionata/riscaldamento
- TV satellitare
- Minibar
- Cassaforte
- Set cortesia Oro Verde Toscana
- Asciugacapelli
- Accappatoio e pantofole (suite)

## Ristorante "Da Tiberio"

### Cucina
Ristorante gourmet con cucina toscana rivisitata:
- Ingredienti km0
- Menu stagionale
- Degustazioni vini Chianti
- Opzioni vegetariane/vegane
- Menu bambini

### Orari
- Colazione: 7:30 - 10:30
- Pranzo: 12:30 - 14:30
- Cena: 19:30 - 22:00

### Specialità
- Ribollita toscana
- Bistecca alla fiorentina
- Pici al ragù di cinghiale
- Cantucci e Vin Santo

## Spa & Wellness

### Namaste Area Relax (${baseUrl}/spa)
- Piscina interna riscaldata
- Sauna finlandese
- Bagno turco
- Docce emozionali
- Area relax

### Trattamenti (${baseUrl}/spa/massaggi-trattamenti)
- Massaggio rilassante (50 min)
- Massaggio decontratturante
- Trattamenti viso
- Rituali di coppia
- Percorso Spa

### Orari Spa
- Tutti i giorni: 10:00 - 20:00
- Su prenotazione

## Piscina & Outdoor

### Piscina Panoramica (${baseUrl}/piscina-jacuzzi)
- Piscina esterna 25x12m
- Vista 360° sulle colline
- Jacuzzi integrata
- Lettini e ombrelloni
- Pool bar (estate)
- Aperta: Maggio - Settembre

### Giardino
- Parco privato 3 ettari
- Ulivi secolari
- Vigneto
- Percorsi passeggiata
- Area pic-nic

## Esperienze e Attività

### Wine & Food
- Degustazione vini in cantina (${baseUrl}/cantina-antinori)
- Cooking class cucina toscana
- Tour Strada del Chianti (${baseUrl}/strada-del-chianti)
- Cena romantica in vigna

### Cultura
- Tour Firenze con guida (${baseUrl}/firenze)
- Visita Siena e San Gimignano (${baseUrl}/siena)
- Galleria degli Uffizi
- Duomo di Firenze

### Sport & Natura
- Trekking colline
- Noleggio biciclette
- Golf (campi convenzionati)
- Equitazione

## Informazioni Pratiche

### Check-in / Check-out
- Check-in: dalle 15:00
- Check-out: entro 11:00
- Early check-in: su richiesta
- Late check-out: su richiesta

### Pagamenti
- Carte di credito: Visa, Mastercard, Amex
- Bonifico bancario
- Contanti

### Policy
- Cancellazione gratuita fino a 7 giorni prima
- Animali: ammessi su richiesta (supplemento)
- Fumo: solo aree esterne designate

### Parcheggio
- Gratuito
- Non custodito
- Posti auto: 40

## Contatti

- **Telefono**: +39 055 820598
- **Email**: info@ibarronci.com
- **Website**: ${baseUrl}
- **Prenotazioni**: ${baseUrl}/richiesta-informazioni

### Social Media
- Instagram: @villaibarronci
- Facebook: Villa I Barronci Resort & Spa
- TripAdvisor: Villa I Barronci

## FAQ

**D: Come raggiungo Villa I Barronci?**
R: In auto da Firenze: superstrada FI-SI, uscita San Casciano, seguire indicazioni. Transfer su richiesta.

**D: È adatta per famiglie con bambini?**
R: Sì, offriamo camere familiari, menu bambini, e il parco è ideale per giocare.

**D: Posso organizzare un matrimonio?**
R: Sì, organizziamo matrimoni e eventi fino a 150 persone. Contattaci per un preventivo.

**D: C'è il Wi-Fi?**
R: Sì, Wi-Fi gratuito ad alta velocità in tutta la struttura.

**D: La piscina è riscaldata?**
R: La piscina esterna non è riscaldata (aperta maggio-settembre). La piscina interna della spa è riscaldata tutto l'anno.

**D: Accettate animali?**
R: Sì, animali di piccola taglia sono ammessi su richiesta con supplemento.

## Premi e Riconoscimenti

- TripAdvisor Certificate of Excellence
- Booking.com Guest Review Award
- Green Key Eco-Label

## Sostenibilità

- Energia 100% da fonti rinnovabili
- Prodotti biologici locali
- Riduzione plastica monouso
- Raccolta differenziata
- Risparmio idrico
`

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  })
}
