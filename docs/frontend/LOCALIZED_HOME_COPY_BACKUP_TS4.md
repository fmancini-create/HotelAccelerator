# Backup copy localizzata home DE / EN / FR — TS-4

> **Backup creato durante TS-4 perché le props erano inerti e non renderizzate dai componenti.**
>
> Le pagine `app/(frontend)/{de,en,fr}/page.tsx` passavano props (`lang`, `title`,
> `subtitle`, `description`, `content`, `ctaText`, `ctaLink`) a componenti che NON
> dichiarano props e NON le usano a runtime (i contenuti sono hardcoded in italiano
> dentro i componenti). Queste props causavano 27 errori TypeScript `TS2322` e non
> producevano alcun output visibile. In TS-4 sono state rimosse dai tag JSX.
>
> Questo file conserva le stringhe tradotte rimosse, così da poterle riutilizzare in
> un futuro cantiere di **vera localizzazione** dei componenti. NON modifica il
> comportamento attuale del sito (le stringhe erano già ignorate).
>
> Nota: i `metadata` (SEO `title`/`description`) di ciascuna pagina NON sono stati
> toccati da TS-4 e restano nel rispettivo `page.tsx`.

---

## DE — `app/(frontend)/de/page.tsx`

Componenti interessati: `Navigation`, `HeroSlider`, `AboutSection`, `PoolSection`, `RestaurantSection`, `ThreeFeaturesSection`, `CTAIconsSection`, `CantinaAntinoriSection`, `Footer`.

### Navigation
- `lang="de"`

### HeroSlider
- `title`: "VILLA I BARRONCI"
- `subtitle`: "RESORT & SPA"
- `description`: "In den Hügeln des Chianti, Ihr Luxusurlaub in der Toskana: historische Villa mit Pool, Wellnessbereich und privatem Park"
- `ctaText`: "I BARRONCI ENTDECKEN"
- `ctaLink`: "/de"

### AboutSection
- `title`: "Villa I Barronci"
- `subtitle`: "Resort & Spa"
- `description`: "Ihr Luxusurlaub in der Toskana erwartet Sie in den Hügeln des Chianti: historische Villa mit Pool, Wellnessbereich und privatem Park"
- `content`: "Es gibt Momente im Leben – und wenn es sie nicht gibt, sollten wir sie schaffen – in denen es endlich an der Zeit ist, sich selbst ein Geschenk zu machen. Orte wie Villa I Barronci Resort & Spa im Herzen des Chianti existieren aus diesem Grund, um uns zu belohnen. Wer die Toskana und ihre üppige Vegetation liebt, kann nicht umhin, eine alte Villa aus dem 13. Jahrhundert zu lieben, die renoviert wurde, um die Kulisse Ihrer Träume zu sein."

### PoolSection
- `title`: "Pool & Whirlpool"
- `description`: "Ein atemberaubender Panoramapool mit Whirlpool"
- `ctaText`: "IN DEN POOL EINTAUCHEN"
- `ctaLink`: "/de/pool-jacuzzi"

### RestaurantSection
- `title`: "da Tiberio in San Casciano"
- `description`: "Der Urlaub in der Toskana hat seine beste Küche gefunden"
- `ctaText`: "RESTAURANT ENTDECKEN"
- `ctaLink`: "/de/restaurant"

### ThreeFeaturesSection
- `lang="de"`

### CTAIconsSection
- `lang="de"`

### CantinaAntinoriSection
- `lang="de"`

### Footer
- `lang="de"`

---

## EN — `app/(frontend)/en/page.tsx`

Componenti interessati: `Navigation`, `HeroSlider`, `AboutSection`, `PoolSection`, `RestaurantSection`, `ThreeFeaturesSection`, `CTAIconsSection`, `CantinaAntinoriSection`, `Footer`.

### Navigation
- `lang="en"`

