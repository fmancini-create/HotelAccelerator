"use client"

import { useState } from "react"
import { CreditCard, TrendingUp, DollarSign, Calendar, Download, Filter } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface BillingStats {
  mrr: number
  arr: number
  mrrGrowth: number
  pendingInvoices: number
  overdueAmount: number
}

interface Invoice {
  id: string
  tenant: string
  amount: number
  status: "paid" | "pending" | "overdue"
  date: string
  plan: string
}

export default function BillingPage() {
  const [stats, setStats] = useState<BillingStats>({
    mrr: 149,
    arr: 1788,
    mrrGrowth: 0,
    pendingInvoices: 0,
    overdueAmount: 0,
  })
  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: "INV-001",
      tenant: "Villa I Barronci",
      amount: 149,
      status: "paid",
      date: new Date().toISOString(),
      plan: "Professional",
    },
  ])
  const [filter, setFilter] = useState("all")

  const filteredInvoices = invoices.filter((inv) => {
    if (filter === "all") return true
    return inv.status === filter
  })

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Billing</h1>
            <p className="text-neutral-500 mt-1">Gestione fatturazione e ricavi</p>
          </div>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Esporta Report
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">MRR</CardTitle>
              <DollarSign className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{stats.mrr.toLocaleString("it-IT")}</div>
              <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                <TrendingUp className="w-3 h-3" />+{stats.mrrGrowth}% vs mese scorso
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">ARR</CardTitle>
              <Calendar className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{stats.arr.toLocaleString("it-IT")}</div>
              <p className="text-xs text-neutral-500 mt-1">Ricavi annuali ricorrenti</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">Fatture Pending</CardTitle>
              <CreditCard className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingInvoices}</div>
              <p className="text-xs text-neutral-500 mt-1">In attesa di pagamento</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">Scaduto</CardTitle>
              <CreditCard className="w-4 h-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">€{stats.overdueAmount.toLocaleString("it-IT")}</div>
              <p className="text-xs text-neutral-500 mt-1">Da recuperare</p>
            </CardContent>
          </Card>
        </div>

        {/* Invoices Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Fatture</CardTitle>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-40">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filtra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="paid">Pagate</SelectItem>
                <SelectItem value="pending">In attesa</SelectItem>
                <SelectItem value="overdue">Scadute</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left text-sm text-neutral-500">
                    <th className="pb-3 font-medium">ID</th>
                    <th className="pb-3 font-medium">Tenant</th>
                    <th className="pb-3 font-medium">Piano</th>
                    <th className="pb-3 font-medium">Importo</th>
                    <th className="pb-3 font-medium">Stato</th>
                    <th className="pb-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td className="py-3 text-sm font-mono">{invoice.id}</td>
                      <td className="py-3 text-sm font-medium">{invoice.tenant}</td>
                      <td className="py-3 text-sm">{invoice.plan}</td>
                      <td className="py-3 text-sm font-semibold">€{invoice.amount}</td>
                      <td className="py-3">
                        <Badge
                          variant={
                            invoice.status === "paid"
                              ? "default"
                              : invoice.status === "pending"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {invoice.status === "paid"
                            ? "Pagata"
                            : invoice.status === "pending"
                              ? "In attesa"
                              : "Scaduta"}
                        </Badge>
                      </td>
                      <td className="py-3 text-sm text-neutral-500">
                        {new Date(invoice.date).toLocaleDateString("it-IT")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredInvoices.length === 0 && (
              <div className="text-center py-8 text-neutral-500">Nessuna fattura trovata</div>
            )}
          </CardContent>
        </Card>

        {/* Stripe Integration Notice */}
        <Card className="mt-6 border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">Integrazione Stripe</p>
              <p className="text-sm text-amber-700">
                Collega Stripe per abilitare pagamenti automatici, fatturazione ricorrente e gestione abbonamenti.
              </p>
            </div>
            <Button variant="outline" className="ml-auto shrink-0 bg-transparent">
              Configura Stripe
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
