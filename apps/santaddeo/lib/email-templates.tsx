const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"
const LOGO_URL = `${SITE_URL}/logo-santaddeo.png`

const emailStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f5; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #eab308 0%, #a16207 100%); }
  .logo { max-width: 200px; height: auto; }
  .header-title { color: white; font-size: 28px; font-weight: 700; margin: 10px 0 0; }
  .header-subtitle { color: rgba(255,255,255,0.85); font-size: 14px; margin: 5px 0 0; }
  .content { background: #ffffff; padding: 40px 30px; border-radius: 0 0 8px 8px; }
  .button { display: inline-block; padding: 14px 32px; background: #eab308; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .footer { text-align: center; padding: 20px; color: #666; font-size: 13px; }
  .highlight { background: #fefce8; padding: 15px 20px; border-left: 4px solid #eab308; margin: 20px 0; border-radius: 0 6px 6px 0; }
  h1 { color: #1f2937; font-size: 24px; margin-bottom: 20px; }
  a.button { color: white !important; }
`

function wrapTemplate(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${emailStyles}</style></head>
<body>
  <div class="container">
    <div class="header">
      <img src="${LOGO_URL}" alt="SANTADDEO" class="logo" />
      <div class="header-title">SANTADDEO</div>
      <div class="header-subtitle">Revenue Management System</div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>SANTADDEO - Revenue Management System</p>
      <p>Questa e una email automatica. Non rispondere a questo indirizzo.</p>
    </div>
  </div>
</body>
</html>`
}

// 0. Verify Email (Signup Confirmation)
export function getVerifyEmailTemplate(name: string, verifyLink: string): string {
  return wrapTemplate(`
    <h1>Verifica il tuo account</h1>
    <p>Ciao <strong>${name}</strong>,</p>
    <p>Grazie per esserti registrato su SANTADDEO. Per completare la registrazione e attivare il tuo account, clicca sul pulsante qui sotto.</p>
    <div style="text-align: center;">
      <a href="${verifyLink}" class="button">Verifica il mio account</a>
    </div>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Se non riesci a cliccare il pulsante, copia e incolla questo link nel browser:<br/>
      <a href="${verifyLink}" style="color: #eab308; word-break: break-all;">${verifyLink}</a>
    </p>
    <p style="color: #9ca3af; font-size: 13px;">Se non hai richiesto questa registrazione, ignora questa email.</p>
  `)
}

// 1. Welcome Email
export function getWelcomeEmail(name: string, email: string): string {
  return wrapTemplate(`
    <h1>Benvenuto in SANTADDEO!</h1>
    <p>Ciao <strong>${name}</strong>,</p>
    <p>Il tuo account e stato creato con successo. Ecco i dettagli:</p>
    <div class="highlight">
      <strong>Email account:</strong> ${email}
    </div>
    <p>Con SANTADDEO puoi:</p>
    <ul>
      <li>Monitorare KPI in tempo reale (RevPAR, ADR, Occupancy)</li>
      <li>Sincronizzare automaticamente i dati dal tuo PMS</li>
      <li>Ricevere alert intelligenti sulle performance</li>
      <li>Analizzare trend e confronti con periodi precedenti</li>
    </ul>
    <div style="text-align: center;">
      <a href="${SITE_URL}/dashboard" class="button">Vai alla Dashboard</a>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Se hai bisogno di aiuto, contatta il tuo account manager.</p>
  `)
}

// 2.b Force Onboarding Email (super_admin -> property_admin / sub_user che non
// ha mai completato l'onboarding). Usata dall'endpoint
// `/api/superadmin/organizations/[id]/force-onboarding`. A differenza del
// team-invite parla direttamente all'utente come "completa l'attivazione" e
// non cita inviter/role, perche' l'utente arriva fresco senza contesto.
export function getForceOnboardingEmail(args: {
  recipientName: string
  organizationName: string
  magicLink: string
}): string {
  const safeUrl = args.magicLink.replace(/&/g, "&amp;")
  return wrapTemplate(`
    <h1>Attiva il tuo account SANTADDEO</h1>
    <p>Ciao <strong>${args.recipientName}</strong>,</p>
    <p>Il tuo account per <strong>${args.organizationName}</strong> e' pronto. Per completare l'attivazione e iniziare a utilizzare SANTADDEO, clicca sul pulsante qui sotto:</p>
    <div style="text-align: center;">
      <a href="${safeUrl}" class="button" style="display: inline-block; padding: 14px 32px; background: #eab308; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Completa l&apos;attivazione</a>
    </div>
    <div class="highlight">
      Al primo accesso ti chiederemo alcune informazioni sulla tua struttura (numero camere, stelle, tipologia, PMS in uso). Bastano pochi minuti.
    </div>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${safeUrl}" style="color: #eab308; word-break: break-all;">${safeUrl}</a>
    </p>
    <div style="background: #fef3c7; border-left: 3px solid #eab308; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
      <p style="margin: 0 0 8px 0; color: #92400e; font-size: 14px;"><strong>Il link scade entro 24 ore.</strong></p>
      <p style="margin: 0; color: #78350f; font-size: 13px;">Se il link e' scaduto o non funziona, scrivi una mail a <a href="mailto:support@santaddeo.com" style="color: #92400e; font-weight: 600;">support@santaddeo.com</a> indicando la tua struttura: ti invieremo un nuovo link entro poche ore.</p>
    </div>
    <p style="color: #9ca3af; font-size: 13px;">Se non ti aspettavi questa email, puoi ignorarla.</p>
  `)
}

// 2. Team Invite Email
export function getTeamInviteEmail(
  inviteeName: string,
  inviterName: string,
  hotelName: string,
  role: string,
  inviteUrl: string
): string {
  // Escape & as &amp; for valid HTML in href attributes
  const safeUrl = inviteUrl.replace(/&/g, "&amp;")
  return wrapTemplate(`
    <h1>Sei stato invitato!</h1>
    <p>Ciao <strong>${inviteeName}</strong>,</p>
    <p><strong>${inviterName}</strong> ti ha invitato a unirti al team di <strong>${hotelName}</strong> su SANTADDEO.</p>
    <div class="highlight">
      <strong>Hotel:</strong> ${hotelName}<br/>
      <strong>Ruolo:</strong> ${role}
    </div>
    <div style="text-align: center;">
      <a href="${safeUrl}" class="button" style="display: inline-block; padding: 14px 32px; background: #eab308; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Accetta l&apos;Invito</a>
    </div>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${safeUrl}" style="color: #eab308; word-break: break-all;">${safeUrl}</a>
    </p>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">Questo invito scadra tra 7 giorni.</p>
    <p style="color: #9ca3af; font-size: 13px;">Se non ti aspettavi questo invito, puoi ignorare questa email.</p>
  `)
}

/**
 * Email di invito per un nuovo venditore (sales_agent).
 * Diversa da getTeamInviteEmail perche':
 *  - non c'e' un hotel di riferimento
 *  - mostra %commissione e permessi pre-impostati
 *  - copy esplicita "venditore Santaddeo"
 */
export function getSalesAgentInviteEmail(args: {
  inviteeName: string
  inviterName: string
  inviteUrl: string
  commissionPercentage?: number | null
  expiresInDays?: number
}): string {
  const safeUrl = args.inviteUrl.replace(/&/g, "&amp;")
  const commissionLine =
    args.commissionPercentage != null && args.commissionPercentage > 0
      ? `<strong>Commissione predefinita:</strong> ${args.commissionPercentage}%<br/>`
      : ""
  const days = args.expiresInDays ?? 14
  return wrapTemplate(`
    <h1>Benvenuto nel team venditori SANTADDEO</h1>
    <p>Ciao <strong>${args.inviteeName}</strong>,</p>
    <p><strong>${args.inviterName}</strong> ti ha invitato come venditore di SANTADDEO. Da qui potrai gestire i tuoi lead, seguire le strutture associate e monitorare le commissioni.</p>
    ${commissionLine ? `<div class="highlight">${commissionLine}</div>` : ""}
    <p>Per attivare il tuo account, clicca il pulsante qui sotto e completa la registrazione con la stessa email a cui ti e&apos; arrivato questo messaggio.</p>
    <div style="text-align: center;">
      <a href="${safeUrl}" class="button" style="display: inline-block; padding: 14px 32px; background: #eab308; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Crea il tuo account</a>
    </div>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${safeUrl}" style="color: #eab308; word-break: break-all;">${safeUrl}</a>
    </p>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">Questo invito scadra&apos; tra ${days} giorni.</p>
    <p style="color: #9ca3af; font-size: 13px;">Se non ti aspettavi questo invito, puoi ignorare questa email.</p>
  `)
}

/**
 * Email di benvenuto per un venditore GIA' attivo (profile esistente).
 * Il CTA punta a un Supabase recovery magic link generato server-side
 * (vedi /api/superadmin/sales/agents/[id]/welcome-email), che porta a
 * /auth/reset-password?next=/sales. Al primo click l'agente IMPOSTA
 * la propria password, dopo il submit la sessione recovery diventa
 * full session e l'utente atterra direttamente su /sales.
 *
 * Pattern unificato "imposta password al primo click" anche per agent
 * promossi da profile gia' esistente: in pratica e' un reset password
 * forzato, ma per il venditore la prima volta e' come "scegli la tua
 * password di accesso al portale venditori".
 */
export function getSalesAgentWelcomeEmail(args: {
  agentName: string
  inviterName: string
  /** Magic link Supabase recovery che permette l'accesso senza password. */
  loginUrl: string
  commissionPercentage?: number | null
  hotelCount?: number
}): string {
  const safeUrl = args.loginUrl.replace(/&/g, "&amp;")
  const commissionLine =
    args.commissionPercentage != null && args.commissionPercentage > 0
      ? `<strong>Commissione predefinita:</strong> ${args.commissionPercentage}%<br/>`
      : ""
  const hotelLine =
    args.hotelCount != null && args.hotelCount > 0
      ? `<strong>Strutture associate:</strong> ${args.hotelCount}<br/>`
      : ""
  return wrapTemplate(`
    <h1>Benvenuto nel team venditori SANTADDEO</h1>
    <p>Ciao <strong>${args.agentName}</strong>,</p>
    <p><strong>${args.inviterName}</strong> ti ha attivato come venditore SANTADDEO. Per accedere alla tua area, imposta la tua password personale cliccando il pulsante qui sotto.</p>
    ${commissionLine || hotelLine ? `<div class="highlight">${commissionLine}${hotelLine}</div>` : ""}
    <p>Una volta impostata la password, verrai portato direttamente alla tua dashboard venditore, da cui potrai vedere i tuoi lead, gestire le strutture associate e monitorare le commissioni.</p>
    <div style="text-align: center;">
      <a href="${safeUrl}" class="button" style="display: inline-block; padding: 14px 32px; background: #eab308; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Imposta password e accedi</a>
    </div>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Se il pulsante non funziona, copia e incolla questo link nel browser:<br/>
      <a href="${safeUrl}" style="color: #eab308; word-break: break-all;">${safeUrl}</a>
    </p>
    <p style="color: #9ca3af; font-size: 13px;">Il link e&apos; valido per 24 ore. Se scade, l&apos;amministratore puo&apos; rispedirti un nuovo link dalla pagina venditori.</p>
  `)
}

// 3. Admin: Notifica Nuovo Utente
export function getAdminNewUserNotification(userName: string, userEmail: string): string {
  return wrapTemplate(`
    <h1>Nuova Registrazione</h1>
    <p>Un nuovo utente si e registrato su SANTADDEO.</p>
    <div class="highlight">
      <strong>Nome:</strong> ${userName}<br/>
      <strong>Email:</strong> ${userEmail}<br/>
      <strong>Data:</strong> ${new Date().toLocaleString("it-IT")}<br/>
      <strong>Piano:</strong> Free
    </div>
    <div style="text-align: center;">
      <a href="${SITE_URL}/admin/dashboard" class="button">Vai alla Dashboard Admin</a>
    </div>
  `)
}

// 4b. Conferma all'utente che ha inviato richiesta info
export function getInfoRequestUserConfirmation({
  fullName,
  hotelName,
}: {
  fullName: string
  hotelName?: string
}): string {
  return wrapTemplate(`
    <h1>Abbiamo ricevuto la tua richiesta</h1>
    <p>Ciao <strong>${fullName}</strong>,</p>
    <p>Grazie per l'interesse verso SANTADDEO. Abbiamo ricevuto la tua richiesta di informazioni${hotelName ? ` per <strong>${hotelName}</strong>` : ""} e ti contatteremo al piu' presto, in genere entro 24 ore lavorative.</p>
    <div class="highlight">
      <strong>Cosa succede ora?</strong>
      <ul style="margin: 10px 0 0; padding-left: 20px;">
        <li>Un consulente analizzera' la tua struttura</li>
        <li>Ti contattera' per fissare una demo personalizzata</li>
        <li>Ti mostrera' come SANTADDEO puo' aumentare il tuo fatturato</li>
      </ul>
    </div>
    <p>Nel frattempo, puoi esplorare alcune nostre soluzioni:</p>
    <ul>
      <li><a href="${SITE_URL}/landing/guard" style="color: #eab308;">Guard - Stop alle OTA furbe</a></li>
      <li><a href="${SITE_URL}/landing/autopilot" style="color: #eab308;">AutoPilot - Pricing automatico 24/7</a></li>
      <li><a href="${SITE_URL}/landing/vendita" style="color: #eab308;">+20% fatturato in 30 giorni</a></li>
    </ul>
    <p style="color: #6b7280; font-size: 14px;">Se hai bisogno di un contatto urgente, scrivici a <a href="mailto:info@santaddeo.com" style="color: #eab308;">info@santaddeo.com</a>.</p>
  `)
}

// 4. Admin: Notifica Richiesta Info
export function getAdminContactRequestNotification({
  fullName,
  email,
  company,
  phone,
  message,
  plan,
}: {
  fullName: string
  email: string
  company?: string
  phone?: string
  message: string
  plan: string
}): string {
  return wrapTemplate(`
    <h1>Nuova Richiesta Piano ${plan.toUpperCase()}</h1>
    <p>Un potenziale cliente ha richiesto informazioni.</p>
    <div class="highlight">
      <strong>Nome:</strong> ${fullName}<br/>
      <strong>Email:</strong> ${email}<br/>
      ${company ? `<strong>Azienda:</strong> ${company}<br/>` : ""}
      ${phone ? `<strong>Telefono:</strong> ${phone}<br/>` : ""}
      <strong>Piano richiesto:</strong> ${plan}<br/>
      <strong>Data:</strong> ${new Date().toLocaleString("it-IT")}
    </div>
    <div style="background: #f3f4f6; padding: 15px 20px; border-radius: 6px; margin: 20px 0;">
      <strong>Messaggio:</strong>
      <p style="white-space: pre-wrap; margin: 10px 0 0;">${message}</p>
    </div>
    <div style="text-align: center;">
      <a href="mailto:${email}" class="button" style="margin-right: 10px;">Rispondi via Email</a>
    </div>
  `)
}

// 5. Alert Notification
export function getAlertNotificationEmail({
  hotelName,
  alertName,
  severity,
  metric,
  currentValue,
  threshold,
  message,
  dashboardUrl,
}: {
  hotelName: string
  alertName: string
  severity: "green" | "orange" | "red"
  metric: string
  currentValue: number
  threshold: number
  message: string
  dashboardUrl: string
}): string {
  const severityColors = { green: "#22c55e", orange: "#f97316", red: "#ef4444" }
  const severityLabels = { green: "VERDE", orange: "ARANCIONE", red: "ROSSO" }
  const color = severityColors[severity]

  return wrapTemplate(`
    <h1 style="color: ${color};">Alert: ${alertName}</h1>
    <p>Hotel: <strong>${hotelName}</strong></p>
    <div class="highlight" style="border-left-color: ${color}; background: ${severity === "red" ? "#fef2f2" : severity === "orange" ? "#fff7ed" : "#f0fdf4"};">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Livello:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: ${color};">${severityLabels[severity]}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Metrica:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${metric}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Valore Attuale:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600; color: ${color};">${currentValue}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #6b7280;">Soglia:</td>
          <td style="padding: 6px 0; text-align: right; font-weight: 600;">${threshold}</td>
        </tr>
      </table>
    </div>
    <p>${message}</p>
    <div style="text-align: center;">
      <a href="${dashboardUrl}" class="button">Vai alla Dashboard</a>
    </div>
  `)
}

// 6. Password Reset Email
export function getPasswordResetEmail(name: string, resetUrl: string): string {
  return wrapTemplate(`
    <h1>Reset Password</h1>
    <p>Ciao <strong>${name || "utente"}</strong>,</p>
    <p>Hai richiesto il reset della password del tuo account SANTADDEO.</p>
    <div style="text-align: center;">
      <a href="${resetUrl}" class="button">Reimposta Password</a>
    </div>
    <p style="color: #9ca3af; font-size: 13px;">Se non hai richiesto il reset della password, ignora questa email. Il link scadra tra 1 ora.</p>
  `)
}

// 7. SuperAdmin: Notifica Nuovo Invito Utente
export function getSuperAdminInviteNotification({
  inviteeName,
  inviteeEmail,
  inviterName,
  hotelName,
  role,
}: {
  inviteeName: string
  inviteeEmail: string
  inviterName: string
  hotelName: string
  role: string
}): string {
  return wrapTemplate(`
    <h1>Nuovo Invito Utente</h1>
    <p>Un nuovo utente e stato invitato sulla piattaforma SANTADDEO.</p>
    <div class="highlight">
      <strong>Invitato:</strong> ${inviteeName} (${inviteeEmail})<br/>
      <strong>Invitato da:</strong> ${inviterName}<br/>
      <strong>Hotel:</strong> ${hotelName}<br/>
      <strong>Ruolo:</strong> ${role}<br/>
      <strong>Data:</strong> ${new Date().toLocaleString("it-IT")}
    </div>
    <div style="text-align: center;">
      <a href="${SITE_URL}/superadmin" class="button">Vai al Pannello SuperAdmin</a>
    </div>
  `)
}

// 8. Autopilot Price Change Notification
export function getAutopilotPriceChangeEmail({
  hotelName,
  mode,
  changes,
  dashboardUrl,
}: {
  hotelName: string
  mode: "notify" | "autopilot" | "manual"
  changes: { date: string; roomTypeName: string; oldPrice: number; newPrice: number; occupancyPct: number }[]
  dashboardUrl: string
}): string {
  const modeLabels = {
    notify: "Suggerimento variazione tariffaria",
    autopilot: "Variazione tariffaria inviata automaticamente al PMS",
    manual: "Variazione tariffaria inviata manualmente al PMS",
  }
  const modeLabel = modeLabels[mode]

  const increaseCount = changes.filter(c => c.newPrice > c.oldPrice).length
  const decreaseCount = changes.filter(c => c.newPrice < c.oldPrice).length

  // Group changes by date
  const byDate: Record<string, typeof changes> = {}
  for (const c of changes) {
    if (!byDate[c.date]) byDate[c.date] = []
    byDate[c.date].push(c)
  }

  const tableRows = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, dateChanges]) =>
      dateChanges.map((c, i) => {
        const diff = c.newPrice - c.oldPrice
        const diffPct = c.oldPrice > 0 ? ((diff / c.oldPrice) * 100).toFixed(1) : "0.0"
        const color = diff > 0 ? "#22c55e" : "#ef4444"
        const arrow = diff > 0 ? "&#9650;" : "&#9660;"
        const formattedDate = i === 0 ? new Date(date + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" }) : ""
        return `<tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px; font-weight: ${i === 0 ? '600' : '400'}; color: #374151;">${formattedDate}</td>
          <td style="padding: 8px; color: #6b7280;">${c.roomTypeName}</td>
          <td style="padding: 8px; text-align: right; color: #6b7280;">${c.occupancyPct.toFixed(0)}%</td>
          <td style="padding: 8px; text-align: right; color: #6b7280; text-decoration: line-through;">${c.oldPrice.toFixed(0)}&euro;</td>
          <td style="padding: 8px; text-align: right; font-weight: 600; color: ${color};">${c.newPrice.toFixed(0)}&euro;</td>
          <td style="padding: 8px; text-align: right; color: ${color};">${arrow} ${Math.abs(diff).toFixed(0)}&euro; (${diffPct}%)</td>
        </tr>`
      })
    ).join("")

  return wrapTemplate(`
    <h1>${modeLabel}</h1>
    <p>Hotel: <strong>${hotelName}</strong></p>
    <div class="highlight">
      <strong>${changes.length}</strong> variazioni rilevate: 
      <span style="color: #22c55e;">${increaseCount} aumenti</span> | 
      <span style="color: #ef4444;">${decreaseCount} riduzioni</span>
    </div>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 10px 8px; text-align: left; color: #6b7280; font-weight: 600;">Data</th>
            <th style="padding: 10px 8px; text-align: left; color: #6b7280; font-weight: 600;">Tipologia</th>
            <th style="padding: 10px 8px; text-align: right; color: #6b7280; font-weight: 600;">Occ.</th>
            <th style="padding: 10px 8px; text-align: right; color: #6b7280; font-weight: 600;">Attuale</th>
            <th style="padding: 10px 8px; text-align: right; color: #6b7280; font-weight: 600;">Suggerito</th>
            <th style="padding: 10px 8px; text-align: right; color: #6b7280; font-weight: 600;">Differenza</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
    ${mode === "notify" ? `
    <div style="text-align: center; margin-top: 25px;">
      <a href="${dashboardUrl}" class="button">Vai alla Tabella Prezzi</a>
    </div>
    <p style="color: #9ca3af; font-size: 13px; text-align: center;">
      Per inviare i prezzi al PMS, accedi alla tabella prezzi e clicca "Invia al PMS",<br/>
      oppure attiva l'Autopilot per l'invio automatico.
    </p>
    ` : `
    <div class="highlight" style="border-left-color: #22c55e; background: #f0fdf4;">
      <strong>Prezzi inviati con successo al PMS.</strong><br/>
      <span style="color: #6b7280;">Le tariffe sono state aggiornate automaticamente.</span>
    </div>
    <div style="text-align: center; margin-top: 25px;">
      <a href="${dashboardUrl}" class="button">Verifica nella Tabella Prezzi</a>
    </div>
    `}
  `)
}

// 9. System Alert Email (connector health, sync failures, circuit breaker)
export function getSystemAlertEmail({
  alertType,
  hotelName,
  summary,
  details,
  dashboardUrl,
}: {
  alertType: string
  hotelName?: string
  summary: string
  details: string[]
  dashboardUrl?: string
}): string {
  const detailRows = details.map(d => `<li style="padding: 4px 0;">${d}</li>`).join("")
  const hotelLabel = hotelName ? `<p>Hotel: <strong>${hotelName}</strong></p>` : ""
  const buttonHtml = dashboardUrl
    ? `<div style="text-align: center; margin-top: 20px;"><a href="${dashboardUrl}" class="button">Vai alla Dashboard</a></div>`
    : ""

  return wrapTemplate(`
    <h1 style="color: #ef4444;">System Alert: ${alertType}</h1>
    ${hotelLabel}
    <div class="highlight" style="border-left-color: #ef4444; background: #fef2f2;">
      <strong>${summary}</strong>
    </div>
    <ul style="color: #374151; font-size: 14px;">
      ${detailRows}
    </ul>
    ${buttonHtml}
    <p style="color: #9ca3af; font-size: 13px; margin-top: 20px;">
      Questo alert non verra inviato di nuovo per almeno 1 ora (throttling attivo).
    </p>
  `)
}

// 10. Admin Mass Communication
export function getMassCommunicationEmail(title: string, message: string): string {
  return wrapTemplate(`
    <h1>${title}</h1>
    <div style="white-space: pre-wrap; line-height: 1.8;">${message}</div>
    <div style="text-align: center; margin-top: 30px;">
      <a href="${SITE_URL}/dashboard" class="button">Vai alla Dashboard</a>
    </div>
  `)
}
