export function HotelSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    name: "Villa I Barronci Resort & Spa",
    description:
      "Resort di lusso nel cuore del Chianti con piscina panoramica, spa, ristorante gourmet e camere eleganti.",
    url: "https://www.ibarronci.com",
    telephone: "+39 055 820598",
    email: "info@ibarronci.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Via Sorripa, 10",
      addressLocality: "San Casciano in Val di Pesa",
      addressRegion: "FI",
      postalCode: "50026",
      addressCountry: "IT",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 43.6543,
      longitude: 11.1234,
    },
    image: [
      "https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg",
      "https://ibarronci.com/wp-content/uploads/2024/11/villa-i-barronci-web-0011.webp",
    ],
    priceRange: "€€€",
    starRating: {
      "@type": "Rating",
      ratingValue: "4",
    },
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Piscina panoramica" },
      { "@type": "LocationFeatureSpecification", name: "Spa e Area Relax" },
      { "@type": "LocationFeatureSpecification", name: "Ristorante gourmet" },
      { "@type": "LocationFeatureSpecification", name: "Parcheggio gratuito" },
      { "@type": "LocationFeatureSpecification", name: "Wi-Fi gratuito" },
      { "@type": "LocationFeatureSpecification", name: "Jacuzzi" },
    ],
    hasMap: "https://maps.google.com/?q=Villa+I+Barronci",
    sameAs: ["https://www.facebook.com/villaibarronci", "https://www.instagram.com/villaibarronci"],
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
    "@id": "https://www.ibarronci.com",
    name: "Villa I Barronci Resort & Spa",
    image: "https://ibarronci.com/wp-content/uploads/2023/08/Villa-I-Barronci-Panoramica.jpg",
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
