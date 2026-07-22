// Security: uses cookie-based auth client (respects RLS) for the main flow,
// + an explicit service-role client SOLO per leggere lo schema `connectors`
// (vedi BUG FIX 14/05/2026 piu' sotto). L'accesso al hotel viene validato a
// monte da validateHotelAccess.
import { NextResponse } from "next/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"
import { fetchAllPaginatedOrLog } from "@/lib/supabase/paginate"
import { OPERATIONAL_SOURCES, FISCAL_SOURCES } from "@/lib/services/production-metrics.service"
import { toVatConfig, netFromGross, resolveVatConfig, parseVatViewParam } from "@/lib/utils/vat-display"
import { measureRoute } from "@/lib/performance/with-perf"

export const dynamic = "force-dynamic"
export const revalidate = 0

async function q(supabase: any, table: string, filters: Record<string, any>, select = "*"): Promise<any[]> {
  let query = supabase.from(table).select(select)
  for (const [key, val] of Object.entries(filters)) {
    if (key.endsWith("_gte")) query = query.gte(key.replace("_gte", ""), val)
    else if (key.endsWith("_lte")) query = query.lte(key.replace("_lte", ""), val)
    else if (key.endsWith("_gt")) query = query.gt(key.replace("_gt", ""), val)
    else if (key.endsWith("_neq")) query = query.neq(key.replace("_neq", ""), val)
    else query = query.eq(key, val)
  }
  const { data, error } = await query
  if (error) { console.error(`[production] q error ${table}:`, error.message); return [] }
  return data || []
}

async function qSingle(supabase: any, table: string, filters: Record<string, any>, select = "*"): Promise<any | null> {
  const rows = await q(supabase, table, filters, select)
  return rows?.[0] ?? null
}

// Local alias preserving the existing callsite API (7 calls below use
// `await fetchAllRows(() => q)` and expect T[] back).
const fetchAllRows = <T = any>(queryBuilder: () => any, pageSize = 1000) =>
  fetchAllPaginatedOrLog<T>(queryBuilder, "production", { pageSize })

// 14/07/2026: strumentata per la dashboard /admin/performance.
export const GET = measureRoute("/api/dashboard/production", handleGET as any)

