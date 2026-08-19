import { ContactRound, Inbox, Mail, MessageSquareText, Tags, UsersRound } from "lucide-react"
import { buildFeatureMetadata, FeatureLandingPage } from "@/components/platform/feature-landing-page"

const description =
  "Gestisci Gmail, conversazioni, assegnazioni, risposte rapide e collaborazione del team. Gli altri canali si attivano dopo verifica del connettore."

export const metadata = buildFeatureMetadata({
  slug: "inbox-omnicanale",
  title: "Inbox omnicanale per hotel e Gmail",
  description,
  keywords: [
    "inbox omnicanale hotel",
    "gestione email hotel",
    "gmail hotel",
    "inbox condivisa hotel",
    "messaggi ospiti hotel",
    "collaborazione reception",
  ],
})

const capabilities = [
  {
    icon: Mail,
    title: "Gmail sincronizzato",
    description:
      "OAuth, import incrementale, aggiornamenti push e polling di fallback mantengono messaggi e stato Gmail nella piattaforma.",
  },
  {
    icon: Inbox,
    title: "Conversazioni organizzate",
    description:
      "Leggi thread, cerca, filtra, segna come letto o preferito e applica azioni massive alle conversazioni autorizzate.",
  },
  {
    icon: MessageSquareText,
    title: "Risposta dall'inbox",
    description:
      "Rispondi ai thread Gmail e usa risposte rapide salvate, senza ricostruire manualmente destinatari e cronologia.",
  },
  {
    icon: UsersRound,
    title: "Collaborazione del team",
    description:
      "Lock di lavorazione, trasferimento e storico aiutano più operatori a coordinarsi sulla stessa richiesta.",
  },
  {
    icon: Tags,
    title: "Etichette e stato",
    description:
      "Le label Gmail, letto/non letto, spam e cestino vengono riconciliati per ridurre differenze tra casella e piattaforma.",
  },
  {
    icon: ContactRound,
    title: "Collegamento al CRM",
    description:
      "Il mittente viene collegato a un contatto esistente o acquisito secondo le regole del tenant, escludendo i mittenti automatici.",
  },
]

const faqs = [
  {
    question: "Quale canale è verificato oggi su una struttura reale?",
    answer:
      "Gmail è il primo canale verificato su un tenant reale, con OAuth, sincronizzazione, watch push, polling di fallback e riconciliazione degli stati.",
  },
  {
    question: "WhatsApp, Telegram e Outlook sono già inclusi automaticamente?",
    answer:
      "No. Nel repository esistono componenti e connettori per alcuni canali, ma provider, permessi, webhook e flusso end-to-end devono essere verificati per il singolo tenant prima dell'attivazione.",
  },
  {
    question: "L'inbox evita sempre messaggi persi o dimezza i tempi di risposta?",
    answer:
      "Non viene garantita una percentuale prestabilita. L'inbox riduce i passaggi manuali, ma il risultato dipende da configurazione, copertura dei canali e organizzazione del team.",
  },
  {
    question: "Le risposte vengono inviate automaticamente dall'AI?",
    answer:
      "L'operatore può generare una bozza assistita e modificarla. L'invio resta sotto il suo controllo, salvo futuri flussi esplicitamente configurati e collaudati.",
  },
]

export default function InboxOmnichannelLandingPage() {
  return (
    <FeatureLandingPage
      slug="inbox-omnicanale"
      eyebrow="Inbox per hotel"
      icon={Inbox}
      title="Email degli ospiti e lavoro del team in un unico spazio"
      intro="HotelAccelerator porta Gmail nell'area operativa della struttura, collega conversazioni e contatti e offre strumenti di collaborazione senza promettere canali non ancora verificati."
      statusLabel="Gmail verificato al livello Tenant reale"
      statusDescription="Restano da completare recovery drill, autenticazione del webhook e osservabilità prima dello stato Production-ready. Gli altri canali sono attivati solo dopo verifica."
      capabilitiesTitle="Cosa fa oggi l'inbox"
      capabilitiesIntro="Il primo verticale reale è l'email. La strategia omnicanale procede per connettori indipendenti, senza simulare integrazioni mancanti."
      capabilities={capabilities}
      availableNow={[
        "Connessione Gmail OAuth, sincronizzazione incrementale e risposta ai thread.",
        "Label, letto/non letto, preferiti, spam, cestino e azioni massive.",
        "Risposte rapide, lock di collaborazione, trasferimento e storico.",
        "Collegamento controllato tra conversazioni e contatti CRM.",
      ]}
      requiresVerification={[
        "Recovery con cursor scaduto, outage dei provider, alert e runbook.",
        "Autenticazione completa del webhook Pub/Sub e SLO operativi.",
        "WhatsApp, Telegram, Outlook, IMAP, social, OTA e telefonia sul tenant interessato.",
      ]}
      faqs={faqs}
      related={[
        {
          href: "/features/crm",
          title: "CRM alberghiero",
          description: "Collega ogni conversazione al profilo ospite e al suo storico.",
        },
        {
          href: "/features/ai-assistant",
          title: "AI con controllo umano",
          description: "Genera bozze basate sulla knowledge base senza invii opachi.",
        },
      ]}
      ctaTitle="Verifichiamo i canali realmente collegabili"
      ctaDescription="La demo parte dalla casella Gmail e dai permessi del team; gli altri canali vengono valutati uno per uno."
      schemaName="Inbox omnicanale per hotel con integrazione Gmail"
      schemaDescription={description}
    />
  )
}
