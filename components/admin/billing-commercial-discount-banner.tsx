"use client"

import useSWR from "swr"
import { Percent } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { jsonFetcher } from "@/lib/swr-fetcher"

type BillingOfferResponse = {
  commercialOffer?: {
    eligible: boolean
    discountPercent: number
    allowPromotionStacking: boolean
  }
}

export function BillingCommercialDiscountBanner() {
  const { data } = useSWR<BillingOfferResponse>("/api/admin/billing", jsonFetcher)
  const offer = data?.commercialOffer

  if (!offer?.eligible || offer.discountPercent <= 0) return null

  return (
    <div className="mx-auto max-w-6xl px-8 pt-6">
      <Alert>
        <Percent className="h-4 w-4" />
        <AlertTitle>Vantaggio cliente 4BID: -{offer.discountPercent}%</AlertTitle>
        <AlertDescription>
          Sei gia cliente di un prodotto della suite. Lo sconto viene applicato automaticamente al nuovo abbonamento HotelAccelerator
          {offer.allowPromotionStacking ? "." : " e non si cumula con altri codici promozionali."}
        </AlertDescription>
      </Alert>
    </div>
  )
}
