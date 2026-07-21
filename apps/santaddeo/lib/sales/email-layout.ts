/**
 * Layout email condiviso SANTADDEO (vendite).
 *
 * Avvolge il contenuto HTML di un'email transazionale con:
 *  - Header: logo SANTADDEO (asset reale /logo-santaddeo.png)
 *  - Corpo: contenuto passato dal chiamante
 *  - Firma venditore: nome + email personale + cellulare (se impostato)
 *  - Footer: dati legali 4 bid srl + logo mignon 4bid (/logo-4bid.png)
 *
 * NB: gli asset sono referenziati con URL ASSOLUTO (host canonico www) perche'
 * i client email non caricano path locali. Mai inventare loghi: si usano gli
 * asset reali presenti in /public.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://www.santaddeo.com"

const LOGO_SANTADDEO = `${SITE_URL}/logo-santaddeo.png`
const LOGO_4BID = `${SITE_URL}/logo-4bid.png`

// Dati legali ufficiali 4 bid srl (vedi memoria company-info).
const COMPANY = {
  name: "4 bid srl",
  address: "Via Sorripa, 10 - 50026 - San Casciano in Val di Pesa (FI)",
  vat: "06241710489",
  site: "www.santaddeo.com",
}

export interface SellerSignature {
  name?: string | null
  email?: string | null
  /** Alias del venditore sul dominio santaddeo.com (es. n.cognome@santaddeo.com). */
  aliasEmail?: string | null
  phone?: string | null
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/**
 * Blocco firma del venditore. Ritorna stringa vuota se non c'e' nulla da
 * mostrare (ne' nome ne' email ne' telefono).
 */
function renderSignature(sig?: SellerSignature | null): string {
  if (!sig) return ""
  const name = (sig.name || "").trim()
  const email = (sig.email || "").trim()
  const aliasEmail = (sig.aliasEmail || "").trim()
  const phone = (sig.phone || "").trim()
  if (!name && !email && !aliasEmail && !phone) return ""

  const lines: string[] = []
  if (name) {
    lines.push(
      `<div style="font-weight:600;color:#0f172a;font-size:14px">${esc(name)}</div>`,
    )
  }
  lines.push(
    `<div style="color:#64748b;font-size:13px">Consulente SANTADDEO</div>`,
  )
  const contacts: string[] = []
  if (email) {
    contacts.push(
      `<a href="mailto:${esc(email)}" style="color:#0d9488;text-decoration:none">${esc(email)}</a>`,
    )
  }
  // Alias santaddeo.com (mostrato solo se diverso dall'email personale).
  if (aliasEmail && aliasEmail.toLowerCase() !== email.toLowerCase()) {
    contacts.push(
      `<a href="mailto:${esc(aliasEmail)}" style="color:#0d9488;text-decoration:none">${esc(aliasEmail)}</a>`,
    )
  }
  if (phone) {
    const telHref = phone.replace(/[^\d+]/g, "")
    contacts.push(
      `<a href="tel:${esc(telHref)}" style="color:#0d9488;text-decoration:none">${esc(phone)}</a>`,
    )
  }
  if (contacts.length) {
    lines.push(
      `<div style="color:#64748b;font-size:13px;margin-top:4px">${contacts.join(
        ' <span style="color:#cbd5e1">&middot;</span> ',
      )}</div>`,
    )
  }

  return (
    `<tr><td style="padding:20px 32px 0 32px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">` +
    `<tr><td style="padding-top:16px">${lines.join("")}</td></tr>` +
    `</table></td></tr>`
  )
}

/**
 * Avvolge `bodyHtml` nel layout brandizzato SANTADDEO.
 *
 * @param bodyHtml  HTML del corpo (gia' formattato dal chiamante)
 * @param signature firma venditore opzionale (nome/email/cellulare)
 * @param preheader testo di anteprima opzionale (nascosto, mostrato dai client)
 */
export function renderSantaddeoEmail(args: {
  bodyHtml: string
  signature?: SellerSignature | null
  preheader?: string
}): string {
  const { bodyHtml, signature, preheader } = args

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(
          preheader,
        )}</div>`
      : ""
  }
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">

<!-- Header: logo SANTADDEO -->
<tr><td style="padding:28px 32px 8px 32px" align="left">
<img src="${LOGO_SANTADDEO}" alt="SANTADDEO" height="40" style="height:40px;width:auto;display:block;border:0" />
</td></tr>

<!-- Corpo -->
<tr><td style="padding:8px 32px 4px 32px;color:#0f172a;font-size:15px;line-height:1.6">
${bodyHtml}
</td></tr>

<!-- Firma venditore -->
${renderSignature(signature)}

<!-- Footer: dati 4 bid + logo mignon -->
<tr><td style="padding:24px 32px 28px 32px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0">
<tr><td style="padding-top:16px" valign="middle">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td valign="middle" style="padding-right:10px">
<img src="${LOGO_4BID}" alt="4 bid srl" height="24" style="height:24px;width:auto;display:block;border:0" />
</td>
<td valign="middle" style="color:#94a3b8;font-size:11px;line-height:1.5">
<strong style="color:#64748b">${COMPANY.name}</strong> &middot; ${COMPANY.address}<br/>
P.IVA ${COMPANY.vat} &middot; <a href="${SITE_URL}" style="color:#94a3b8;text-decoration:none">${COMPANY.site}</a>
</td>
</tr></table>
</td></tr>
</table>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
