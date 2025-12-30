import type { SectionType } from "@/lib/cms/section-schemas"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import type { JSX } from "react"
import Image from "next/image"

import { HeroSlider } from "@/components/hero-slider"
import { AboutSection } from "@/components/about-section"
import { PoolSection } from "@/components/pool-section"
import { RestaurantSection } from "@/components/restaurant-section"
import { FlorenceSection } from "@/components/florence-section"
import { ThreeFeaturesSection } from "@/components/three-features-section"
import { CTAIconsSection } from "@/components/cta-icons-section"
import { CantinaAntinoriSection } from "@/components/cantina-antinori-section"
import { ImageGallery } from "@/components/image-gallery"
import { getPhotosByCategory } from "@/lib/get-photos"

interface Section {
  id: string
  type: SectionType
  data: Record<string, unknown>
}

export async function SectionRenderer({ section }: { section: Section }) {
  switch (section.type) {
    case "hero":
      return <HeroSection data={section.data} />
    case "text":
      return <TextSection data={section.data} />
    case "image":
      return <ImageSection data={section.data} />
    case "gallery":
      return <GallerySection data={section.data} />
    case "video":
      return <VideoSection data={section.data} />
    case "cta":
      return <CTASection data={section.data} />
    case "testimonials":
      return <TestimonialsSection data={section.data} />
    case "features":
      return <FeaturesSection data={section.data} />
    case "pricing":
      return <PricingSection data={section.data} />
    case "contact_form":
      return <ContactFormSection data={section.data} />
    case "map":
      return <MapSection data={section.data} />
    case "faq":
      return <FAQSection data={section.data} />
    case "spacer":
      return <SpacerSection data={section.data} />
    case "villa_hero_slider":
      return <VillaHeroSliderSection data={section.data} />
    case "villa_hero_gallery":
      return <VillaHeroGallerySection data={section.data} />
    case "villa_about":
      return <VillaAboutSection data={section.data} />
    case "villa_pool":
      return <VillaPoolSection data={section.data} />
    case "villa_restaurant":
      return <VillaRestaurantSection data={section.data} />
    case "villa_florence":
      return <VillaFlorenceSection data={section.data} />
    case "villa_three_features":
      return <VillaThreeFeaturesSection data={section.data} />
    case "villa_cta_icons":
      return <VillaCTAIconsSection data={section.data} />
    case "villa_cantina":
      return <VillaCantinaSection data={section.data} />
    case "villa_room_gallery":
      return <VillaRoomGallerySection data={section.data} />
    case "villa_room_intro":
      return <VillaRoomIntroSection data={section.data} />
    default:
      return null
  }
}

// ===========================================
// VILLA-SPECIFIC SECTION COMPONENTS
// ===========================================

function VillaHeroSliderSection({ data }: { data: Record<string, unknown> }) {
  const { title, subtitle, description, ctaText, ctaLink } = data as {
    title?: string
    subtitle?: string
    description?: string
    ctaText?: string
    ctaLink?: string
  }
  return (
    <HeroSlider title={title || ""} subtitle={subtitle} description={description} ctaText={ctaText} ctaLink={ctaLink} />
  )
}

async function VillaHeroGallerySection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    subtitle,
    category,
    heroIndex = 0,
  } = data as {
    title?: string
    subtitle?: string
    category?: string
    heroIndex?: number
  }

  const images = category ? await getPhotosByCategory(category) : []

  return (
    <section id="toppage" className="relative h-screen">
      <ImageGallery images={images} heroIndex={heroIndex} className="absolute inset-0" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none z-10">
        {title && (
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif text-white mb-4 leading-tight">{title}</h1>
        )}
        {subtitle && <h2 className="text-2xl md:text-3xl text-white/95 font-serif font-light">{subtitle}</h2>}
      </div>
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-10">
        <a href="#contenuto" className="block animate-bounce">
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </a>
      </div>
    </section>
  )
}

function VillaAboutSection({ data }: { data: Record<string, unknown> }) {
  const { title, subtitle, description, content } = data as {
    title?: string
    subtitle?: string
    description?: string
    content?: string
  }
  return <AboutSection title={title || ""} subtitle={subtitle} description={description} content={content || ""} />
}

