"use client"

import { useEffect, useState } from "react"
import { ArrowDown } from "lucide-react"

export function HeroSection() {
  const [currentImage, setCurrentImage] = useState(0)

  const images = [
    "https://www.ibarronci.com/img/TOP/index1.jpg",
    "https://www.ibarronci.com/img/TOP/index16.jpg",
    "https://www.ibarronci.com/img/TOP/index17.jpg",
    "https://www.ibarronci.com/img/TOP/index3.jpg",
    "https://www.ibarronci.com/img/TOP/index18.jpg",
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [images.length])

  return (
    <section className="relative h-screen flex items-center justify-center">
      {images.map((img, index) => (
        <div
          key={img}
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
            index === currentImage ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url('${img}')`,
          }}
        >
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
        onClick={() => {
          document.getElementById("panorama")?.scrollIntoView({ behavior: "smooth" })
        }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white animate-bounce"
        aria-label="Scroll down"
      >
        <ArrowDown size={32} />
      </button>
    </section>
  )
}
