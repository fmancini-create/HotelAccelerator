export function RestaurantSection() {
  return (
    <section className="relative h-[600px] overflow-hidden">
      <img
        src="https://www.ibarronci.com/img/TOP/index19.jpg"
        alt="Ristorante da Tiberio"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/20" />

      <div className="relative h-full flex flex-col items-center justify-center text-white text-center px-6">
        <p className="text-sm tracking-widest mb-4 uppercase">da Tiberio a San Casciano</p>
        <h2 className="font-serif text-4xl md:text-5xl mb-2">da Tiberio a San Casciano</h2>
        <h3 className="font-serif text-2xl md:text-3xl mb-6">Ristorante</h3>
        <p className="text-lg mb-8 max-w-2xl">La vacanza in Toscana ha trovato la sua migliore cucina</p>
        <a
          href="/ristorante"
          className="px-8 py-3 bg-background text-foreground hover:bg-background/90 transition-colors duration-300 tracking-wider"
        >
          SCOPRI IL RISTORANTE
        </a>
      </div>
    </section>
  )
}

export default RestaurantSection
