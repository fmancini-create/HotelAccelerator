"use client"

import { Badge } from "@/components/ui/badge"
import { Zap, AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import Link from "next/link"

interface SubscriptionBadgeProps {
  subscription: {
    id: string
    plan_type: string
    algorithm_type: string
    is_active: boolean
    trial_end_at: string | null
    payment_status: string
    next_billing_date: string | null
  } | null
}

export function SubscriptionBadge({ subscription }: SubscriptionBadgeProps) {
  if (!subscription) {
    return (
      <Link href="/accelerator/activate">
        <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
          <Zap className="h-3 w-3 mr-1" />
          Attiva Accelerator
        </Badge>
      </Link>
    )
  }

  const isInTrial = subscription.trial_end_at && new Date(subscription.trial_end_at) > new Date()
  const trialDaysRemaining = isInTrial
    ? Math.ceil((new Date(subscription.trial_end_at!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : 0

  const getStatusColor = () => {
    if (!subscription.is_active) return "bg-gray-500"
    if (subscription.payment_status === "failed") return "bg-red-600"
    if (subscription.payment_status === "pending") return "bg-yellow-600"
    if (isInTrial) return "bg-blue-600"
    return "bg-green-600"
  }

  const getStatusIcon = () => {
    if (!subscription.is_active) return <AlertTriangle className="h-3 w-3 mr-1" />
    if (subscription.payment_status === "failed") return <AlertTriangle className="h-3 w-3 mr-1" />
    if (isInTrial) return <Clock className="h-3 w-3 mr-1" />
    return <CheckCircle2 className="h-3 w-3 mr-1" />
  }

  const getStatusText = () => {
    if (!subscription.is_active) return "Disattivato"
    if (isInTrial) return `Prova (${trialDaysRemaining}gg)`
    if (subscription.payment_status === "failed") return "Pagamento Fallito"
    if (subscription.payment_status === "pending") return "In Attesa"
    return subscription.plan_type === "fixed_fee" ? "Fee Fissa" : "Commissione"
  }

  return (
    <Link href="/accelerator/dashboard">
      <Badge className={`${getStatusColor()} text-white cursor-pointer hover:opacity-90`}>
        {getStatusIcon()}
        {getStatusText()}
      </Badge>
    </Link>
  )
}
