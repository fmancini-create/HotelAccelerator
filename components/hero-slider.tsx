"use client"

import { useState, useEffect } from "react"

const images = [
  "https://www.ibarronci.com/img/TOP/index1.jpg",
  "https://www.ibarronci.com/img/TOP/index16.jpg",
  "https://www.ibarronci.com/img/TOP/index17.jpg",
  "https://www.ibarronci.com/img/TOP/index3.jpg",
  "https://www.ibarronci.com/img/TOP/index18.jpg",
  "https://www.ibarronci.com/img/TOP/index19.jpg",
  "https://www.ibarronci.com/img/TOP/index20.jpg",
  "https://www.ibarronci.com/img/TOP/index21.jpg",
  "https://www.ibarronci.com/img/TOP/index22.jpg",
  "https://www.ibarronci.com/img/TOP/index23.jpg",
  "https://www.ibarronci.com/img/TOP/index24.jpg",
  "https://www.ibarronci.com/img/TOP/index25.jpg",
  "https://www.ibarronci.com/img/TOP/index13.jpg",
  "https://www.ibarronci.com/img/TOP/index14.jpg",
  "https://www.ibarronci.com/img/TOP/index15.jpg",
]

export function HeroSlider() {
  const [currentImage, setCurrentImage] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="relative h-screen w-full overflow-hidden">
      {images.map((img, index) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: currentImage === index ? 1 : 0 }}
        >
          <img
            src={img || "/placeholder.svg"}
            alt={`Villa I Barronci ${index + 1}`}
            className="h-full w-full object-cover"
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-4 z-10">
        <h1 className="font-serif text-5xl md:text-7xl font-normal mb-4 tracking-[0.15em]">VILLA I BARRONCI</h1>
        <p className="text-xl md:text-2xl mb-8 tracking-[0.2em] font-light">RESORT & SPA</p>
        <p className="text-base md:text-lg max-w-3xl leading-relaxed mb-10 font-light">
          Tra le colline del Chianti, la tua vacanza di lusso in Toscana:
          <br />
          villa d'epoca con piscina, Area Relax e parco privato
        </p>
        <a
          href="#contenuto"
          className="px-8 py-3 border-2 border-white text-white text-sm tracking-widest hover:bg-white hover:text-black transition-all duration-300 font-medium"
        >
          SCOPRI I BARRONCI
        </a>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
        <a href="#contenuto" className="flex flex-col items-center text-white hover:opacity-80 transition-opacity">
          <svg className="w-8 h-8 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </a>
      </div>
    </section>
  )
}

export default HeroSlider
