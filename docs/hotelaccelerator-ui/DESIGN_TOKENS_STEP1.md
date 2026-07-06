# HotelAccelerator — Design Tokens (Step 1)

> Step **additivo** e a bassissimo rischio. Definisce SOLO i design token
> comuni della suite madre HotelAccelerator. NON rifà la dashboard, NON
> trasforma la UI, NON sostituisce `PlatformShell`. Riferimenti: piano
> `HOTELACCELERATOR_APPSHELL_UI_PLAN.md` + audit visivo Santaddeo.

## Principi

- **Namespace dedicato `--ha-*`**: tutti i nuovi token vivono sotto il prefisso
  `--ha-` per non collidere con i token shadcn esistenti (`--primary`,
  `--background`, `--chart-*`, `--sidebar-*`, ecc.), che restano **intatti**.
- **Additivo**: nessun token esistente è stato modificato o rimosso. Nessuna
  classe di componente è stata cambiata. Impatto visivo atteso: **nullo**
  (i token non sono ancora applicati da nessuna parte).
- **Light + Dark**: ogni token ha un valore in `:root` e in `.dark`, coerente
  con la dark mode già presente.
- **Tailwind v4**: i token sono mappati in `@theme inline` come `--color-ha-*`,
  quindi disponibili come utility (`bg-ha-brand`, `text-ha-success`,
  `border-ha-border`, `bg-ha-module-revenue`, `fill-ha-chart-1`, ecc.).
- **Colore**: palette contenuta, semantica chiara, nessun viola/violetto
  prominente (coerente con le linee guida). Il "premium/accelerator" usa un
  oro/champagne, adatto al contesto hotellerie.

## Token set

### Brand
| Token | Utility esempio | Uso |
|---|---|---|
| `--ha-brand` / `--ha-brand-foreground` | `bg-ha-brand text-ha-brand-foreground` | Brand primario suite |
| `--ha-brand-secondary` / `-foreground` | `bg-ha-brand-secondary` | Brand secondario / slate |

### Semantici / stato
| Token | Significato |
|---|---|
| `--ha-success` (+ `-foreground`) | Operational / success (verde) |
| `--ha-premium` (+ `-foreground`) | Premium / accelerator (oro) |
| `--ha-info` (+ `-foreground`) | Info / CTA (blu) |
| `--ha-warning` (+ `-foreground`) | Warning (ambra) |
| `--ha-error` (+ `-foreground`) | Error (rosso) |

### Superfici
| Token | Uso |
|---|---|
| `--ha-surface` / `--ha-surface-foreground` | Sfondo sezione |
| `--ha-surface-muted` | Sfondo attenuato |
| `--ha-card` / `--ha-card-foreground` | Card |
| `--ha-border` | Bordo |

### Chart base
`--ha-chart-1` … `--ha-chart-6` — palette grafici coerente con la suite
(distinta da `--chart-1..5` di shadcn, che resta invariata).

### Moduli
| Token | Modulo |
|---|---|
| `--ha-module-revenue` (+ `-foreground`) | Revenue / Santaddeo |
| `--ha-module-maintenance` (+ `-foreground`) | Manutenzioni / ManuBot |
| `--ha-module-profit` (+ `-foreground`) | Profit & Finance / HotelProfitAI |
| `--ha-module-crm` (+ `-foreground`) | CRM & Inbox |
| `--ha-module-marketing` (+ `-foreground`) | Marketing / Siti |
| `--ha-module-automation` (+ `-foreground`) | Automazioni |

## Come usarli (Step 2+)

I token sono già utilizzabili come utility Tailwind, ad esempio:

```tsx
<span className="rounded-md bg-ha-module-revenue/10 text-ha-module-revenue px-2 py-0.5">
  Revenue
</span>
<div className="border border-ha-border bg-ha-card text-ha-card-foreground">…</div>
```

Non sono ancora applicati a componenti esistenti: l'adozione avverrà nei
prossimi micro-step, in modo controllato e reversibile.

## Cosa NON è stato toccato

DB, API, auth, routing, Stripe, Gmail, ManuBot webhook, Scidoo/PMS, Supabase,
logica moduli, permessi, `PlatformShell`, dashboard legacy, componenti.
Solo `app/globals.css` (token additivi) e questo documento.
