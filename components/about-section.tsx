export function AboutSection() {
  return (
    <section id="contenuto" className="py-24 bg-[#f5f3f0]">
      <div className="container mx-auto px-6 max-w-5xl text-center">
        <div className="flex justify-center mb-8">
          <a href="#contenuto" className="text-[#8b7355] text-4xl">
            ↓
          </a>
        </div>

        <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-2 tracking-wider">VILLA I BARRONCI</h1>
        <h2 className="font-serif text-[#8b7355] text-3xl md:text-4xl mb-12">Resort & Spa</h2>

        <div className="w-24 h-px bg-[#8b7355] mx-auto mb-12" />

        <h2 className="font-serif text-[#666] text-2xl md:text-3xl mb-8 leading-relaxed">
          Tra le colline del Chianti, la tua vacanza di lusso in Toscana: villa d'epoca con piscina, Area Relax e parco
          privato.
        </h2>

        <p className="text-[#7a7a7a] text-base md:text-lg leading-relaxed mb-6">
          Ci sono delle occasioni nella vita – e se non ci sono, prendiamocele – in cui finalmente giunge il momento di
          fare un regalo anche a noi stessi.
        </p>

        <p className="text-[#7a7a7a] text-base md:text-lg leading-relaxed mb-6">
          Strutture come Villa I Barronci Resort & Spa, nel cuore del Chianti, esistono per questo, per premiarsi.
          <br />
          Chi ama la Toscana e la sua natura rigogliosa, che regala benessere e armonia, non può non amare un'antica
          villa del Duecento,
          <br />
          rimessa a nuovo per essere la cornice dei tuoi sogni.
          <br />
          Tutta l'energia che utilizziamo qui in villa proviene da impianti "verdi" ovvero di produzione idroelettrica
          certificata.
        </p>
      </div>
    </section>
  )
}

export default AboutSection
