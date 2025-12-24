export function PanoramaSection() {
  return (
    <section className="py-16 px-6 bg-background">
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-center">
        <div className="order-2 md:order-1">
          <h3 className="font-serif text-3xl text-foreground mb-6">Panorama</h3>
          <p className="text-base text-muted-foreground leading-relaxed mb-4">
            La posizione di <strong>Villa I Barronci Resort & Spa</strong> è davvero invidiabile, poiché ci troviamo in
            aperta campagna, sulla collina più alta di <strong>San Casciano</strong>, da cui si ammira un panorama
            mozzafiato sulla Val di Pesa, a soli 15 minuti da <strong>Firenze</strong>.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed">
            Anche il resto della <strong>Toscana</strong> è facilmente visitabile e poco distante.
          </p>
          <a href="#" className="inline-block mt-6 text-muted-foreground underline hover:text-foreground">
            Guarda dove siamo
          </a>
        </div>
        <div className="order-1 md:order-2">
          <img
            src="https://www.ibarronci.com/img/TOP/index1.jpg"
            alt="Panorama Toscana"
            className="w-full h-auto rounded shadow-lg"
          />
        </div>
      </div>
    </section>
  )
}
