export function ThreeFeaturesSection() {
  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center group">
            <div className="aspect-[4/3] mb-6 overflow-hidden">
              <img
                src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp"
                alt="Namaste Area Relax"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <h4 className="font-serif text-[#8b7355] text-2xl mb-4">Namaste Area Relax</h4>
            <p className="text-[#7a7a7a] text-sm leading-relaxed">
              Namaste Area Relax nasce per offrire ai nostri ospiti la possibilità di rigenerare corpo e mente in un
              clima di assoluta tranquillità, circondati dalle colline del Chianti.
            </p>
          </div>

          <div className="text-center group">
            <div className="aspect-[4/3] mb-6 overflow-hidden">
              <img
                src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0033-copia.webp"
                alt="da Tiberio a San Casciano"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <h4 className="font-serif text-[#8b7355] text-2xl mb-4">da Tiberio a San Casciano</h4>
            <p className="text-[#7a7a7a] text-sm leading-relaxed">
              Sulla terrazza panoramica o nelle ampie sale interne di Villa I Barronci Resort & Spa potrai gustare i
              piatti della cucina toscana del nostro Ristorante "da Tiberio", aperto tutti i giorni, escluso il martedì.
            </p>
          </div>

          <div className="text-center group">
            <div className="aspect-[4/3] mb-6 overflow-hidden">
              <img
                src="https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0044.webp"
                alt="Pool & Jacuzzi"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <h4 className="font-serif text-[#8b7355] text-2xl mb-4">Pool & Jacuzzi</h4>
            <p className="text-[#7a7a7a] text-sm leading-relaxed">
              La nostra meravigliosa piscina, con acqua riscaldata a 34 gradi costanti, è aperta tutto l'anno ed è in
              grado di regalare ai nostri ospiti una esperienza di relax assoluto.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default ThreeFeaturesSection
