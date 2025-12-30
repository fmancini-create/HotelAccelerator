"use client"

import { useState, memo } from "react"
import Image, { type ImageProps } from "next/image"
import { cn } from "@/lib/utils"

interface OptimizedImageProps extends Omit<ImageProps, "onLoad" | "onError"> {
  fallback?: string
  showSkeleton?: boolean
}

function OptimizedImageComponent({
  src,
  alt,
  className,
  fallback = "/placeholder.svg",
  showSkeleton = true,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {showSkeleton && isLoading && !hasError && <div className="absolute inset-0 bg-muted animate-pulse" />}
      <Image
        src={hasError ? fallback : src}
        alt={alt}
        className={cn("transition-opacity duration-300", isLoading ? "opacity-0" : "opacity-100", className)}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true)
          setIsLoading(false)
        }}
        {...props}
      />
    </div>
  )
}

export const OptimizedImage = memo(OptimizedImageComponent)
export default OptimizedImage
