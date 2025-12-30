export function HotelSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "@id": "https://www.ibarronci.com/#hotel",
    name: "Villa I Barronci Resort & Spa",
    description:
      "Resort di lusso nel cuore del Chianti con piscina panoramica, spa, ristorante gourmet e camere eleganti. Villa storica del XIII secolo tra Firenze e Siena.",
    url: "https://www.ibarronci.com",
    telephone: "+39 055 820598",
    email: "info@ibarronci.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Via Sorripa, 10",
      addressLocality: "San Casciano in Val di Pesa",
      addressRegion: "Toscana",
      postalCode: "50026",
      addressCountry: "IT",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 43.6543,
      longitude: 11.1234,
    },
    image: [
      "https://www.ibarronci.com/images/villa-esterno.jpg",
      "https://www.ibarronci.com/images/pool/piscina-tramonto.jpg",
      "https://www.ibarronci.com/images/design-mode/villa-i-barronci-web-0011.webp",
    ],
    priceRange: "€€€",
    currenciesAccepted: "EUR",
    paymentAccepted: "Cash, Credit Card, Debit Card",
    starRating: {
      "@type": "Rating",
      ratingValue: "4",
      bestRating: "5",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.7",
      reviewCount: "523",
      bestRating: "5",
      worstRating: "1",
    },
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Piscina panoramica", value: true },
      { "@type": "LocationFeatureSpecification", name: "Spa e Area Relax Namaste", value: true },
      { "@type": "LocationFeatureSpecification", name: "Ristorante Da Tiberio", value: true },
      { "@type": "LocationFeatureSpecification", name: "Parcheggio gratuito", value: true },
      { "@type": "LocationFeatureSpecification", name: "Wi-Fi gratuito", value: true },
      { "@type": "LocationFeatureSpecification", name: "Jacuzzi", value: true },
      { "@type": "LocationFeatureSpecification", name: "Sauna", value: true },
      { "@type": "LocationFeatureSpecification", name: "Bagno turco", value: true },
      { "@type": "LocationFeatureSpecification", name: "Aria condizionata", value: true },
      { "@type": "LocationFeatureSpecification", name: "Reception 24 ore", value: true },
      { "@type": "LocationFeatureSpecification", name: "Servizio in camera", value: true },
      { "@type": "LocationFeatureSpecification", name: "Animali ammessi", value: true },
    ],
    checkinTime: "15:00",
    checkoutTime: "11:00",
    numberOfRooms: 30,
    petsAllowed: true,
    hasMap: "https://maps.google.com/?q=Villa+I+Barronci+San+Casciano",
    sameAs: [
      "https://www.facebook.com/villaibarronci",
      "https://www.instagram.com/villaibarronci",
      "https://www.tripadvisor.it/Hotel_Review-Villa_I_Barronci",
    ],
    containsPlace: [
      {
        "@type": "Restaurant",
        name: "Ristorante Da Tiberio",
        servesCuisine: ["Italian", "Tuscan", "Mediterranean"],
      },
      {
        "@type": "HealthAndBeautyBusiness",
        name: "Namaste Spa & Wellness",
      },
    ],
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function BreadcrumbSchema({ items }: { items: { name: string; url: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `https://www.ibarronci.com${item.url}`,
    })),
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function LocalBusinessSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://www.ibarronci.com/#localbusiness",
    name: "Villa I Barronci Resort & Spa",
    image: "https://www.ibarronci.com/images/villa-esterno.jpg",
    telephone: "+39 055 820598",
    email: "info@ibarronci.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Via Sorripa, 10",
      addressLocality: "San Casciano in Val di Pesa",
      addressRegion: "Toscana",
      postalCode: "50026",
      addressCountry: "IT",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 43.6543,
      longitude: 11.1234,
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59",
    },
    priceRange: "€€€",
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function FAQSchema({ faqs }: { faqs: { question: string; answer: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function RoomSchema({
  name,
  description,
  image,
  priceFrom,
  url,
}: {
  name: string
  description: string
  image: string
  priceFrom: number
  url: string
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HotelRoom",
    name,
    description,
    image,
    url,
    offers: {
      "@type": "Offer",
      priceSpecification: {
        "@type": "PriceSpecification",
        price: priceFrom,
        priceCurrency: "EUR",
        unitText: "per night",
      },
      availability: "https://schema.org/InStock",
    },
    bed: {
      "@type": "BedDetails",
      typeOfBed: "King Size",
    },
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Wi-Fi", value: true },
      { "@type": "LocationFeatureSpecification", name: "Aria condizionata", value: true },
      { "@type": "LocationFeatureSpecification", name: "Minibar", value: true },
      { "@type": "LocationFeatureSpecification", name: "TV satellitare", value: true },
    ],
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://hotelaccelerator.com/#organization",
    name: "HotelAccelerator",
    url: "https://hotelaccelerator.com",
    logo: "https://hotelaccelerator.com/images/4bid-logo.png",
    description: "Piattaforma SaaS all-in-one per hotel: CMS, CRM, Email Marketing, Inbox Omnicanale e AI Assistant",
    foundingDate: "2024",
    founders: [
      {
        "@type": "Person",
        name: "4BID Team",
      },
    ],
    address: {
      "@type": "PostalAddress",
      addressCountry: "IT",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "info@hotelaccelerator.com",
    },
    sameAs: ["https://www.linkedin.com/company/hotelaccelerator"],
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function SoftwareSchema({
  name,
  description,
  category,
  url,
}: {
  name: string
  description: string
  category: string
  url: string
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    applicationCategory: category,
    operatingSystem: "Web",
    url,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Demo gratuita disponibile",
    },
    publisher: {
      "@type": "Organization",
      name: "HotelAccelerator",
    },
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}

export function WebSiteSchema({ baseUrl }: { baseUrl: string }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    name: "Villa I Barronci Resort & Spa",
    url: baseUrl,
    inLanguage: ["it-IT", "en-US", "de-DE", "fr-FR"],
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  }

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
}