async function handleGET(request: Request) {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id")
  const dateParam = searchParams.get("date")
  const vatView = parseVatViewParam(searchParams) // override vista netto/lordo (null = default tenant)

  if (!hotelId) return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })

  // BUG FIX 14/05/2026: validateHotelAccess mancava completamente. Senza,
  // qualsiasi utente autenticato poteva richiedere KPI di hotel a cui non
  // aveva accesso semplicemente passando ?hotel_id=<uuid>. Lo facciamo
  // adesso, passando `user` preautenticato per evitare il doppio
  // auth.getUser() (pattern PERF 03/05/2026).
  const denied = await validateHotelAccess(hotelId, user as any, { allowSeller: "metrics" })
  if (denied) return denied

  // BUG FIX 14/05/2026 (incident "Produzione Fiscale - dati per reparto non
  // disponibili in PROD"). In dev getAuthUserOrDev ritorna un client
  // service-role (bypassa RLS), in prod ritorna un client cookie-bound.
  // Lo schema `connectors` non ha policy RLS pensate per il flow
  // dashboard -> le 2 query qui sotto ritornavano [] in prod, e la route
  // cadeva nel branch daily_production che NON popola departmentBreakdown.
  // Sintomo: in dev breakdown completo (Pernottamenti €51k, F&B €9k, ...),
  // in prod tooltip "Dati per reparto non disponibili".
  // Stesso pattern gia' applicato alle bande Last Minute (vedi MEMORY.md
  // del 13/05). L'accesso e' gia' protetto da validateHotelAccess sopra,
  // quindi service-role e' sicuro.
  const connectorsClient = await createServiceRoleClient()

  const selectedDate = dateParam || new Date().toLocaleDateString("sv-SE")
  const today = new Date().toLocaleDateString("sv-SE")
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("sv-SE")
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const fiscalStartDate = threeMonthsAgo.toLocaleDateString("sv-SE")
  const monthlyFiscalEndDate = today

  try {
    const [pmsConfig, hotelInfo, activeRoomTypeRows] = await Promise.all([
      qSingle(supabase, "pms_integrations", { hotel_id: hotelId, is_active: true }, "integration_mode,pms_name"),
      qSingle(supabase, "hotels", { id: hotelId }, "total_rooms,accommodation_type,revenue_vat_mode,accommodation_vat_rate"),
      q(supabase, "room_types", { hotel_id: hotelId, is_active: true }, "name"),
    ])

    const accommodationType = hotelInfo?.accommodation_type || "camere"
    const activeRoomTypeNames = new Set((activeRoomTypeRows || []).map((r: any) => r.name as string))

    // Visualizzazione IVA (preferenza tenant). Gli importi camera (room-based)
    // sono LORDI -> scorporo con aliquota alloggio in modalità "excluded".
    // La produzione fiscale ha invece il LORDO certo (totale documento) e il
    // NETTO certo (somma account_revenues) per documento: la scelta gross/net
    // avviene a monte in processFiscalRows, senza stimare aliquote.
    const vatCfg = resolveVatConfig(toVatConfig(hotelInfo?.revenue_vat_mode, hotelInfo?.accommodation_vat_rate), vatView)
    const vatExcluded = vatCfg.mode === "excluded"
    // Scorporo room-based (aliquota alloggio).
    const roomNet = (v: number) => (vatExcluded ? netFromGross(v, vatCfg.accommodationRate) : v)

    let monthTotalProduction = 0
    let todayProduction = 0
    let dailyProduction = 0
    let directRevenue = 0
    let intermediatedRevenue = 0
    let fiscalSource = "none"
    let departmentBreakdown: Record<string, number> = {}
    let todayDepartmentBreakdown: Record<string, number> = {}
    let todayDocumentTypes: Record<string, { count: number; total: number }> = {}
    let monthDocumentTypes: Record<string, { count: number; total: number; taxable: number }> = {}
    let skippedUnmapped = 0
    let skippedNoDailyPrice = 0
    let todayRevByName: Record<string, number> = {}
    let todayBookingDetails: Array<{ id: string; rtName: string; rev: number; dailyPriceKeys: string[] }> = []

    // CRITICAL: must paginate — Supabase default limit is 1000 rows
    // Hotels can have thousands of active bookings in a month
    //
    // QUERY LOGIC — ACCRUAL (overlap), NOT cassa (checkout nel mese):
    //   checkin_date <= fine_mese AND checkout_date >= inizio_mese AND status != 'annullata'
    //
    // This includes bookings whose stay overlaps the month, even if checkout is in the
    // following month. Revenue is then summed only for nights WITHIN the month.
    //
    // This differs from the Scidoo PDF (Produzione Lorda per Camera) which counts only
    // bookings with checkout_date IN the month (cassa realizzata).
    //
    // Comparison vs PDF (post FIX 1 + FIX 2, verified 2026-04-16):
    //   Dashboard (accrual, netto sconti):   Jan +13.2%  Feb +15.9%  Mar +9.8%  vs PDF
    //   Checkout-in-month (netto sconti):    Jan  +4.8%  Feb  +3.6%  Mar +1.9%  vs PDF
    //
    // The checkout-in-month metric is the correct one for PDF comparison.
    // The dashboard shows accrual because it is more useful for in-month monitoring
    // (includes revenue from active stays that haven't checked out yet).
    //
    // FIX 1 (2026-04): phantom bookings (raw_data.status=annullata promoted to confermata
    // by downgrade protection logic) removed from DB and prevented by trigger
    // trg_prevent_phantom_promotion. See scidoo_raw_bookings_backup_fix1 for rollback.
    //
    // FIX 2 (2026-04): daily_price is gross of discounts. Sconti and Servizio Nota
    // extras with negative price are subtracted pro-rata per night to produce net revenue.
    const rawBks = await fetchAllRows(() =>
      supabase
        .from("scidoo_raw_bookings")
        .select("scidoo_booking_id,room_type_name,room_type_code,checkin_date,checkout_date,status,raw_data")
        .eq("hotel_id", hotelId)
        .neq("status", "annullata")
        .lte("checkin_date", monthlyFiscalEndDate)
        .gte("checkout_date", firstDayOfMonth)
    )

    // Box 6: roomProductionToday from rms_daily_room_revenue
    let roomProductionToday = 0
    const rmsRevToday = await fetchAllRows(() =>
      supabase
        .from("rms_daily_room_revenue")
        .select("room_revenue")
        .eq("hotel_id", hotelId)
        .eq("date", selectedDate)
    )

    if (rmsRevToday.length > 0) {
      roomProductionToday = rmsRevToday.reduce(
        (s: number, r: any) => s + Number(r.room_revenue || 0),
        0
      )
    }

    if (rawBks.length > 0) {
      const scidooIdToName: Record<string, string> = {}
      const roomTypesWithScidooId = await q(supabase, "room_types", { hotel_id: hotelId }, "scidoo_room_type_id,pms_room_type_id,name")
      for (const rt of roomTypesWithScidooId || []) {
        if (rt.scidoo_room_type_id) scidooIdToName[String(rt.scidoo_room_type_id)] = rt.name
      }

      const monthRevByName: Record<string, number> = {}
      let monthTotal = 0
      let todayTotal = 0

      for (const bk of rawBks) {
        let rtName: string = bk.room_type_name || "Sconosciuto"
        if (!bk.room_type_name && bk.room_type_code) {
          rtName = scidooIdToName[String(bk.room_type_code)] || "Sconosciuto"
        }
        if (rtName === "Sconosciuto" && bk.raw_data?.room_type_id) {
          const pmsRtId = String(bk.raw_data.room_type_id)
          for (const rt of roomTypesWithScidooId || []) {
            if (rt.pms_room_type_id === pmsRtId || rt.scidoo_room_type_id === pmsRtId) {
              rtName = rt.name
              break
            }
          }
        }
        if (!activeRoomTypeNames.has(rtName)) {
          // Bookings with unknown or inactive room type -- skip from per-room breakdown.
          // Their revenue still counts in the hotel-level totals (daily_production).
          skippedUnmapped++
          continue
        }
        const dailyPrice: Record<string, string | number> = bk.raw_data?.daily_price || {}
        if (Object.keys(dailyPrice).length === 0) {
          skippedNoDailyPrice++
        }

        // FIX 2 (2026-04): Subtract discount extras from daily_price revenue.
        // Scidoo reports daily_price GROSS of discounts. The PDF Pernottamento
        // column is net of discounts. Categories to subtract:
        //   - "Sconti": standard discounts applied at booking level
        //   - "Servizio Nota / Addebito Libero": manual note/free charge entries with negative price
        // We distribute the total discount proportionally across all daily_price nights
        // (pro-rata by weight) so per-date and per-room-type figures are correct.
        const extras: any[] = Array.isArray(bk.raw_data?.extras) ? bk.raw_data.extras : []
        const totalDiscount = extras.reduce((sum: number, ex: any) => {
          const price = Number(ex.price) || 0
          if (price >= 0) return sum
          const cat: string = String(ex.category || "").toLowerCase()
          const desc: string = String(ex.description || "").toLowerCase()
          const isDiscount =
            cat.includes("sconti") ||
            cat.includes("servizio nota") ||
            desc.includes("sconto") ||
            desc.includes("addebito libero")
          return isDiscount ? sum + price : sum
        }, 0)

        // Pro-rata discount per night: weight each date by its share of total daily_price
        const dpValues = Object.values(dailyPrice).map((v) => Number(v) || 0)
        const dpTotal = dpValues.reduce((s, v) => s + (v > 0 ? v : 0), 0)
        const dpEntries = Object.entries(dailyPrice)

        for (const [dateKey, val] of dpEntries) {
          const grossRev = Number(val) || 0
          if (grossRev <= 0) continue
          const dateStr = dateKey.includes("/")
            ? dateKey.split("/").reverse().join("-")
            : dateKey

          // Apply pro-rata discount for this night
          const discountShare = dpTotal > 0 ? (grossRev / dpTotal) * totalDiscount : 0
          const rev = grossRev + discountShare // discountShare is negative

          if (dateStr >= firstDayOfMonth && dateStr <= monthlyFiscalEndDate) {
            monthRevByName[rtName] = (monthRevByName[rtName] || 0) + rev
            monthTotal += rev
          }
          if (dateStr === selectedDate) {
            todayRevByName[rtName] = (todayRevByName[rtName] || 0) + rev
            todayTotal += rev
            todayBookingDetails.push({
              id: bk.scidoo_booking_id,
              rtName,
              rev,
              dailyPriceKeys: Object.keys(dailyPrice),
            })
          }
        }
      }

      if (monthTotal > 0) {
        monthTotalProduction = monthTotal
        directRevenue = monthTotal
        fiscalSource = "scidoo_raw_bookings_daily_price"
        // FIX 01/05/2026 (post-incident "Produzione Fiscale Oggi €0 con
        // breakdown per camere"): NON popolare departmentBreakdown /
        // todayDepartmentBreakdown da scidoo_raw_bookings + daily_price.
        // Quei breakdown sono "Produzione Camere stimata" (per room_type),
        // NON "Produzione Fiscale per reparto". Mescolarli faceva apparire i
        // nomi delle camere (Tuscan Style, Suite, ...) sotto la voce
        // "PER REPARTO" del KPI fiscale, con un totale incoerente (KPI €0
        // mentre le righe sommavano ~€2k). Per la regola "Produzione Fiscale
        // SOLO nei box 4 e 5", i breakdown vanno popolati esclusivamente da
        // rms_department_revenue o connectors.scidoo_raw_fiscal_production.
      }
    }

    const { data: deptMonth } = await supabase
      .from("rms_department_revenue")
      .select("department_name,revenue,document_type,document_count,taxable_amount")
      .eq("hotel_id", hotelId)
      .gte("date", fiscalStartDate)
      .lte("date", monthlyFiscalEndDate)
    const { data: deptDay } = await supabase
      .from("rms_department_revenue")
      .select("department_name,revenue,document_type,document_count,taxable_amount")
      .eq("hotel_id", hotelId)
      .eq("date", selectedDate)
    const deptMonthRows = deptMonth || []
    const deptDayRows = deptDay || []

    // Helper to process raw fiscal documents from connectors schema.
    // VAT-aware: per ogni documento il NETTO (imponibile) e' la somma
    // `account_revenues.value`, e il LORDO e' imponibile + imposta =
    // Σ`account_revenues.value` + Σ`account_revenues.tax`. Entrambi sono dati
    // CERTI del gestionale. In modalità "excluded" usiamo il netto; in
    // "included" il lordo.
    //
    // FIX 04/07/2026 (riconciliazione Scidoo giugno): il LORDO NON e' piu'
    // `doc.total`. `doc.total` SOVRASTIMA perche' le FATTURE DI SALDO di acconti
    // gia' incassati portano il totale pieno del documento mentre il ricavo era
    // gia' stato riconosciuto all'incasso dell'acconto -> giugno dava 210.092
    // vs Scidoo 202.214 (+7.878, ~3,9%). Scidoo stesso in vista Documenti mostra
    // Totale mensile = imponibile + imposta (= la nostra base netto+imposta).
    // Su periodi SENZA saldi acconti doc.total == netto+imposta al centesimo
    // (luglio/oggi verificati identici), quindi nessuna regressione. Fallback a
    // doc.total solo se il documento non ha righe account_revenues.
    const processFiscalRows = (rows: any[]) => {
      let total = 0
      const depts: Record<string, number> = {}
      const docTypes: Record<string, { count: number; total: number; taxable: number }> = {}
      for (const row of rows) {
        const documents = row.raw_data?.documents || []
        const rowTotal = Number(row.total_revenue || 0)
        if (documents.length > 0) {
          for (const doc of documents) {
            if (doc.type === "deposit" || doc.type === "suspended_invoice") continue
            const ars = doc.account_revenues || []
            let taxable = 0
            let docTax = 0
            for (const ar of ars) {
              taxable += Number(ar.value) || 0
              docTax += Number(ar.tax) || 0
            }
            // LORDO certo = imponibile + imposta (Σ account_revenues). Fallback a
            // doc.total solo per documenti privi di righe di ricavo.
            const withVat = ars.length > 0 ? taxable + docTax : Number(doc.total) || 0
            // Fattore lordo/netto del documento (per allocare il LORDO ai reparti,
            // solo in modalita' "included"/lordo).
            const grossFactor = taxable > 0 ? withVat / taxable : 1
            // Etichetta reparto CERTA: le righe Scidoo con `code:0` e nome vuoto
            // sono ACCONTI scomputati (caparre detratte in fattura, valori
            // negativi). Vanno isolate come "Acconti" (come fa Scidoo) invece di
            // finire in "Non Classificato". NON cambia il totale, solo il dettaglio.
            const deptLabel = (ar: any): string => {
              if (ar.name) return ar.name
              if (String(ar.code ?? "") === "0") return "Acconti"
              return "Non Classificato"
            }
            if (ars.length > 0) {
              if (vatExcluded) {
                // NETTO = imponibile CERTO per reparto: somma `account_revenues`
                // riga per riga, qualunque sia l'aliquota (10/22/esente) e
                // INCLUSE le righe negative (storni/note di credito). Mai
                // scorporo ÷aliquota su un totale misto.
                for (const ar of ars) {
                  const net = Number(ar.value) || 0
                  const k = deptLabel(ar)
                  depts[k] = (depts[k] || 0) + net
                }
              } else if (taxable > 0) {
                // LORDO: ripartisce il lordo del documento sui reparti in
                // proporzione all'imponibile.
                for (const ar of ars) {
                  const net = Number(ar.value) || 0
                  const k = deptLabel(ar)
                  depts[k] = (depts[k] || 0) + net * grossFactor
                }
              } else if (withVat !== 0) {
                // Lordo con imponibile complessivo <=0 (storni): nessuna
                // ripartizione proporzionale possibile -> Fatturato Generale.
                depts["Fatturato Generale"] = (depts["Fatturato Generale"] || 0) + withVat
              }
            } else if (!vatExcluded && withVat !== 0) {
              // Nessun dettaglio reparto (es. solo imposta di soggiorno): in LORDO
              // l'importo va in "Fatturato Generale". In NETTO non esiste alcun
              // imponibile certo -> contributo 0 (non si stima nulla).
              depts["Fatturato Generale"] = (depts["Fatturato Generale"] || 0) + withVat
            }
            // Totale documento: NETTO = imponibile certo (somma account_revenues,
            // anche negativo); LORDO = imponibile + imposta (vedi withVat sopra).
            total += vatExcluded ? taxable : withVat
            const dt = doc.type || "invoice"
            if (!docTypes[dt]) docTypes[dt] = { count: 0, total: 0, taxable: 0 }
            docTypes[dt].count++
            docTypes[dt].total += withVat
            docTypes[dt].taxable += taxable
          }
        } else if (rowTotal > 0) {
          // Solo total_revenue di riga (no documenti dettagliati): è LORDO.
          // In excluded scorporiamo con l'aliquota alloggio (best-effort certo:
          // è l'unica aliquota nota a livello aggregato).
          const shown = roomNet(rowTotal)
          total += shown
          depts["Fatturato Generale"] = (depts["Fatturato Generale"] || 0) + shown
        }
      }
      return { total, depts, docTypes }
    }

    // FIX 01/05/2026: month e today vanno cercati INDIPENDENTEMENTE nelle
    // fonti fiscali. Prima il fallback connectors.scidoo_raw_fiscal_production
    // veniva tentato per `today` solo se `rms_department_revenue` era vuoto
    // anche per il MESE. Sintomo Barronci: mese aveva dati in
    // rms_department_revenue (KPI €128k OK) ma `today` era vuoto in entrambe
    // le tabelle e mai cercato in connectors -> KPI 0 e popover popolato dal
    // residuo room production.
    //
    // ----- MONTH ----- (priority: rms_department_revenue > connectors)
    if (deptMonthRows.length > 0) {
      departmentBreakdown = {}
      monthDocumentTypes = {}
      let deptTotal = 0
      for (const r of deptMonthRows) {
        const dept = r.department_name || "Non Classificato"
        const grossRev = Number(r.revenue || 0)
        const netRev = Number(r.taxable_amount || 0)
        // included -> lordo (revenue); excluded -> netto (taxable_amount) se
        // presente, altrimenti scorporo con aliquota alloggio.
        const rev = vatExcluded ? (netRev > 0 ? netRev : roomNet(grossRev)) : grossRev
        departmentBreakdown[dept] = (departmentBreakdown[dept] || 0) + rev
        deptTotal += rev
        if (r.document_type) {
          if (!monthDocumentTypes[r.document_type]) monthDocumentTypes[r.document_type] = { count: 0, total: 0, taxable: 0 }
          monthDocumentTypes[r.document_type].count += Number(r.document_count || 1)
          monthDocumentTypes[r.document_type].total += grossRev
          monthDocumentTypes[r.document_type].taxable += netRev
        }
      }
      if (deptTotal > 0) {
        monthTotalProduction = deptTotal
        directRevenue = deptTotal
        fiscalSource = "rms_department_revenue"
      }
    } else {
      // service-role per leggere lo schema `connectors` (vedi commento in
      // testa al file). Accesso al hotel gia' validato.
      const fiscalMonthResult = await connectorsClient.schema("connectors").from("scidoo_raw_fiscal_production")
        .select("date,raw_data,total_revenue")
        .eq("hotel_id", hotelId)
        .gte("date", firstDayOfMonth)
        .lte("date", monthlyFiscalEndDate)

      if (!fiscalMonthResult.error && fiscalMonthResult.data?.length) {
        const { total, depts, docTypes } = processFiscalRows(fiscalMonthResult.data)
        if (total > 0) {
          monthTotalProduction = total
          directRevenue = total
          departmentBreakdown = depts
          monthDocumentTypes = docTypes
          fiscalSource = "connectors.scidoo_raw_fiscal_production"
        }
      }
    }

    // ----- TODAY ----- (priority: rms_department_revenue > connectors)
    if (deptDayRows.length > 0) {
      todayDepartmentBreakdown = {}
      todayDocumentTypes = {}
      let deptTodayTotal = 0
      for (const r of deptDayRows) {
        const dept = r.department_name || "Non Classificato"
        const rev = Number(r.revenue || 0)
        todayDepartmentBreakdown[dept] = (todayDepartmentBreakdown[dept] || 0) + rev
        deptTodayTotal += rev
        if (r.document_type) {
          if (!todayDocumentTypes[r.document_type]) todayDocumentTypes[r.document_type] = { count: 0, total: 0 }
          todayDocumentTypes[r.document_type].count += Number(r.document_count || 1)
          todayDocumentTypes[r.document_type].total += rev
        }
      }
      if (deptTodayTotal > 0) {
        todayProduction = deptTodayTotal
        dailyProduction = deptTodayTotal
      }
    } else {
      // service-role per leggere lo schema `connectors`
      const fiscalTodayResult = await connectorsClient.schema("connectors").from("scidoo_raw_fiscal_production")
        .select("raw_data,total_revenue")
        .eq("hotel_id", hotelId)
        .eq("date", selectedDate)

      if (!fiscalTodayResult.error && fiscalTodayResult.data?.length) {
        const { total, depts, docTypes } = processFiscalRows(fiscalTodayResult.data)
        if (total > 0) {
          todayProduction = total
          dailyProduction = total
          todayDepartmentBreakdown = depts
          todayDocumentTypes = Object.fromEntries(
            Object.entries(docTypes).map(([k, v]) => [k, { count: v.count, total: v.total }])
          )
        }
      }
    }

    if (monthTotalProduction === 0) {
      // FIX 13/05/2026 (bonifica source-mista daily_production):
      // questo branch e' l'ULTIMO fallback per la Produzione Fiscale Mese quando
      // rms_department_revenue e connectors.scidoo_raw_fiscal_production sono vuoti.
      // Prima sommava `total_revenue` su TUTTE le righe daily_production senza
      // filtro source -> rischio double-count se un giorno e' popolato sia da
      // sync operativo (es. scidoo_raw_bookings) che da sync fiscale (scidoo_fiscal).
      //
      // Regola: preferiamo le righe OPERATIVE come prima scelta (e' la Produzione
      // Fiscale di backup); usiamo le FISCALI solo se nessuna operativa esiste.
      // Costanti importate dall'helper centralizzato (single source of truth).

      const { data: dpMonth } = await supabase
        .from("daily_production")
        .select("date,total_revenue,adr,occupancy_rate,source")
        .eq("hotel_id", hotelId)
        .gte("date", firstDayOfMonth)
        .lte("date", monthlyFiscalEndDate)
      const dpRows = (dpMonth || []) as Array<{ date: string; total_revenue: number | string | null; source: string | null }>

      if (dpRows.length > 0) {
        const opRows = dpRows.filter((r) => OPERATIONAL_SOURCES.has(r.source ?? ""))
        const fiscalRows = dpRows.filter((r) => FISCAL_SOURCES.has(r.source ?? ""))
        // Per ogni giorno: se esiste una riga operativa la preferiamo, altrimenti
        // usiamo la fiscale. Evita di sommare due rappresentazioni dello stesso giorno.
        const byDate = new Map<string, number>()
        for (const r of opRows) {
          const rev = Number(r.total_revenue || 0)
          if (rev > 0) byDate.set(r.date, rev)
        }
        for (const r of fiscalRows) {
          if (byDate.has(r.date)) continue
          const rev = Number(r.total_revenue || 0)
          if (rev > 0) byDate.set(r.date, rev)
        }
        const totalGross = Array.from(byDate.values()).reduce((s, v) => s + v, 0)
        const total = roomNet(totalGross)
        if (total > 0) {
          monthTotalProduction = total
          directRevenue = total
          fiscalSource = "daily_production"
          console.log("[dashboard-production] daily_production fallback", {
            hotel_id: hotelId,
            period: `${firstDayOfMonth}..${monthlyFiscalEndDate}`,
            total_rows: dpRows.length,
            operational_rows: opRows.length,
            fiscal_rows: fiscalRows.length,
            distinct_days: byDate.size,
            total_revenue: total,
          })
        }
      }

      // Today: stesso pattern (operativa preferita, fiscale fallback).
      const dpTodayRows = await q(
        supabase,
        "daily_production",
        { hotel_id: hotelId, date: selectedDate },
        "total_revenue,adr,source",
      )
      if (dpTodayRows.length > 0) {
        const opToday = dpTodayRows.find((r: any) => OPERATIONAL_SOURCES.has(r.source ?? ""))
        const fiscalToday = dpTodayRows.find((r: any) => FISCAL_SOURCES.has(r.source ?? ""))
        const picked = opToday ?? fiscalToday
        if (picked) {
          todayProduction = roomNet(Number(picked.total_revenue || 0))
          dailyProduction = todayProduction
        }
      }
    }

    // FIX 21/05/2026 — Fallback PMS-agnostico da `bookings`.
    // Tutti i fallback sopra leggono da fonti Scidoo (`scidoo_raw_bookings`,
    // `rms_department_revenue`, `connectors.scidoo_raw_fiscal_production`,
    // `daily_production`). Per PMS che non espongono il fiscale (es. BRiG)
    // queste tabelle non vengono mai popolate, quindi `monthTotalProduction`
    // e `todayProduction` restavano a 0 anche con migliaia di booking
    // perfettamente sincronizzati in `public.bookings`. Risultato visibile a
    // schermo: Cavallino con 3075 booking ma RevPOR/RevPAR/Produzione tutti 0.
    //
    // Strategia: distribuiamo `total_price` di ogni booking pro-rata per
    // notte sulle date di soggiorno e sommiamo le notti che cadono nella
    // finestra. E' lo stesso schema usato sopra per scidoo_raw_bookings con
    // `daily_price`, applicato qui ai dati gia' aggregati in `bookings`.
    // Si attiva SOLO se le fonti fiscali specifiche non hanno prodotto nulla,
    // quindi non altera il comportamento per Scidoo (che ha sempre dati
    // fiscali piu' precisi e prevale a monte).
    if (monthTotalProduction === 0) {
      const bookingMonth = await fetchAllRows<any>(() =>
        supabase
          .from("bookings")
          .select("check_in_date,check_out_date,total_price,number_of_nights,is_cancelled,is_room_booking")
          .eq("hotel_id", hotelId)
          .eq("is_cancelled", false)
          .eq("is_room_booking", true)
          .lte("check_in_date", monthlyFiscalEndDate)
          .gte("check_out_date", firstDayOfMonth),
      )
      let monthFromBookings = 0
      for (const b of bookingMonth) {
        const nights = Number(b.number_of_nights || 0)
        if (nights <= 0) continue
        const ppn = Number(b.total_price || 0) / nights
        if (!Number.isFinite(ppn) || ppn <= 0) continue
        // Conta SOLO le notti che cadono nella finestra del mese (accrual).
        const ci = new Date(b.check_in_date)
        const co = new Date(b.check_out_date)
        const winStart = new Date(firstDayOfMonth)
        const winEnd = new Date(monthlyFiscalEndDate)
        const start = ci > winStart ? ci : winStart
        // co e' esclusivo (checkout day non e' una notte di soggiorno).
        const endExcl = co
        const winEndIncl = new Date(winEnd)
        winEndIncl.setDate(winEndIncl.getDate() + 1)
        const end = endExcl < winEndIncl ? endExcl : winEndIncl
        const nightsInWindow = Math.max(
          0,
          Math.round((end.getTime() - start.getTime()) / 86_400_000),
        )
        monthFromBookings += ppn * nightsInWindow
      }
      if (monthFromBookings > 0) {
        monthFromBookings = roomNet(monthFromBookings)
        monthTotalProduction = monthFromBookings
        directRevenue = monthFromBookings
        fiscalSource = "bookings_pro_rata"
        console.log("[dashboard-production] bookings pro-rata fallback (month)", {
          hotel_id: hotelId,
          period: `${firstDayOfMonth}..${monthlyFiscalEndDate}`,
          bookings: bookingMonth.length,
          total_revenue: monthFromBookings,
        })
      }
    }

    if (todayProduction === 0) {
      const bookingToday = await fetchAllRows<any>(() =>
        supabase
          .from("bookings")
          .select("check_in_date,check_out_date,total_price,number_of_nights")
          .eq("hotel_id", hotelId)
          .eq("is_cancelled", false)
          .eq("is_room_booking", true)
          .lte("check_in_date", selectedDate)
          .gt("check_out_date", selectedDate),
      )
      let todayFromBookings = 0
      for (const b of bookingToday) {
        const nights = Number(b.number_of_nights || 0)
        if (nights <= 0) continue
        const ppn = Number(b.total_price || 0) / nights
        if (Number.isFinite(ppn) && ppn > 0) todayFromBookings += ppn
      }
      if (todayFromBookings > 0) {
        todayFromBookings = roomNet(todayFromBookings)
        todayProduction = todayFromBookings
        dailyProduction = todayFromBookings
      }
    }

    const prevYearDate = (() => { const d = new Date(selectedDate); d.setFullYear(d.getFullYear() - 1); return d.toLocaleDateString("sv-SE") })()
    const prevMonthStartPrevYear = (() => { const d = new Date(selectedDate); d.setMonth(d.getMonth() - 1); d.setDate(1); d.setFullYear(d.getFullYear() - 1); return d.toLocaleDateString("sv-SE") })()

    // CRITICAL: paginate all booking queries — hotels can have >1000 active bookings
    // IMPORTANT: filter is_room_booking=true for operational counts (arrivals, departures, etc.)
    // Service-only entries (city tax, extras) must NOT inflate room occupancy KPIs.
    const [allActive, cancToday, newBks, todayDeps] = await Promise.all([
      fetchAllRows(() =>
        supabase.from("bookings")
          .select("id,pms_booking_id,check_in_date,check_out_date,total_price,number_of_nights,price_per_night,channel,booking_date")
          .eq("hotel_id", hotelId).eq("is_cancelled", false).eq("is_room_booking", true)
          .lte("check_in_date", selectedDate).gt("check_out_date", selectedDate)
      ),
      fetchAllRows(() =>
        supabase.from("bookings")
          .select("pms_booking_id,check_in_date,check_out_date,total_price,channel,number_of_nights,cancellation_date")
          .eq("hotel_id", hotelId).eq("is_cancelled", true).eq("is_room_booking", true)
          .gte("cancellation_date", selectedDate).lte("cancellation_date", selectedDate)
      ),
      fetchAllRows(() =>
        supabase.from("bookings")
          .select("id,channel,total_price,number_of_nights,booking_date,check_in_date")
          .eq("hotel_id", hotelId).eq("is_cancelled", false).eq("is_room_booking", true)
          .gte("booking_date", selectedDate).lte("booking_date", selectedDate)
      ),
      fetchAllRows(() =>
        supabase.from("bookings")
          .select("id")
          .eq("hotel_id", hotelId).eq("is_cancelled", false).eq("is_room_booking", true)
          .eq("check_out_date", selectedDate)
      ),
    ])

    const todayArrivals = allActive.filter((b: any) => b.check_in_date === selectedDate)
    const todayStayovers = allActive.filter((b: any) => b.check_in_date < selectedDate)

    let newBookingsRevenue = 0
    let newBookingsRoomNights = 0
    const newBookingsByChannel: Record<string, number> = {}
    for (const bk of newBks) {
      newBookingsRevenue += Number(bk.total_price || 0)
      newBookingsRoomNights += Number(bk.number_of_nights || 0)
      const ch = bk.channel || "Diretto"
      newBookingsByChannel[ch] = (newBookingsByChannel[ch] || 0) + 1
    }
    const revpor = newBookingsRoomNights > 0 ? newBookingsRevenue / newBookingsRoomNights : 0

    let cancelledRevenue = 0
    let cancelledRoomNights = 0
    for (const c of cancToday) {
      cancelledRevenue += Number(c.total_price || 0)
      cancelledRoomNights += Number(c.number_of_nights || 0)
    }
    const revpcr = cancelledRoomNights > 0 ? cancelledRevenue / cancelledRoomNights : 0

    const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString("sv-SE")
    const prevMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toLocaleDateString("sv-SE")
    // CRITICAL: must paginate — same issue as month query
    const prevMonthBookings = await fetchAllRows(() =>
      supabase
        .from("scidoo_raw_bookings")
        .select("room_type_name,raw_data")
        .eq("hotel_id", hotelId)
        .neq("status", "annullata")
        .lte("checkin_date", prevMonthEnd)
        .gte("checkout_date", prevMonthStart)
    )

    let prevMonthTotalProduction = 0
    for (const bk of prevMonthBookings) {
      const rtName: string = bk.room_type_name || "Sconosciuto"
      if (activeRoomTypeNames.size > 0 && !activeRoomTypeNames.has(rtName)) continue
      // FIX 2 (2026-04): apply discount subtraction (same logic as current month)
      const dailyPrice: Record<string, string | number> = bk.raw_data?.daily_price || {}
      const extras: any[] = Array.isArray(bk.raw_data?.extras) ? bk.raw_data.extras : []
      const totalDiscount = extras.reduce((sum: number, ex: any) => {
        const price = Number(ex.price) || 0
        if (price >= 0) return sum
        const cat = String(ex.category || "").toLowerCase()
        const desc = String(ex.description || "").toLowerCase()
        const isDiscount =
          cat.includes("sconti") ||
          cat.includes("servizio nota") ||
          desc.includes("sconto") ||
          desc.includes("addebito libero")
        return isDiscount ? sum + price : sum
      }, 0)
      // Tipare esplicitamente l'accumulator a `number` evita che TS allarghi
      // il tipo a `string|number` quando `dailyPrice` ha valori union.
      const dpTotal: number = Object.values(dailyPrice).reduce((s: number, v) => {
        const n = Number(v) || 0
        return s + (n > 0 ? n : 0)
      }, 0)
      for (const [dateKey, val] of Object.entries(dailyPrice)) {
        const grossRev = Number(val) || 0
        if (grossRev <= 0) continue
        const dateStr = dateKey.includes("/") ? dateKey.split("/").reverse().join("-") : dateKey
        if (dateStr >= prevMonthStart && dateStr <= prevMonthEnd) {
          const discountShare = dpTotal > 0 ? (grossRev / dpTotal) * totalDiscount : 0
          prevMonthTotalProduction += grossRev + discountShare
        }
      }
    }

    // FIX 21/05/2026 — fallback PMS-agnostico mese precedente (vedi commento
    // sul fallback corrente). Solo se Scidoo non ha contribuito.
    if (prevMonthTotalProduction === 0) {
      const prevBks = await fetchAllRows<any>(() =>
        supabase
          .from("bookings")
          .select("check_in_date,check_out_date,total_price,number_of_nights")
          .eq("hotel_id", hotelId)
          .eq("is_cancelled", false)
          .eq("is_room_booking", true)
          .lte("check_in_date", prevMonthEnd)
          .gte("check_out_date", prevMonthStart),
      )
      for (const b of prevBks) {
        const nights = Number(b.number_of_nights || 0)
        if (nights <= 0) continue
        const ppn = Number(b.total_price || 0) / nights
        if (!Number.isFinite(ppn) || ppn <= 0) continue
        const ci = new Date(b.check_in_date)
        const co = new Date(b.check_out_date)
        const winStart = new Date(prevMonthStart)
        const winEndIncl = new Date(prevMonthEnd)
        winEndIncl.setDate(winEndIncl.getDate() + 1)
        const start = ci > winStart ? ci : winStart
        const end = co < winEndIncl ? co : winEndIncl
        const nightsInWindow = Math.max(
          0,
          Math.round((end.getTime() - start.getTime()) / 86_400_000),
        )
        prevMonthTotalProduction += ppn * nightsInWindow
      }
    }

    const bookingPickupDays = newBks.reduce((sum: number, b: any) => {
      if (!b.booking_date || !b.check_in_date) return sum
      const bookingDate = new Date(b.booking_date)
      const checkIn = new Date(b.check_in_date)
      const days = Math.max(0, Math.ceil((checkIn.getTime() - bookingDate.getTime()) / (1000 * 60 * 60 * 24)))
      return sum + days
    }, 0)
    const avgBookingPickup = newBks.length > 0 ? bookingPickupDays / newBks.length : 0

    const cancPickupDays = cancToday.reduce((sum: number, b: any) => {
      if (!b.cancellation_date || !b.check_in_date) return sum
      const cancelDate = new Date(b.cancellation_date)
      const checkIn = new Date(b.check_in_date)
      const days = Math.max(0, Math.ceil((checkIn.getTime() - cancelDate.getTime()) / (1000 * 60 * 60 * 24)))
      return sum + days
    }, 0)
    const avgCancellationPickup = cancToday.length > 0 ? cancPickupDays / cancToday.length : 0

    return NextResponse.json({
      hotelId,
      fiscalSource,
      _debug: {
        rawBookingsTotal: rawBks.length,
        activeRoomTypes: Array.from(activeRoomTypeNames),
        skippedUnmapped,
        skippedNoDailyPrice,
        selectedDate,
        todayBookingsFound: todayBookingDetails.length,
        todayBookingDetails: todayBookingDetails.slice(0, 50), // first 50 for debug
        todayTotalFromDailyPrice: todayRevByName,
      },
      // Fiscali: già mode-correct (gross/net certo) da processFiscalRows / rms.
      monthTotalProduction,
      totalProduction: monthTotalProduction,
      todayProduction,
      // Room-based: lordi -> scorporo con aliquota alloggio in modalità excluded.
      roomProductionToday: roomNet(roomProductionToday),
      arrivalsCount: todayArrivals.length,
      departuresCount: todayDeps.length,
      stayoversCount: todayStayovers.length,
      cancellationsCount: cancToday.length,
      cancelledRevenue: roomNet(cancelledRevenue),
      cancelledRoomNights,
      revpcr: roomNet(revpcr),
      newBookingsCount: newBks.length,
      newBookingsRevenue: roomNet(newBookingsRevenue),
      newBookingsRoomNights,
      revpor: roomNet(revpor),
      newBookingsByChannel,
      avgBookingPickup,
      avgCancellationPickup,
      prevMonthTotalProduction: roomNet(prevMonthTotalProduction),
      directRevenue,
      intermediatedRevenue,
      departmentBreakdown,
      todayDepartmentBreakdown,
      todayDocumentTypes,
      monthDocumentTypes,
      accommodationType,
      vatMode: vatCfg.mode,
      accommodationVatRate: vatCfg.accommodationRate,
    })
  } catch (err: any) {
    console.error("[production] error:", err?.message || err)
    return NextResponse.json({ error: "Internal server error", details: err?.message || String(err) }, { status: 500 })
  }
}
