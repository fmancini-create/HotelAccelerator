import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

interface RateMapping {
  id: string
  name: string
  code?: string
  rate_type: "standard" | "nr" | "promo" | "package" | "derived"
  parent_rate_id: string | null
  applicable_room_type_ids: string[] | null
  min_occupancy: number
  max_occupancy: number | null
  discount_percentage: number | null
  release_days: number | null
  is_mapped: boolean
  mapping_notes: string | null
}

// GET: Load rate mappings for a hotel
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const hotelId = searchParams.get("hotel_id")

    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    // Get all rates for the hotel with parent rate info
    const { data: rates, error } = await supabase
      .from("rates")
      .select(`
        id,
        name,
        code,
        rate_type,
        parent_rate_id,
        applicable_room_type_ids,
        min_occupancy,
        max_occupancy,
        discount_percentage,
        release_days,
        is_active,
        is_mapped,
        mapping_notes,
        created_at
      `)
      .eq("hotel_id", hotelId)
      .order("is_active", { ascending: false })
      .order("name")

    if (error) {
      console.error("[v0] Error fetching rate mappings:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get room types for the hotel (for the mapping UI)
    const { data: roomTypes } = await supabase
      .from("room_types")
      .select("id, name, pms_room_type_id, min_occupancy, max_occupancy, capacity")
      .eq("hotel_id", hotelId)
      .order("name")

    // Carica reference_rate_id dal record pricing_algo_params piu' recente.
    // Nuovo modello "Single Reference Rate": questa tariffa e' il BAR di
    // riferimento dell'hotel, ogni altra varia rispetto a lei nei daily
    // adjustments.
    //
    // BUG FIX 30/04/2026: la versione iniziale di questa query selezionava
    // direttamente la colonna `reference_rate_id` che NON esiste nello schema
    // di `pricing_algo_params`. Lo schema reale e' key-value
    // (`param_key, param_value, date, hotel_id`) come confermato da
    // `lib/pricing/recalculate-queued-prices.ts:163`. Risultato: la GET
    // ritornava sempre `null` e l'editor non sapeva quale tariffa era settata
    // come riferimento.
    const today = new Date().toISOString().slice(0, 10)
    const { data: latestAlgo } = await supabase
      .from("pricing_algo_params")
      .select("param_value")
      .eq("hotel_id", hotelId)
      .eq("param_key", "reference_rate_id")
      .gte("date", today)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle()

    // Calculate mapping status
    const totalRates = rates?.length || 0
    const mappedRates = rates?.filter(r => r.is_mapped).length || 0
    const unmappedNrRates = rates?.filter(r => 
      !r.is_mapped && 
      (r.name?.toUpperCase().includes("NR") || r.name?.toLowerCase().includes("non rimb"))
    ).length || 0

    return NextResponse.json({
      rates: rates || [],
      roomTypes: roomTypes || [],
      referenceRateId: latestAlgo?.param_value ?? null,
      stats: {
        total: totalRates,
        mapped: mappedRates,
        unmapped: totalRates - mappedRates,
        unmappedNr: unmappedNrRates,
        completionPercentage: totalRates > 0 ? Math.round((mappedRates / totalRates) * 100) : 0
      }
    })
  } catch (error) {
    console.error("[v0] Rate mappings GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper: verifica autenticazione e accesso al hotel.
// BUG FIX 30/04/2026: prima POST/PUT non avevano auth check, chiunque
// autenticato poteva modificare le tariffe di qualsiasi hotel.
async function assertHotelAccess(supabase: Awaited<ReturnType<typeof createClient>>, hotelId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuperAdmin = profile?.role === "super_admin" || profile?.role === "superadmin"
  if (isSuperAdmin) return { ok: true as const }
  const { data: access } = await supabase
    .from("hotel_users")
    .select("hotel_id")
    .eq("user_id", user.id)
    .eq("hotel_id", hotelId)
    .maybeSingle()
  if (!access) {
    return { error: NextResponse.json({ error: "Accesso negato a questo hotel" }, { status: 403 }) }
  }
  return { ok: true as const }
}

// POST: Save rate mapping
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    
    const {
      rate_id,
      hotel_id,
      rate_type,
      parent_rate_id,
      applicable_room_type_ids,
      discount_percentage,
      release_days,
      mapping_notes,
      // FIX (28/04/2026): min/max_occupancy NON sono piu' modificabili dalla
      // UI di mapping. Sono proprieta' della CAMERA (room_types), sincronizzate
      // dal PMS. Se arrivano nel payload li ignoriamo per non sovrascrivere
      // valori legacy con dati derivati.
    } = body

    if (!rate_id || !hotel_id) {
      return NextResponse.json({ error: "rate_id and hotel_id are required" }, { status: 400 })
    }

    // Auth: utente loggato + accesso al hotel target.
    const auth = await assertHotelAccess(supabase, hotel_id)
    if ("error" in auth) return auth.error

    // Validate rate_type
    const validTypes = ["standard", "nr", "promo", "package", "derived"]
    if (rate_type && !validTypes.includes(rate_type)) {
      return NextResponse.json({ error: `Invalid rate_type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 })
    }

    // FIX 30/04/2026: nuovo modello "Reference Rate + offset daily".
    // parent_rate_id e' SEMPRE opzionale, anche per NR. Le tariffe non
    // dichiarano sconto/release qui: lo fanno daily nella pagina pricing
    // (rate_adj_<id> in algo_params). Mantenere il vincolo "NR -> parent"
    // costringeva l'utente a costruire mappature inutili (caso Casanova:
    // 50+ tariffe senza riferimenti chiari).

    // Prevent circular references
    if (parent_rate_id === rate_id) {
      return NextResponse.json({ 
        error: "Una tariffa non puo essere padre di se stessa",
        field: "parent_rate_id"
      }, { status: 400 })
    }

    // FIX 30/04/2026: check ricorsivo anti-circolarita' per chain arbitrarie.
    // Prima si controllava solo `parent.parent === self` (1 livello), che non
    // copriva cicli A -> B -> C -> A. Ora risaliamo la catena dei parent fino
    // a trovare NULL (radice), self (ciclo) o un cap di sicurezza (10 livelli).
    //
    // BUG FIX 30/04/2026 (audit #3): la query `eq("hotel_id", hotel_id)` qui
    // sotto carica SOLO le rate dell'hotel target. Significa che se
    // `parent_rate_id` e' l'UUID di una rate di un ALTRO hotel, non viene
    // trovata in `parentByChild`, il loop esce subito e nessun ciclo viene
    // detectato — ma la rate viene comunque scritta con un parent
    // cross-hotel (data corruption). Aggiungo check di ownership esplicito.
    if (parent_rate_id) {
      const { data: parentOwnership } = await supabase
        .from("rates")
        .select("id")
        .eq("id", parent_rate_id)
        .eq("hotel_id", hotel_id)
        .maybeSingle()
      if (!parentOwnership) {
        return NextResponse.json(
          {
            error: "La tariffa padre selezionata non appartiene a questo hotel",
            field: "parent_rate_id",
          },
          { status: 400 },
        )
      }

      const { data: allHotelRates } = await supabase
        .from("rates")
        .select("id, parent_rate_id")
        .eq("hotel_id", hotel_id)

      const parentByChild = new Map<string, string | null>()
      for (const r of allHotelRates ?? []) {
        parentByChild.set(r.id, r.parent_rate_id)
      }

      let cursor: string | null = parent_rate_id
      const visited = new Set<string>()
      const MAX_DEPTH = 10
      while (cursor && visited.size < MAX_DEPTH) {
        if (cursor === rate_id) {
          return NextResponse.json({
            error:
              "Riferimento circolare rilevato: questa selezione creerebbe un ciclo nella catena delle tariffe padre",
            field: "parent_rate_id",
          }, { status: 400 })
        }
        if (visited.has(cursor)) break // ciclo preesistente non legato a self
        visited.add(cursor)
        cursor = parentByChild.get(cursor) ?? null
      }
    }

    // BUG FIX 30/04/2026: prima questo update faceva
    // `discount_percentage: discount_percentage || null` — se il client NON
    // mandava il campo (caso normale dell'editor inline che invia solo
    // rate_type/parent/rooms/notes), `undefined || null` = null AZZERAVA i
    // valori esistenti in DB. Ora costruiamo dinamicamente l'update object
    // includendo SOLO le chiavi che il client ha effettivamente passato.
    const updatePayload: Record<string, unknown> = {
      is_mapped: true,
      updated_at: new Date().toISOString(),
    }
    if (rate_type !== undefined) updatePayload.rate_type = rate_type || "standard"
    // parent_rate_id puo' essere null esplicito (clear): undefined = non toccare,
    // null/string = scrivi.
    if (parent_rate_id !== undefined) updatePayload.parent_rate_id = parent_rate_id || null
    if (applicable_room_type_ids !== undefined) {
      // BUG FIX 30/04/2026 (audit #4): valida che ogni room_type_id passato
      // sia (a) una stringa non vuota e (b) appartenga al hotel target.
      // Senza questo check un client poteva scrivere room_type_ids di un
      // altro hotel (la colonna e' un array PostgreSQL e Postgres non
      // applica vincoli di FK su elementi di array). Risultato: la rate
      // veniva applicata a camere "fantasma" e il pricing engine cadeva
      // su comportamento undefined.
      let normalizedIds: string[] | null = null
      if (Array.isArray(applicable_room_type_ids) && applicable_room_type_ids.length > 0) {
        const cleanIds = Array.from(
          new Set(
            applicable_room_type_ids.filter(
              (id: unknown): id is string => typeof id === "string" && id.trim().length > 0,
            ),
          ),
        )
        if (cleanIds.length > 0) {
          const { data: ownedRooms } = await supabase
            .from("room_types")
            .select("id")
            .eq("hotel_id", hotel_id)
            .in("id", cleanIds)
          const ownedSet = new Set((ownedRooms ?? []).map((r) => r.id))
          const invalid = cleanIds.filter((id) => !ownedSet.has(id))
          if (invalid.length > 0) {
            return NextResponse.json(
              {
                error: `Le seguenti tipologie camera non appartengono a questo hotel: ${invalid.join(", ")}`,
                field: "applicable_room_type_ids",
              },
              { status: 400 },
            )
          }
          normalizedIds = cleanIds
        }
      }
      updatePayload.applicable_room_type_ids = normalizedIds
    }
    if (discount_percentage !== undefined) {
      updatePayload.discount_percentage = discount_percentage
    }
    if (release_days !== undefined) updatePayload.release_days = release_days
    if (mapping_notes !== undefined) updatePayload.mapping_notes = mapping_notes || null

    const { data, error } = await supabase
      .from("rates")
      .update(updatePayload)
      .eq("id", rate_id)
      .eq("hotel_id", hotel_id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Error saving rate mapping:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, rate: data })
  } catch (error) {
    console.error("[v0] Rate mappings POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT: Bulk update rate mappings (for auto-detection)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { hotel_id, auto_detect } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id is required" }, { status: 400 })
    }

    // Auth: l'auto-detect riscrive rate_type/parent_rate_id su tutto l'hotel,
    // serve auth check + accesso al hotel.
    const auth = await assertHotelAccess(supabase, hotel_id)
    if ("error" in auth) return auth.error

    if (auto_detect) {
      // AUTO-DETECT 2.0 (30/04/2026)
      //
      // Obiettivo: classificare TUTTE le tariffe attive in pochi secondi anche
      // su cataloghi grandi e disordinati (caso Casanova: 50+ tariffe Bedzzle).
      //
      // Step:
      //   1. Identifica/conferma la "reference rate" dell'hotel (BAR principale).
      //      Heuristic: tariffa pushata piu' spesso in last_sent_prices, con
      //      tie-breaker il nome piu' "neutro" (contiene BAR/Standard/B&B
      //      senza modificatori NR/Promo/Pkg).
      //   2. Per ogni tariffa, classifica il tipo via regex multi-lingua.
      //   3. Inferisce parent suggerito raggruppando per prefix di famiglia
      //      (es. "BAR-NR-Mob" -> famiglia "BAR"). NB: parent e' SEMPRE
      //      opzionale, e' un suggerimento di metadata.
      //   4. Marca is_mapped=true per tutte (non lascia "non mappate" come il
      //      vecchio algoritmo che richiedeva matching parent perfetto).
      // BUG FIX 30/04/2026: prima escludevo is_active=false dall'auto-detect.
      // Significava che tariffe disattivate manualmente restavano sempre con
      // rate_type stantio. Ora le includiamo per coerenza (la classificazione
      // e' una proprieta' della tariffa, non dello stato attivo/passivo).
      const { data: rates } = await supabase
        .from("rates")
        .select("id, name, code, rate_type, parent_rate_id, is_active")
        .eq("hotel_id", hotel_id)

      if (!rates || rates.length === 0) {
        return NextResponse.json({ message: "No rates found", updated: 0 })
      }

      // --- Step 1: identifica reference rate.
      // Conta i push per rate_id da last_sent_prices come proxy di "tariffa
      // piu' usata". Se la tabella e' vuota, fallback su naming neutro.
      const { data: pushed } = await supabase
        .from("last_sent_prices")
        .select("rate_id")
        .eq("hotel_id", hotel_id)

      const pushCountByRate = new Map<string, number>()
      for (const p of pushed ?? []) {
        if (!p.rate_id) continue
        pushCountByRate.set(p.rate_id, (pushCountByRate.get(p.rate_id) ?? 0) + 1)
      }

      const isNeutralName = (n: string) => {
        const u = n.toUpperCase()
        const hasNeutral = /(BAR|STANDARD|RACK|B&B|BED ?\& ?BREAKFAST|BB)/.test(u)
        const hasModifier = /(NR|NON RIMB|NONREF|PROMO|OFFER|PACK|PKG|SPECIAL|SCONT)/.test(u)
        return hasNeutral && !hasModifier
      }

      // Pick reference rate: max push count, tie-break neutral name, tie-break first.
      let referenceRateId: string | null = null
      let bestScore = -1
      for (const r of rates) {
        const pushScore = (pushCountByRate.get(r.id) ?? 0) * 10
        const neutralScore = isNeutralName(r.name ?? "") ? 5 : 0
        const totalScore = pushScore + neutralScore
        if (totalScore > bestScore) {
          bestScore = totalScore
          referenceRateId = r.id
        }
      }

      // --- Step 2: classifica tipo via regex.
      const classifyType = (name: string): "standard" | "nr" | "promo" | "package" | "derived" => {
        const u = (name ?? "").toUpperCase()
        if (/(NR\b|NON ?RIMB|NON ?REF|NONREF|NO ?REF)/.test(u)) return "nr"
        if (/(PROMO|OFFER|SPECIAL|SCONT|EARLY|ADVANCE|LAST ?MIN)/.test(u)) return "promo"
        if (/(PACK|PKG|PACCH)/.test(u)) return "package"
        return "standard"
      }

      // --- Step 3: per ogni rate, suggerisci parent rimuovendo modifier dal nome
      //     e cercando il match piu' simile fra le tariffe restanti.
      const stripModifiers = (name: string) =>
        (name ?? "")
          .replace(/\s*\b(NR|NON ?RIMB[A-Z]*|NON ?REF[A-Z]*|NONREF)\b\s*/gi, " ")
          .replace(/\s*\b(PROMO|OFFER[A-Z]*|SPECIAL[A-Z]*|EARLY ?BIRD|LAST ?MIN[A-Z]*|ADVANCE)\b\s*/gi, " ")
          .replace(/\s*\b(PACK[A-Z]*|PKG|PACCH[A-Z]*)\b\s*/gi, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase()

      // Costruisci index dei nomi "spogliati" -> rate_id (solo per le tariffe
      // di tipo standard "candidate parent").
      const standardCandidates = rates.filter(r => classifyType(r.name ?? "") === "standard")
      const standardByStrippedName = new Map<string, string>()
      for (const r of standardCandidates) {
        const stripped = stripModifiers(r.name ?? "")
        if (stripped && !standardByStrippedName.has(stripped)) {
          standardByStrippedName.set(stripped, r.id)
        }
      }

      // --- Step 4: applica updates.
      // BUG FIX 30/04/2026: prima si faceva un UPDATE per ogni rate (50+
      // round-trip per Casanova). Ora raggruppiamo per (rate_type,
      // parent_rate_id) e facciamo un solo UPDATE per gruppo via .in("id",
      // [...]). Le rate gia' allineate (no-op) restano in un gruppo "mark
      // is_mapped=true" minimale per coerenza con il vecchio comportamento
      // (l'auto-detect "tocca" tutte le tariffe segnandole come gestite).
      let typeChanged = 0
      let parentInferred = 0

      // Mappa: chiave "type|parent" -> array di rate_id da aggiornare
      const groupedUpdates = new Map<string, { type: string; parent: string | null; ids: string[] }>()
      // Rate gia' allineate (no cambi): solo refresh di is_mapped/updated_at.
      const noOpIds: string[] = []

      for (const rate of rates) {
        const newType = classifyType(rate.name ?? "")
        let inferredParent: string | null = rate.parent_rate_id ?? null

        if (newType !== "standard" && !rate.parent_rate_id) {
          const stripped = stripModifiers(rate.name ?? "")
          const matchedParentId = standardByStrippedName.get(stripped)
          if (matchedParentId && matchedParentId !== rate.id) {
            inferredParent = matchedParentId
            parentInferred++
          }
        }

        const typeIsSame = rate.rate_type === newType
        const parentIsSame = inferredParent === (rate.parent_rate_id ?? null)

        if (rate.rate_type !== newType) typeChanged++

        if (typeIsSame && parentIsSame && rate.is_mapped) {
          // Tutto allineato gia': nessuna scrittura necessaria.
          continue
        }

        if (typeIsSame && parentIsSame) {
          // Identico ma is_mapped=false: marca solo is_mapped.
          noOpIds.push(rate.id)
          continue
        }

        const key = `${newType}|${inferredParent ?? "null"}`
        const bucket = groupedUpdates.get(key)
        if (bucket) {
          bucket.ids.push(rate.id)
        } else {
          groupedUpdates.set(key, { type: newType, parent: inferredParent, ids: [rate.id] })
        }
      }

      let updated = 0
      const nowIso = new Date().toISOString()

      // Apply grouped updates.
      for (const { type, parent, ids } of groupedUpdates.values()) {
        const { error: upErr } = await supabase
          .from("rates")
          .update({
            rate_type: type,
            parent_rate_id: parent,
            is_mapped: true,
            updated_at: nowIso,
          })
          .in("id", ids)
          .eq("hotel_id", hotel_id)
        if (upErr) {
          console.error("[v0] auto-detect grouped update error:", upErr)
        } else {
          updated += ids.length
        }
      }

      // Mark is_mapped on no-op rates if needed.
      if (noOpIds.length > 0) {
        await supabase
          .from("rates")
          .update({ is_mapped: true, updated_at: nowIso })
          .in("id", noOpIds)
          .eq("hotel_id", hotel_id)
        updated += noOpIds.length
      }

      return NextResponse.json({
        success: true,
        message: `Auto-detection completata`,
        updated,
        typeChanged,
        parentInferred,
        suggestedReferenceRateId: referenceRateId,
      })
    }

    return NextResponse.json({ error: "No action specified" }, { status: 400 })
  } catch (error) {
    console.error("[v0] Rate mappings PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