### HeroSlider
- `title`: "VILLA I BARRONCI"
- `subtitle`: "RESORT & SPA"
- `description`: "In the hills of Chianti, your luxury holiday in Tuscany: period villa with pool, Wellness Area and private park"
- `ctaText`: "DISCOVER I BARRONCI"
- `ctaLink`: "/en"

### AboutSection
- `title`: "Villa I Barronci"
- `subtitle`: "Resort & Spa"
- `description`: "Your luxury holiday in Tuscany awaits you in the hills of the Chianti region: a period villa with pool, wellness area and private park"
- `content`: "There are times in life – and if there aren't, we should create them – when the moment has finally come to give ourselves a gift. Places like Villa I Barronci Resort & Spa, nestled in the heart of the Chianti region, exist for this reason, to reward ourselves. Those who love Tuscany and its lush vegetation, which bestows wellbeing and harmony, cannot help but love an ancient villa from the thirteenth century, refurbished to be the setting of your dreams. All the energy we use here at the villa comes from certified 'green' hydroelectric production plants."

### PoolSection
- `title`: "Pool & Jacuzzi"
- `description`: "A breathtaking panoramic pool, with Jacuzzi"
- `ctaText`: "DIVE INTO THE POOL"
- `ctaLink`: "/en/swimming-pool-jacuzzi"

### RestaurantSection
- `title`: "da Tiberio a San Casciano"
- `description`: "La vacanza in Toscana ha trovato la sua migliore cucina"  _(nota: stringa originariamente in italiano nel sorgente EN)_
- `ctaText`: "DISCOVER THE RESTAURANT"
- `ctaLink`: "/en/restaurant"

### ThreeFeaturesSection
- `lang="en"`

### CTAIconsSection
- `lang="en"`

### CantinaAntinoriSection
- `lang="en"`

### Footer
- `lang="en"`

---

## FR — `app/(frontend)/fr/page.tsx`

Componenti interessati: `Navigation`, `HeroSlider`, `AboutSection`, `PoolSection`, `RestaurantSection`, `ThreeFeaturesSection`, `CTAIconsSection`, `CantinaAntinoriSection`, `Footer`.

### Navigation
- `lang="fr"`

### HeroSlider
- `title`: "VILLA I BARRONCI"
- `subtitle`: "RESORT & SPA"
- `description`: "Dans les collines du Chianti, vos vacances de luxe en Toscane : villa d'époque avec piscine, Espace Bien-être et parc privé"
- `ctaText`: "DÉCOUVRIR I BARRONCI"
- `ctaLink`: "/fr"

### AboutSection
- `title`: "Villa I Barronci"
- `subtitle`: "Resort & Spa"
- `description`: "Vos vacances de luxe en Toscane vous attendent dans les collines du Chianti : villa d'époque avec piscine, espace bien-être et parc privé"
- `content`: "Il y a des moments dans la vie – et si ce n'est pas le cas, nous devons les créer – où il est enfin temps de se faire un cadeau. Des lieux comme Villa I Barronci Resort & Spa, niché au cœur du Chianti, existent pour cette raison, pour nous récompenser. Ceux qui aiment la Toscane et sa végétation luxuriante ne peuvent qu'aimer une villa ancienne du XIIIe siècle, rénovée pour être le cadre de vos rêves."

### PoolSection
- `title`: "Piscine & Jacuzzi"
- `description`: "Une piscine panoramique à couper le souffle, avec Jacuzzi"
- `ctaText`: "PLONGEZ DANS LA PISCINE"
- `ctaLink`: "/fr/piscine-jacuzzi"

### RestaurantSection
- `title`: "da Tiberio à San Casciano"
- `description`: "Les vacances en Toscane ont trouvé leur meilleure cuisine"
- `ctaText`: "DÉCOUVRIR LE RESTAURANT"
- `ctaLink`: "/fr/restaurant"

### ThreeFeaturesSection
- `lang="fr"`

### CTAIconsSection
- `lang="fr"`

### CantinaAntinoriSection
- `lang="fr"`

### Footer
- `lang="fr"`
