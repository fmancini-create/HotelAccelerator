import { NextResponse } from "next/server"

// POST - render email preview with branded template
export async function POST(req: Request) {
  const { subject, body_html, cta_text, cta_url } = await req.json()

  const ctaBlock = cta_text && cta_url ? `
    <tr>
      <td align="center" style="padding: 24px 0;">
        <a href="${cta_url}" target="_blank" style="
          display: inline-block;
          background-color: #1e40af;
          color: #ffffff;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
          padding: 14px 32px;
          border-radius: 8px;
          letter-spacing: 0.025em;
        ">${cta_text}</a>
      </td>
    </tr>
  ` : ""

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject || "Preview"}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6;">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
          
          <!-- Header -->
          <tr>
            <td style="
              background: linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%);
              padding: 32px 40px;
              border-radius: 12px 12px 0 0;
              text-align: center;
            ">
              <h1 style="
                margin: 0;
                color: #ffffff;
                font-size: 28px;
                font-weight: 700;
                letter-spacing: 0.05em;
              ">SANTADDEO</h1>
              <p style="
                margin: 6px 0 0;
                color: rgba(255,255,255,0.8);
                font-size: 13px;
                letter-spacing: 0.1em;
                text-transform: uppercase;
              ">Revenue Management Intelligence</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="
              background-color: #ffffff;
              padding: 40px;
              font-size: 15px;
              line-height: 1.7;
              color: #1f2937;
            ">
              ${body_html || "<p>Contenuto dell'email...</p>"}
            </td>
          </tr>

          <!-- CTA -->
          ${ctaBlock}

          <!-- Footer -->
          <tr>
            <td style="
              background-color: #f9fafb;
              padding: 24px 40px;
              border-radius: 0 0 12px 12px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
            ">
              <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px;">
                SANTADDEO - Revenue Management per Hotel
              </p>
              <p style="margin: 0 0 8px; color: #9ca3af; font-size: 11px;">
                Questa email e' stata inviata da SANTADDEO Platform.
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                <a href="{{unsubscribe_url}}" style="color: #6b7280; text-decoration: underline;">Cancella iscrizione</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return NextResponse.json({ html })
}