function VillaPoolSection({ data }: { data: Record<string, unknown> }) {
  const { title, description, ctaText, ctaLink } = data as {
    title?: string
    description?: string
    ctaText?: string
    ctaLink?: string
  }
  return <PoolSection title={title || ""} description={description} ctaText={ctaText} ctaLink={ctaLink} />
}

function VillaRestaurantSection({ data }: { data: Record<string, unknown> }) {
  const { title, description, ctaText, ctaLink } = data as {
    title?: string
    description?: string
    ctaText?: string
    ctaLink?: string
  }
  return <RestaurantSection title={title || ""} description={description} ctaText={ctaText} ctaLink={ctaLink} />
}

function VillaFlorenceSection({ data }: { data: Record<string, unknown> }) {
  return <FlorenceSection />
}

function VillaThreeFeaturesSection({ data }: { data: Record<string, unknown> }) {
  const { lang = "it" } = data as { lang?: string }
  return <ThreeFeaturesSection lang={lang} />
}

function VillaCTAIconsSection({ data }: { data: Record<string, unknown> }) {
  const { lang = "it" } = data as { lang?: string }
  return <CTAIconsSection lang={lang} />
}

function VillaCantinaSection({ data }: { data: Record<string, unknown> }) {
  const { lang = "it" } = data as { lang?: string }
  return <CantinaAntinoriSection lang={lang} />
}

