export function FlorenceSection() {
  return (
    <section className="relative h-[600px] overflow-hidden">
      <img
        src="https://www.ibarronci.com/img/TOP/index21.jpg"
        alt="Firenze - Duomo"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/20" />

      <div className="relative h-full flex flex-col items-center justify-center text-white text-center px-6">
        <p className="text-sm tracking-widest mb-4 uppercase">Visita la Culla del Rinascimento</p>
        <h2 className="font-serif text-4xl md:text-5xl mb-2">FIRENZE</h2>
        <h3 className="font-serif text-2xl md:text-3xl mb-6">A 15 km da Villa I Barronci</h3>
        <p className="text-lg mb-8 max-w-2xl">Villa I Barronci, the best location to visit Florence</p>
        <a
          href="/dove-siamo"
          className="px-8 py-3 bg-background text-foreground hover:bg-background/90 transition-colors duration-300 tracking-wider"
        >
          VISITA FIRENZE
        </a>
      </div>
    </section>
  )
}

export default FlorenceSection
