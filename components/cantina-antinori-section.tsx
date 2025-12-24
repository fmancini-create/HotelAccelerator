export function CantinaAntinoriSection() {
  return (
    <section className="relative h-[600px] overflow-hidden">
      <img
        src="https://www.ibarronci.com/img/antinori.jpg"
        alt="Cantina Antinori"
        className="w-full h-full object-cover"
      />

      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-6">
        <p className="text-sm tracking-[0.3em] mb-6 uppercase">Una esperienza unica!</p>

        <h2 className="font-serif text-4xl md:text-6xl mb-6 tracking-wider">CANTINA ANTINORI</h2>

        <p className="text-base md:text-lg mb-4 max-w-2xl">A 7 km da Villa I Barronci</p>

        <p className="text-sm md:text-base mb-8 max-w-3xl leading-relaxed">
          La Cantina Antinori, una meraviglia architettonica ad un passo da noi
        </p>

        <button className="px-10 py-3 border border-white text-white text-sm tracking-widest hover:bg-white hover:text-black transition-all duration-300 uppercase">
          Visita
        </button>
      </div>
    </section>
  )
}

export default CantinaAntinoriSection
