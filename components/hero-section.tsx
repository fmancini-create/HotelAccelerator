"use client"

import { useEffect, useState, useCallback, memo } from "react"
import Image from "next/image"
import { ArrowDown } from "lucide-react"

const images = [
  "/images/hero/index1.jpg",
  "/images/hero/index16.jpg",
  "/images/hero/index17.jpg",
  "/images/hero/index3.jpg",
  "/images/hero/index18.jpg",
]

function HeroSectionComponent() {
  const [currentImage, setCurrentImage] = useState(0)

  const nextImage = useCallback(() => {
    setCurrentImage((prev) => (prev + 1) % images.length)
  }, [])

  useEffect(() => {
    const interval = setInterval(nextImage, 5000)
    return () => clearInterval(interval)
  }, [nextImage])

  const handleScroll = useCallback(() => {
    document.getElementById("panorama")?.scrollIntoView({ behavior: "smooth" })
  }, [])

  return (
    <section className="relative h-screen flex items-center justify-center">
      {images.map((img, index) => (
        <div
          key={img}
          className={`absolute inset-0 transition-opacity duration-1000 ${index === currentImage ? "opacity-100" : "opacity-0"}`}
        >
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
          <div className="absolute inset-0 bg-black/20" />
        </div>
      ))}

      <div className="relative z-10 text-center text-white px-4">
        <div className="mb-8">
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl mb-2">Villa I Barronci</h1>
          <p className="text-2xl md:text-3xl tracking-wide">Resort & Spa</p>
        </div>
      </div>

      <button
        onClick={handleScroll}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white animate-bounce"
        aria-label="Scorri verso il basso"
      >
        <ArrowDown size={32} />
      </button>
    </section>
  )
}

export const HeroSection = memo(HeroSectionComponent)
export default HeroSection
