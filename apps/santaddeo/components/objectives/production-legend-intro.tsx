/**
 * ProductionLegendIntro
 *
 * Paragrafo introduttivo della legenda della pagina Obiettivi che spiega
 * cosa rappresenta la "Produzione" mostrata in tabella e quali stati sono
 * inclusi nel default. Il testo è specifico per ogni connettore PMS perché
 * ogni PMS espone i ricavi camera in modo diverso e la fonte di riferimento
 * cambia (Scidoo: "Booking Manager x mese"; Bedzzle: gsheets aggregato; ecc.).
 *
 * Aggiungere un nuovo PMS = aggiungere una entry in `LEGEND_BY_CONNECTOR`.
 */

type LegendCopy = {
  title: string
  productionExplain: React.ReactNode
  statusesExplain: React.ReactNode
}

const SCIDOO_COPY: LegendCopy = {
  title: "Cosa rappresentano i valori di ricavo",
  productionExplain: (
    <>
      La <strong>Produzione</strong> mostrata in questa pagina coincide al
      centesimo con il valore di ricavo camera mostrato nelle pagine{" "}
      <em>Produzione</em>, <em>Produzione per Canali</em> e <em>Disponibilità</em>
      : è il prezzo a notte addebitato all&apos;ospite per la camera, che
      include la prima colazione. Scidoo, nel report &quot;Booking Manager x
      mese&quot;, espone in colonna separata la quota colazione e con shift al
      giorno successivo (la colazione della prima notte viene servita la
      mattina dopo). Per questo motivo la &quot;Produzione&quot; di questa app
      può risultare leggermente più alta della sola colonna
      &quot;Pernotto&quot; del PDF Scidoo, ma corrisponde esattamente a quanto
      l&apos;ospite paga per la camera. <strong>Stessa metrica, stesso valore</strong>{" "}
      in tutte le pagine dell&apos;app dove compare la voce
      &quot;Produzione&quot; o &quot;Ricavo camera&quot;.
    </>
  ),
  statusesExplain: (
    <>
      Il default include <strong>tutti gli stati Scidoo non annullati</strong>{" "}
      (Da Confermare, Confermata Saldata in Garanzia, Confermata Manuale,
      Confermata Carta, Confermata con Pagamento, Attesa di Saldo, Pagata in
      Saldo, Check-in, Check-out): è la stessa selezione del report Scidoo
      &quot;Booking Manager x mese&quot;. Usa i pulsanti in alto per
      restringere la vista a sottoinsiemi di stati.
    </>
  ),
}

const BEDZZLE_COPY: LegendCopy = {
  title: "Cosa rappresentano i valori di ricavo",
  productionExplain: (
    <>
      La <strong>Produzione</strong> mostrata in questa pagina coincide al
      centesimo con il valore di ricavo camera mostrato nelle pagine{" "}
      <em>Produzione</em>, <em>Produzione per Canali</em> e <em>Disponibilità</em>
      : è il prezzo a notte addebitato all&apos;ospite per la camera così come
      esportato da Bedzzle nel Google Sheet di sincronizzazione. La cifra può
      includere o meno la colazione a seconda di come è impostato il piano
      tariffario su Bedzzle. <strong>Stessa metrica, stesso valore</strong> in
      tutte le pagine dell&apos;app dove compare la voce
      &quot;Produzione&quot; o &quot;Ricavo camera&quot;.
    </>
  ),
  statusesExplain: (
    <>
      L&apos;integrazione Bedzzle via Google Sheets fornisce solo prenotazioni
      confermate e check-in/check-out: gli stati &quot;preventivi&quot; o
      &quot;in attesa pagamento&quot; non sono esportati e quindi non sono
      filtrabili da questa pagina.
    </>
  ),
}

const BRIG_COPY: LegendCopy = {
  title: "Cosa rappresentano i valori di ricavo",
  productionExplain: (
    <>
      La <strong>Produzione</strong> mostrata in questa pagina coincide al
      centesimo con il valore di ricavo camera mostrato nelle pagine{" "}
      <em>Produzione</em>, <em>Produzione per Canali</em> e <em>Disponibilità</em>
      : è il prezzo a notte addebitato all&apos;ospite per la camera così come
      esposto dal connettore Brig dal PMS sottostante (Bedzzle, 5stelle,
      Cloudbeds, Mews, Octorate, Opera, Slope, Zak, Apaleo, ecc.). La cifra
      può includere o meno servizi aggiuntivi a seconda del PMS originale.{" "}
      <strong>Stessa metrica, stesso valore</strong> in tutte le pagine
      dell&apos;app dove compare la voce &quot;Produzione&quot; o &quot;Ricavo
      camera&quot;.
    </>
  ),
  statusesExplain: (
    <>
      Il default include tutte le prenotazioni non annullate. Il dettaglio
      degli stati esportati da Brig dipende dal PMS sottostante; usa i pulsanti
      in alto per restringere la vista quando disponibile.
    </>
  ),
}

const GENERIC_COPY: LegendCopy = {
  title: "Cosa rappresentano i valori di ricavo",
  productionExplain: (
    <>
      La <strong>Produzione</strong> mostrata in questa pagina coincide al
      centesimo con il valore di ricavo camera mostrato nelle pagine{" "}
      <em>Produzione</em>, <em>Produzione per Canali</em> e <em>Disponibilità</em>
      : è il prezzo a notte addebitato all&apos;ospite per la camera così come
      esposto dal connettore PMS dell&apos;hotel.{" "}
      <strong>Stessa metrica, stesso valore</strong> in tutte le pagine
      dell&apos;app dove compare la voce &quot;Produzione&quot; o &quot;Ricavo
      camera&quot;.
    </>
  ),
  statusesExplain: (
    <>
      Il default include tutte le prenotazioni non annullate riportate dal PMS.
      Usa i pulsanti in alto per restringere la vista a sottoinsiemi di stati
      quando l&apos;informazione è disponibile.
    </>
  ),
}

const LEGEND_BY_CONNECTOR: Record<string, LegendCopy> = {
  scidoo: SCIDOO_COPY,
  bedzzle: BEDZZLE_COPY,
  brig: BRIG_COPY,
}

export function ProductionLegendIntro({ connector }: { connector: string }) {
  const key = (connector || "").trim().toLowerCase()
  const copy = LEGEND_BY_CONNECTOR[key] ?? GENERIC_COPY
  return (
    <div>
      <h4 className="font-semibold text-sm mb-2">{copy.title}</h4>
      <p className="text-xs text-muted-foreground leading-relaxed">{copy.productionExplain}</p>
      <p className="text-xs text-muted-foreground leading-relaxed mt-2">{copy.statusesExplain}</p>
    </div>
  )
}
