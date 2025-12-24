"use client"

import { useState, useCallback, useEffect } from "react"
import Image from "next/image"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageGalleryProps {
  images: {
    src: string
    alt: string
  }[]
  heroIndex?: number
  className?: string
}

export function ImageGallery({ images, heroIndex = 0, className }: ImageGalleryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!images || images.length === 0) {
    return (
      <div className={cn("relative", className)}>
        <Image
          src="/placeholder.svg?height=600&width=800"
          alt="Nessuna immagine disponibile"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <p className="text-white text-lg font-medium">Nessuna foto disponibile</p>
        </div>
      </div>
    )
  }

  const openGallery = useCallback((index: number) => {
    setCurrentIndex(index)
    setIsOpen(true)
    document.body.style.overflow = "hidden"
  }, [])

  const closeGallery = useCallback(() => {
    setIsOpen(false)
    document.body.style.overflow = "auto"
  }, [])

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }, [images.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }, [images.length])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      if (e.key === "Escape") closeGallery()
      if (e.key === "ArrowLeft") goToPrevious()
      if (e.key === "ArrowRight") goToNext()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, closeGallery, goToPrevious, goToNext])

  const validHeroIndex = Math.min(heroIndex, images.length - 1)
  const heroImage = images[validHeroIndex]

  return (
    <>
      {/* Hero Image - Clickable */}
      <div
        className={cn("relative cursor-pointer group", className)}
        onClick={() => openGallery(validHeroIndex)}
        role="button"
        tabIndex={0}
        aria-label="Apri galleria fotografica"
        onKeyDown={(e) => e.key === "Enter" && openGallery(validHeroIndex)}
      >
        <Image
          src={heroImage.src || "/placeholder.svg"}
          alt={heroImage.alt}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          priority
        />
        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/40 transition-colors" />

        {/* Gallery indicator */}
        <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium text-foreground opacity-90 group-hover:opacity-100 transition-opacity">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {images.length} foto
        </div>
      </div>

      {/* Lightbox Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={closeGallery}>
          {/* Close button */}
          <button
            onClick={closeGallery}
            className="absolute top-4 right-4 z-50 p-2 text-white/80 hover:text-white transition-colors"
            aria-label="Chiudi galleria"
          >
            <X className="w-8 h-8" />
          </button>

          {/* Image counter */}
          <div className="absolute top-4 left-4 text-white/80 text-sm font-medium">
            {currentIndex + 1} / {images.length}
          </div>

          {/* Previous button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              goToPrevious()
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-2 text-white/80 hover:text-white transition-colors bg-black/30 hover:bg-black/50 rounded-full"
            aria-label="Foto precedente"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          {/* Next button */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              goToNext()
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-2 text-white/80 hover:text-white transition-colors bg-black/30 hover:bg-black/50 rounded-full"
            aria-label="Foto successiva"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Main image */}
          <div className="relative w-full h-full max-w-6xl max-h-[85vh] mx-4" onClick={(e) => e.stopPropagation()}>
            <Image
              src={images[currentIndex].src || "/placeholder.svg"}
              alt={images[currentIndex].alt}
              fill
              className="object-contain"
              priority
            />
          </div>

          {/* Thumbnails */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto px-4 py-2">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentIndex(index)
                }}
                className={cn(
                  "relative w-16 h-16 flex-shrink-0 rounded overflow-hidden transition-all",
                  currentIndex === index ? "ring-2 ring-white opacity-100" : "opacity-50 hover:opacity-80",
                )}
              >
                <Image src={image.src || "/placeholder.svg"} alt={image.alt} fill className="object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default ImageGallery
