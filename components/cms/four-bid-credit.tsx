import Image from "next/image"

export function FourBidCredit({
  inverse = false,
  label = "Sito e marketing by",
}: {
  inverse?: boolean
  label?: string
}) {
  return <a href="https://4bid.it" target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 text-xs ${inverse ? "text-white/75" : "text-neutral-600"}`}>
    <span>{label}</span>
    <Image src="/images/4bid-logo-small.png" alt="4BID" width={52} height={20} className="h-5 w-auto object-contain" />
  </a>
}
