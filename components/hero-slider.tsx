"use client"

import { useState, useEffect, useCallback, memo } from "react"
import Image from "next/image"

const images = [
  "/images/hero/index1.jpg",
  "/images/hero/index16.jpg",
  "/images/hero/index17.jpg",
  "/images/hero/index3.jpg",
  "/images/hero/index18.jpg",
  "/images/hero/index19.jpg",
  "/images/hero/index20.jpg",
  "/images/hero/index21.jpg",
  "/images/hero/index22.jpg",
  "/images/hero/index23.jpg",
  "/images/hero/index24.jpg",
  "/images/hero/index25.jpg",
  "/images/hero/index13.jpg",
  "/images/hero/index14.jpg",
  "/images/hero/index15.jpg",
]

const PRELOAD_COUNT = 3

function HeroSliderComponent() {
  const [currentImage, setCurrentImage] = useState(0)
  const [imagesLoaded, setImagesLoaded] = useState<Set<number>>(new Set([0]))

  const nextImage = useCallback(() => {
    setCurrentImage((prev) => {
      const next = (prev + 1) % images.length
      setImagesLoaded((loaded) => new Set([...loaded, next, (next + 1) % images.length]))
      return next
    })
  }, [])

  useEffect(() => {
    const initialImages = new Set<number>()
    for (let i = 0; i < PRELOAD_COUNT; i++) {
      initialImages.add(i)
    }
    setImagesLoaded(initialImages)

    const interval = setInterval(nextImage, 5000)
    return () => clearInterval(interval)
  }, [nextImage])

  return (
    <section className="relative h-screen w-full overflow-hidden">
      {images.map((img, index) => (
        <div
          key={img}
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: currentImage === index ? 1 : 0 }}
        >
          {imagesLoaded.has(index) && (
            <Image
              src={img || "/placeholder.svg"}
              alt={`Villa I Barronci ${index + 1}`}
              fill
              className="object-cover"
              priority={index === 0}
              loading={index === 0 ? "eager" : "lazy"}
              sizes="100vw"
              quality={85}
            />
          )}
        </div>
      ))}

      <div className="absolute inset-0 bg-black/40" />

      <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-center px-4 z-10">
        <h1 className="font-serif text-5xl md:text-7xl font-normal mb-4 tracking-[0.15em]">VILLA I BARRONCI</h1>
        <p className="text-xl md:text-2xl mb-8 tracking-[0.2em] font-light">RESORT & SPA</p>
        <p className="text-base md:text-lg max-w-3xl leading-relaxed mb-10 font-light text-balance">
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
        <a
          href="#contenuto"
          className="flex flex-col items-center text-white hover:opacity-80 transition-opacity"
          aria-label="Scorri verso il basso"
        >
          <svg className="w-8 h-8 animate-bounce" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </a>
      </div>
    </section>
  )
}

export const HeroSlider = memo(HeroSliderComponent)
export default HeroSlider