async function VillaRoomGallerySection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    description,
    category,
    columns = 4,
  } = data as {
    title?: string
    description?: string
    category?: string
    columns?: number
  }

  const images = category ? await getPhotosByCategory(category) : []

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6 max-w-6xl">
        {title && (
          <>
            <h2 className="font-serif text-[#8b7355] text-3xl md:text-4xl mb-4 text-center">{title}</h2>
            <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
          </>
        )}
        {description && <p className="text-[#7a7a7a] text-center mb-12 max-w-2xl mx-auto">{description}</p>}
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-${columns} gap-4`}>
          {images.map((image, index) => (
            <div key={index} className="aspect-[4/3] relative overflow-hidden rounded-lg group cursor-pointer">
              <Image
                src={image.src || "/placeholder.svg"}
                alt={image.alt}
                layout="fill"
                objectFit="cover"
                className="transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function VillaRoomIntroSection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    subtitle,
    content,
    ctaText,
    ctaLink,
    backgroundColor = "#f5f3f0",
  } = data as {
    title?: string
    subtitle?: string
    content?: string
    ctaText?: string
    ctaLink?: string
    backgroundColor?: string
  }

  return (
    <section id="contenuto" className="py-20" style={{ backgroundColor }}>
      <div className="container mx-auto px-6 max-w-4xl text-center">
        <div className="mb-8">
          <a href="#contenuto" className="inline-block">
            <svg className="w-10 h-10 text-[#999]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </a>
        </div>

        {title && <h1 className="font-serif text-[#8b7355] text-4xl md:text-5xl mb-6">{title}</h1>}
        <div className="w-24 h-px bg-[#8b7355] mx-auto mb-8"></div>
        {subtitle && <h2 className="text-[#7a7a7a] text-xl md:text-2xl mb-10 font-serif">{subtitle}</h2>}

        {ctaText && ctaLink && (
          <a
            href={ctaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#8b7355] hover:bg-[#6d5a42] text-white px-12 py-4 text-base font-semibold transition-colors mb-12"
          >
            {ctaText}
          </a>
        )}

        {content && (
          <div
            className="text-[#7a7a7a] text-base leading-relaxed space-y-4"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}
      </div>
    </section>
  )
}

// ===========================================
// GENERIC SECTION COMPONENTS
// ===========================================

function HeroSection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    subtitle,
    backgroundImage,
    ctaText,
    ctaLink,
    alignment = "center",
  } = data as {
    title?: string
    subtitle?: string
    backgroundImage?: string
    ctaText?: string
    ctaLink?: string
    alignment?: string
  }

  const alignmentClass = {
    left: "items-start text-left",
    center: "items-center text-center",
    right: "items-end text-right",
  }[alignment || "center"]

  return (
    <section
      className="relative min-h-[60vh] flex flex-col justify-center py-20 px-6"
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {backgroundImage && <div className="absolute inset-0 bg-black/50" />}
      <div className={`relative z-10 max-w-4xl mx-auto flex flex-col gap-6 ${alignmentClass}`}>
        <h1 className={`text-4xl md:text-5xl lg:text-6xl font-bold ${backgroundImage ? "text-white" : ""}`}>{title}</h1>
        {subtitle && (
          <p className={`text-xl md:text-2xl ${backgroundImage ? "text-white/90" : "text-muted-foreground"}`}>
            {subtitle}
          </p>
        )}
        {ctaText && ctaLink && (
          <Button asChild size="lg" className="mt-4 w-fit">
            <a href={ctaLink}>{ctaText}</a>
          </Button>
        )}
      </div>
    </section>
  )
}

function TextSection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    content,
    headingLevel = "h2",
  } = data as {
    title?: string
    content?: string
    headingLevel?: string
  }

  const HeadingTag = (headingLevel || "h2") as keyof JSX.IntrinsicElements

  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        {title && <HeadingTag className="text-3xl font-bold mb-6">{title}</HeadingTag>}
        <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: content || "" }} />
      </div>
    </section>
  )
}

function ImageSection({ data }: { data: Record<string, unknown> }) {
  const { src, alt, caption } = data as {
    src?: string
    alt?: string
    caption?: string
  }

  if (!src) return null

  return (
    <section className="py-8 px-6">
      <figure className="max-w-4xl mx-auto">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg shadow-lg">
          <Image
            src={src || "/placeholder.svg"}
            alt={alt || ""}
            layout="fill"
            objectFit="cover"
            className="group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            decoding="async"
          />
        </div>
        {caption && <figcaption className="text-center text-muted-foreground mt-4">{caption}</figcaption>}
      </figure>
    </section>
  )
}

function GallerySection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    images = [],
    columns = 3,
  } = data as {
    title?: string
    images?: { src: string; alt: string; caption?: string }[]
    columns?: number
  }

  const gridCols =
    {
      1: "grid-cols-1",
      2: "grid-cols-1 md:grid-cols-2",
      3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
      5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
      6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
    }[columns] || "grid-cols-3"

  return (
    <section className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-8 text-center">{title}</h2>}
        <div className={`grid ${gridCols} gap-4`}>
          {images.map((image, index) => (
            <figure key={index} className="group relative overflow-hidden rounded-lg">
              <Image
                src={image.src || "/placeholder.svg"}
                alt={image.alt || ""}
                layout="fill"
                objectFit="cover"
                className="group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                decoding="async"
              />
              {image.caption && (
                <figcaption className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-sm">
                  {image.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

function VideoSection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    url,
    provider = "youtube",
  } = data as {
    title?: string
    url?: string
    provider?: string
  }

  if (!url) return null

  // Extract video ID based on provider
  let embedUrl = url
  if ((provider === "youtube" && url.includes("youtube.com")) || url.includes("youtu.be")) {
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)?.[1]
    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`
  } else if (provider === "vimeo" && url.includes("vimeo.com")) {
    const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1]
    if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}`
  }

  return (
    <section className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-8 text-center">{title}</h2>}
        <div className="relative pb-[56.25%] h-0 overflow-hidden rounded-lg shadow-lg">
          <iframe
            src={embedUrl}
            className="absolute top-0 left-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  )
}

function CTASection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    description,
    buttonText,
    buttonLink,
    variant = "primary",
  } = data as {
    title?: string
    description?: string
    buttonText?: string
    buttonLink?: string
    variant?: string
  }

  return (
    <section className="py-16 px-6 bg-primary/5">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">{title}</h2>
        {description && <p className="text-lg text-muted-foreground mb-8">{description}</p>}
        {buttonText && buttonLink && (
          <Button asChild size="lg" variant={variant === "outline" ? "outline" : "default"}>
            <a href={buttonLink}>{buttonText}</a>
          </Button>
        )}
      </div>
    </section>
  )
}

function TestimonialsSection({ data }: { data: Record<string, unknown> }) {
  const { title, items = [] } = data as {
    title?: string
    items?: { name: string; role?: string; quote: string; avatar?: string; rating?: number }[]
  }

  return (
    <section className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-12 text-center">{title}</h2>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                {item.rating && (
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className={i < item.rating! ? "text-yellow-500" : "text-gray-300"}>
                        ★
                      </span>
                    ))}
                  </div>
                )}
                <blockquote className="text-lg mb-4">&quot;{item.quote}&quot;</blockquote>
                <div className="flex items-center gap-3">
                  {item.avatar && (
                    <Image
                      src={item.avatar || "/placeholder.svg"}
                      alt={item.name}
                      width={40}
                      height={40}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="font-medium">{item.name}</p>
                    {item.role && <p className="text-sm text-muted-foreground">{item.role}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function FeaturesSection({ data }: { data: Record<string, unknown> }) {
  const {
    title,
    subtitle,
    items = [],
    columns = 3,
  } = data as {
    title?: string
    subtitle?: string
    items?: { icon?: string; title: string; description: string }[]
    columns?: number
  }

  const gridCols =
    {
      1: "grid-cols-1",
      2: "grid-cols-1 md:grid-cols-2",
      3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
      4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
    }[columns] || "grid-cols-3"

  return (
    <section className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-4 text-center">{title}</h2>}
        {subtitle && <p className="text-lg text-muted-foreground mb-12 text-center max-w-2xl mx-auto">{subtitle}</p>}
        <div className={`grid ${gridCols} gap-8`}>
          {items.map((item, index) => (
            <div key={index} className="text-center">
              {item.icon && <span className="text-4xl mb-4 block">{item.icon}</span>}
              <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
              <p className="text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PricingSection({ data }: { data: Record<string, unknown> }) {
  const { title, items = [] } = data as {
    title?: string
    items?: {
      name: string
      price: string
      period?: string
      description?: string
      features: string[]
      highlighted?: boolean
      ctaText?: string
      ctaLink?: string
    }[]
  }

  return (
    <section className="py-16 px-6">
      <div className="max-w-6xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-12 text-center">{title}</h2>}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((item, index) => (
            <Card key={index} className={item.highlighted ? "border-primary shadow-lg scale-105" : ""}>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold mb-2">{item.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{item.price}</span>
                  {item.period && <span className="text-muted-foreground">/{item.period}</span>}
                </div>
                {item.description && <p className="text-muted-foreground mb-6">{item.description}</p>}
                <ul className="space-y-2 mb-6">
                  {item.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-green-500">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                {item.ctaText && item.ctaLink && (
                  <Button asChild className="w-full" variant={item.highlighted ? "default" : "outline"}>
                    <a href={item.ctaLink}>{item.ctaText}</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

function ContactFormSection({ data }: { data: Record<string, unknown> }) {
  const { title, description, email } = data as {
    title?: string
    description?: string
    email?: string
  }

  return (
    <section className="py-16 px-6 bg-muted/30">
      <div className="max-w-xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-4 text-center">{title}</h2>}
        {description && <p className="text-muted-foreground mb-8 text-center">{description}</p>}
        <form className="space-y-4" action={`mailto:${email}`} method="POST" encType="text/plain">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Nome
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-2">
              Messaggio
            </label>
            <textarea
              id="message"
              name="message"
              rows={4}
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
          <Button type="submit" className="w-full">
            Invia Messaggio
          </Button>
        </form>
      </div>
    </section>
  )
}

function MapSection({ data }: { data: Record<string, unknown> }) {
  const {
    latitude,
    longitude,
    zoom = 15,
    address,
    title,
  } = data as {
    latitude?: number
    longitude?: number
    zoom?: number
    address?: string
    title?: string
  }

  if (!latitude || !longitude) return null

  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}&layer=mapnik&marker=${latitude},${longitude}`

  return (
    <section className="py-16 px-6">
      <div className="max-w-4xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-4 text-center">{title}</h2>}
        {address && <p className="text-muted-foreground mb-8 text-center">{address}</p>}
        <div className="relative h-[400px] rounded-lg overflow-hidden shadow-lg">
          <iframe src={mapUrl} className="absolute inset-0 w-full h-full border-0" loading="lazy" />
        </div>
      </div>
    </section>
  )
}

function FAQSection({ data }: { data: Record<string, unknown> }) {
  const { title, items = [] } = data as {
    title?: string
    items?: { question: string; answer: string }[]
  }

  return (
    <section className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        {title && <h2 className="text-3xl font-bold mb-8 text-center">{title}</h2>}
        <Accordion type="single" collapsible className="w-full">
          {items.map((item, index) => (
            <AccordionItem key={index} value={`item-${index}`}>
              <AccordionTrigger className="text-left">{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  )
}

function SpacerSection({ data }: { data: Record<string, unknown> }) {
  const { height = 48 } = data as { height?: number }
  return <div style={{ height: `${height}px` }} />
}
