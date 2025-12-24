export function PoolSection() {
  return (
    <section className="relative h-[600px] overflow-hidden">
      <img
        src="https://www.ibarronci.com/img/TOP/index16.jpg"
        alt="Piscina panoramica con Jacuzzi"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/20" />

      <div className="relative h-full flex flex-col items-center justify-center text-white text-center px-6">
        <p className="text-sm tracking-widest mb-4 uppercase">Piscina Riscaldata a 36°C</p>
        <h2 className="font-serif text-4xl md:text-5xl mb-6">Piscina & Jacuzzi</h2>
        <p className="text-lg mb-8 max-w-2xl">Una incantevole piscina panoramica, con Jacuzzi</p>
        <a
          href="/piscina-jacuzzi"
          className="px-8 py-3 bg-background text-foreground hover:bg-background/90 transition-colors duration-300 tracking-wider"
        >
          TUFFATI IN PISCINA
        </a>
      </div>
    </section>
  )
}

export default PoolSection
