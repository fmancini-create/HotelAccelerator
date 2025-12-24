import { Calendar, Phone, Mail } from "lucide-react"

export default function CTAIconsSection() {
  return (
    <section className="py-12 bg-white border-t border-b border-[#e5e5e5]">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-3 gap-8">
          <a
            href="https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713&IDsotto_struttura=0&IDsettore_specifico=441&settore=1&settore_unico=1&lang=0"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center group cursor-pointer"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 transition-transform group-hover:scale-110">
              <Calendar className="w-12 h-12 text-[#c1b5a3]" />
            </div>
            <h4 className="text-[#7a7a7a] text-sm font-semibold tracking-wider group-hover:text-[#8b7355] transition-colors">
              PRENOTA
            </h4>
          </a>

          <a href="tel:+39055820598" className="text-center group cursor-pointer">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 transition-transform group-hover:scale-110">
              <Phone className="w-12 h-12 text-[#c1b5a3]" />
            </div>
            <h4 className="text-[#7a7a7a] text-sm font-semibold tracking-wider group-hover:text-[#8b7355] transition-colors">
              CHIAMA
            </h4>
          </a>

          <a href="https://ibarronci.com/newsletter-villa-i-barronci/" className="text-center group cursor-pointer">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 transition-transform group-hover:scale-110">
              <Mail className="w-12 h-12 text-[#c1b5a3]" />
            </div>
            <h4 className="text-[#7a7a7a] text-sm font-semibold tracking-wider group-hover:text-[#8b7355] transition-colors">
              NEWSLETTER
            </h4>
          </a>
        </div>
      </div>
    </section>
  )
}

export { CTAIconsSection }
