export function VillaSection() {
  return (
    <section className="py-20 px-6 bg-secondary">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-8">
          <ChevronDown className="w-8 h-8 text-muted-foreground mx-auto mb-6" />
        </div>

        <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-4">Villa I Barronci</h2>
        <p className="font-serif text-2xl text-muted-foreground mb-8">Resort & Spa</p>

        <div className="w-24 h-px bg-border mx-auto mb-12" />

        <p className="text-lg text-muted-foreground leading-relaxed mb-8">
          Tra le colline del Chianti, la tua vacanza di lusso in Toscana: villa d'epoca con piscina, Area Relax e parco
          privato.
        </p>

        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          Ci sono delle occasioni nella vita – e se non ci sono, prendiamocele – in cui finalmente giunge il momento di
          fare un regalo anche a noi stessi.
        </p>

        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          Strutture come <strong>Villa I Barronci Resort & Spa</strong>, nel cuore del <strong>Chianti</strong>,
          esistono per questo, per premiarsi. Chi ama la <strong>Toscana</strong> e la sua natura rigogliosa, che regala
          benessere e armonia, non può non amare un'<strong>antica villa del Duecento</strong>, rimessa a nuovo per
          essere la cornice dei tuoi sogni.
        </p>

        <p className="text-base text-muted-foreground leading-relaxed">
          Tutta l'energia che utilizziamo qui in villa proviene da impianti "verdi" ovvero di produzione idroelettrica
          certificata.
        </p>
      </div>
    </section>
  )
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
