/**
 * Template email predefiniti per i lead, ognuno focalizzato su un "tema forte" di Santaddeo.
 * I venditori possono scegliere uno di questi template e personalizzarlo prima dell'invio.
 */

export type EmailTemplate = {
  id: string
  name: string
  tagline: string
  description: string
  icon: "chart" | "sliders" | "piggy-bank" | "headset" | "pencil" | "thumbs-up" | "rocket" | "phone-call"
  color: string // tailwind bg color
  subject: string
  body: string
}

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "personalizzato",
    name: "Personalizzato",
    tagline: "Scrivi tu il messaggio",
    description: "Parti da una traccia minima e personalizza liberamente oggetto e contenuto dell'email.",
    icon: "pencil",
    color: "bg-slate-500",
    subject: "{{nome_lead}}, un'idea per {{nome_struttura}}",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Sono <strong>{{nome_venditore}}</strong> di SANTADDEO.</p>

<p>Scrivi qui il tuo messaggio personalizzato per {{nome_struttura}}...</p>

<p>A presto,<br/><strong>{{nome_venditore}}</strong></p>`,
  },
  {
    id: "dashboard-free",
    name: "Dashboard Gratuita",
    tagline: "KPI sempre visibili, zero costi",
    description: "Evidenzia la dashboard con metriche in tempo reale, completamente gratuita e per sempre.",
    icon: "chart",
    color: "bg-blue-500",
    subject: "{{nome_lead}}, i KPI di {{nome_struttura}} sempre a portata di mano - gratis",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Sono <strong>{{nome_venditore}}</strong>.</p>

<p>Voglio farti conoscere qualcosa che potrebbe cambiarti la giornata: <strong>una dashboard gratuita</strong> con tutti i KPI del tuo hotel.</p>

<p>Immagina di avere sempre sotto controllo:</p>
<ul>
  <li>Occupazione in tempo reale</li>
  <li>ADR e RevPAR aggiornati</li>
  <li>Trend di prenotazione vs anno precedente</li>
  <li>Tutto collegato direttamente al tuo PMS</li>
</ul>

<p><strong>Costa zero. Per sempre.</strong> Non è una prova, è il nostro modo di farti vedere cosa possiamo fare insieme.</p>

<p style="margin: 30px 0;">
  <a href="{{link_dashboard_demo}}" style="background: #3b82f6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Attiva la dashboard gratuita</a>
</p>

<p>Se hai domande, rispondi a questa mail o chiamami direttamente.</p>

<p>A presto,<br/><strong>{{nome_venditore}}</strong></p>`,
  },
  {
    id: "rms-personalizzabile",
    name: "RMS Personalizzabile",
    tagline: "L'unico che si adatta a te",
    description: "L'RMS che non ti impone regole rigide ma si modella sulla tua struttura e strategia.",
    icon: "sliders",
    color: "bg-emerald-500",
    subject: "{{nome_lead}}, l'RMS che si adatta a {{nome_struttura}} (non il contrario)",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Sono <strong>{{nome_venditore}}</strong> e ti scrivo perché ho notato {{nome_struttura}}.</p>

<p>Sai qual è il problema degli RMS tradizionali? <strong>Ti obbligano ad adattarti a loro.</strong> Regole rigide, algoritmi black-box, prezzi che non capisci.</p>

<p>SANTADDEO è diverso:</p>
<ul>
  <li><strong>Tu decidi le regole</strong> - imposti min/max, fasce di occupazione, stagionalità</li>
  <li><strong>Vedi ogni calcolo</strong> - niente black-box, ogni prezzo ha una spiegazione</li>
  <li><strong>Intervieni quando vuoi</strong> - override manuali sempre possibili</li>
  <li><strong>L'algoritmo impara</strong> - si adatta al TUO storico, non a medie di mercato</li>
</ul>

<p>Il risultato? <strong>Prezzi che hanno senso per la tua struttura</strong>, non formule generiche.</p>

<p style="margin: 30px 0;">
  <a href="{{link_signup}}" style="background: #10b981; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Scopri come funziona</a>
</p>

<p>Posso mostrarti una demo personalizzata su {{nome_struttura}}? Rispondi e fissiamo 15 minuti.</p>

<p>{{nome_venditore}}</p>`,
  },
  {
    id: "pay-for-performance",
    name: "Paghi Solo se Funziona",
    tagline: "Commissioni sui risultati, non canoni fissi",
    description: "Il modello a commissione: nessun costo fisso, paghi solo una percentuale sull'incremento.",
    icon: "piggy-bank",
    color: "bg-amber-500",
    subject: "{{nome_lead}}, e se pagassi l'RMS solo quando funziona?",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Sono <strong>{{nome_venditore}}</strong>.</p>

<p>Ti faccio una domanda: <strong>perché dovresti pagare un software che non ti porta risultati?</strong></p>

<p>La maggior parte degli RMS costa centinaia di euro al mese. Fisso. Che funzioni o no.</p>

<p>SANTADDEO funziona diversamente:</p>
<ul>
  <li><strong>Zero canone mensile</strong></li>
  <li><strong>Paghi solo una piccola commissione sull'incremento di fatturato</strong></li>
  <li>Se non guadagni di più, non ci devi nulla</li>
</ul>

<p>È il nostro modo di dimostrarti che crediamo nel prodotto. <strong>Rischiamo insieme a te.</strong></p>

<p style="margin: 30px 0;">
  <a href="{{link_signup}}" style="background: #f59e0b; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Calcola quanto potresti guadagnare</a>
</p>

<p>Ti va di fare due conti insieme? Rispondi e ti mostro una simulazione su {{nome_struttura}}.</p>

<p>{{nome_venditore}}</p>`,
  },
  {
    id: "supporto-dedicato",
    name: "Supporto Dedicato",
    tagline: "Mai solo, sempre assistito",
    description: "Revenue manager dedicato, formazione continua e supporto umano (non bot).",
    icon: "headset",
    color: "bg-purple-500",
    subject: "{{nome_lead}}, hai mai avuto un revenue manager dedicato?",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Sono <strong>{{nome_venditore}}</strong>.</p>

<p>Sai cosa manca alla maggior parte dei software per hotel? <strong>Le persone.</strong></p>

<p>Puoi avere il miglior algoritmo del mondo, ma se poi resti solo davanti a uno schermo, non serve a molto.</p>

<p>Con SANTADDEO hai:</p>
<ul>
  <li><strong>Un revenue manager dedicato</strong> - non un call center, una persona che conosce la tua struttura</li>
  <li><strong>Formazione continua</strong> - ti insegniamo a leggere i dati e prendere decisioni</li>
  <li><strong>Supporto umano</strong> - rispondiamo noi, non un bot</li>
  <li><strong>Review periodiche</strong> - analizziamo insieme i risultati e ottimizziamo</li>
</ul>

<p>Non sei solo un numero. <strong>Sei un partner.</strong></p>

<p style="margin: 30px 0;">
  <a href="{{link_signup}}" style="background: #8b5cf6; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Parliamone insieme</a>
</p>

<p>Ti va una chiamata conoscitiva? Nessun impegno, solo una chiacchierata per capire se possiamo aiutarti.</p>

<p>{{nome_venditore}}</p>`,
  },
  {
    id: "ringraziamento-post-demo",
    name: "Ringraziamento post demo",
    tagline: "Grazie per il tempo dedicato",
    description: "Email di cortesia subito dopo la demo: ringrazia, riassume i punti chiave e tiene aperto il dialogo.",
    icon: "thumbs-up",
    color: "bg-sky-500",
    subject: "Grazie {{nome_lead}}! Ecco un riepilogo della demo di SANTADDEO",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Grazie per il tempo che mi hai dedicato oggi: è stato un piacere mostrarti come SANTADDEO può lavorare per <strong>{{nome_struttura}}</strong>.</p>

<p>Riepilogo i punti che abbiamo visto insieme:</p>
<ul>
  <li>La dashboard con i KPI in tempo reale (occupazione, ADR, RevPAR)</li>
  <li>Come l'RMS si adatta alle tue regole e alla tua stagionalità</li>
  <li>Il modello pay-for-performance, senza canoni fissi</li>
  <li>Il supporto di un revenue manager dedicato</li>
</ul>

<p>Resto a disposizione per qualsiasi dubbio: rispondi pure a questa email o chiamami quando preferisci.</p>

<p>A presto,<br/><strong>{{nome_venditore}}</strong></p>`,
  },
  {
    id: "attivazione-post-demo",
    name: "Attivazione post demo",
    tagline: "Partiamo: il prossimo passo",
    description: "Invito ad attivare SANTADDEO dopo la demo, con CTA chiara per iniziare subito.",
    icon: "rocket",
    color: "bg-emerald-600",
    subject: "{{nome_lead}}, attiviamo SANTADDEO per {{nome_struttura}}?",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Dopo la demo che abbiamo fatto insieme, credo che SANTADDEO possa davvero fare la differenza per <strong>{{nome_struttura}}</strong>.</p>

<p>Per partire serve pochissimo:</p>
<ul>
  <li>Attivi l'account (bastano pochi minuti)</li>
  <li>Colleghiamo il tuo PMS</li>
  <li>Configuriamo insieme le prime regole di pricing</li>
</ul>

<p>Da lì inizi a vedere i risultati, <strong>senza canoni fissi</strong>: paghi solo in base alla performance.</p>

<p style="margin: 30px 0;">
  <a href="{{link_signup}}" style="background: #059669; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Attiva SANTADDEO ora</a>
</p>

<p>Se preferisci, ci occupiamo noi della configurazione iniziale insieme a te. Dimmi quando sei pronto e partiamo.</p>

<p>A presto,<br/><strong>{{nome_venditore}}</strong></p>`,
  },
  {
    id: "recall-post-demo",
    name: "Recall post demo",
    tagline: "Riprendiamo il filo",
    description: "Follow-up gentile per i lead che non hanno ancora risposto dopo la demo, per riaprire la conversazione.",
    icon: "phone-call",
    color: "bg-amber-600",
    subject: "{{nome_lead}}, hai avuto modo di pensarci?",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Ti scrivo per riprendere il filo dopo la demo di SANTADDEO per <strong>{{nome_struttura}}</strong>.</p>

<p>Immagino che in questo periodo tu abbia molto da gestire: volevo solo capire se ti è rimasto qualche dubbio o se posso esserti utile in qualche modo.</p>

<p>Mi farebbe piacere sapere:</p>
<ul>
  <li>Se le funzionalità che ti ho mostrato rispondono alle tue esigenze</li>
  <li>Se c'è qualcosa che vorresti approfondire o rivedere insieme</li>
  <li>Quali sono le tempistiche con cui stai valutando una soluzione</li>
</ul>

<p>Bastano due righe di risposta, oppure possiamo sentirci al telefono quando hai cinque minuti.</p>

<p>A presto,<br/><strong>{{nome_venditore}}</strong></p>`,
  },
  {
    id: "fissa-demo",
    name: "Fissa una demo",
    tagline: "Proponi 3 orari per la call",
    description:
      "Proponi al lead tre orari per la demo: riceverà i pulsanti per confermare quello che preferisce. Ricordati di scegliere gli orari in \"Aggiungi una call → Proponi 3 orari\".",
    icon: "phone-call",
    color: "bg-teal-600",
    subject: "{{nome_lead}}, fissiamo la demo di SANTADDEO per {{nome_struttura}}?",
    body: `<p>Ciao <strong>{{nome_lead}}</strong>,</p>

<p>Sono <strong>{{nome_venditore}}</strong> di SANTADDEO.</p>

<p>Mi farebbe piacere mostrarti dal vivo come SANTADDEO può lavorare per <strong>{{nome_struttura}}</strong>: bastano una ventina di minuti in videochiamata.</p>

<p>Per semplificare, ti propongo qui sotto alcuni orari: scegli quello che preferisci e ricevi subito la conferma.</p>

{{link_prenota_call}}

<p>Se nessuno di questi orari ti è comodo, rispondi pure a questa email e ne troviamo un altro.</p>

<p>A presto,<br/><strong>{{nome_venditore}}</strong></p>`,
  },
]

export function getTemplateById(id: string): EmailTemplate | undefined {
  return EMAIL_TEMPLATES.find((t) => t.id === id)
}
