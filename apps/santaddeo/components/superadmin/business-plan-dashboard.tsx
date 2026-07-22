"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  TrendingDown,
  Target,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  PieChart,
  Calculator,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

// =====================================================
// DATI BUSINESS PLAN - SANTADDEO RMS PLATFORM
// Basato su: SaaS B2B per Revenue Management Strutture Ricettive
// Target: Hotel indipendenti e piccole catene in Italia
// =====================================================

type Scenario = "worst" | "base" | "best"

interface YearData {
  year: number
  hotels: number
  avgRoomsPerHotel: number
  revenuePerRoom: number
  churnRate: number
  setupFee: number
  monthlyRecurring: number
  annualRecurring: number
  setupRevenue: number
  totalRevenue: number
  infrastructure: number
  development: number
  salesMarketing: number
  support: number
  operations: number
  totalCosts: number
  ebitda: number
  ebitdaMargin: number
  cashFlow: number
  cumulativeCashFlow: number
}

interface ScenarioData {
  name: string
  description: string
  assumptions: string[]
  years: YearData[]
  breakEvenMonth: number
  totalInvestmentNeeded: number
  roi5Years: number
  totalRevenue5Y: number
  totalProfit5Y: number
}

function calculateScenarioData(scenario: Scenario): ScenarioData {
  const baseParams = {
    worst: {
      name: "Scenario Pessimistico",
      description: "Crescita lenta, alta competizione, churn elevato",
      assumptions: [
        "Acquisizione solo 3-6 hotel/anno (mercato molto difficile)",
        "Prezzo medio €3.50/camera/mese (forte pressione competitiva)",
        "Churn rate 25% annuo (alta insoddisfazione)",
        "Setup fee €400 per hotel",
        "Solo founder operativo + freelancer occasionali",
        "Alto effort commerciale con basso conversion",
      ],
      hotelsY1: 3,
      hotelsY2: 6,
      hotelsY3: 10,
      hotelsY4: 14,
      hotelsY5: 18,
      pricePerRoom: 3.5,
      avgRooms: 30,
      churn: 0.25,
      setupFee: 400,
      // Costi molto bassi (founder bootstrap)
      infraBase: 150, // €/mese
      devCostY1: 12000, // freelancer occasionale
      devGrowth: 3000,
      salesBase: 3000,
      salesPct: 0.08,
      supportPerHotel: 100,
      opsBase: 6000,
    },
    base: {
      name: "Scenario Base",
      description: "Crescita moderata, esecuzione solida",
      assumptions: [
        "Acquisizione 8-15 hotel/anno (go-to-market efficace)",
        "Prezzo medio €4.50/camera/mese (value pricing)",
        "Churn rate 15% annuo (buona soddisfazione)",
        "Setup fee €800 per hotel",
        "Founder full-time + 1 dev part-time dal Y2",
        "Marketing digitale mirato + passaparola",
      ],
      hotelsY1: 8,
      hotelsY2: 20,
      hotelsY3: 40,
      hotelsY4: 65,
      hotelsY5: 95,
      pricePerRoom: 4.5,
      avgRooms: 35,
      churn: 0.15,
      setupFee: 800,
      // Costi lean startup
      infraBase: 200, // €/mese
      devCostY1: 15000, // founder + tools
      devGrowth: 12000, // aggiunge dev part-time
      salesBase: 5000,
      salesPct: 0.06,
      supportPerHotel: 150,
      opsBase: 8000,
    },
    best: {
      name: "Scenario Ottimistico",
      description: "Forte traction, partnership strategiche",
      assumptions: [
        "Acquisizione 15-30 hotel/anno (viralità + referral)",
        "Prezzo medio €5.50/camera/mese (premium positioning)",
        "Churn rate 8% annuo (alto NPS, sticky product)",
        "Setup fee €1,200 per hotel",
        "Team: Founder + 1 dev full-time Y2 + sales Y3",
        "Partnership con associazioni Federalberghi",
      ],
      hotelsY1: 15,
      hotelsY2: 35,
      hotelsY3: 70,
      hotelsY4: 110,
      hotelsY5: 160,
      pricePerRoom: 5.5,
      avgRooms: 40,
      churn: 0.08,
      setupFee: 1200,
      // Costi crescenti ma controllati
      infraBase: 250, // €/mese
      devCostY1: 18000, // founder + tools premium
      devGrowth: 25000, // aggiunge dev full-time
      salesBase: 8000,
      salesPct: 0.05,
      supportPerHotel: 120,
      opsBase: 10000,
    },
  }

  const params = baseParams[scenario]
  const years: YearData[] = []

  // Investimento iniziale più realistico
  const initialInvestment = scenario === "worst" ? 15000 : scenario === "best" ? 30000 : 20000
  let cumulativeCash = -initialInvestment

  for (let y = 1; y <= 5; y++) {
    const hotels =
      y === 1
        ? params.hotelsY1
        : y === 2
          ? params.hotelsY2
          : y === 3
            ? params.hotelsY3
            : y === 4
              ? params.hotelsY4
              : params.hotelsY5
    const prevHotels = y === 1 ? 0 : years[y - 2].hotels

    // Calcola nuovi hotel (considerando churn)
    const retainedHotels = Math.floor(prevHotels * (1 - params.churn))
    const newHotels = Math.max(0, hotels - retainedHotels)

    const totalRooms = hotels * params.avgRooms
    const mrr = totalRooms * params.pricePerRoom
    const arr = mrr * 12
    const setupRev = newHotels * params.setupFee

    // COSTI - Realistici per founder-led startup
    // Infrastruttura: base mensile + piccolo costo per hotel
    const infraCost = (params.infraBase + hotels * 15) * 12

    // Sviluppo: cresce con gli anni man mano che si assume
    const devCost = params.devCostY1 + (y - 1) * params.devGrowth

    // Sales & Marketing: base + % del revenue
    const salesCost = params.salesBase + arr * params.salesPct

    // Customer Support: per hotel (founder fa molto all'inizio)
    const supportCost = hotels * params.supportPerHotel

    // Operations: fissi + piccola crescita
    const opsCost = params.opsBase + (y - 1) * 2000

    const totalCosts = infraCost + devCost + salesCost + supportCost + opsCost
    const totalRevenue = arr + setupRev
    const ebitda = totalRevenue - totalCosts
    const ebitdaMargin = totalRevenue > 0 ? (ebitda / totalRevenue) * 100 : 0

    // Cash flow: EBITDA - working capital adjustment
    const cashFlow = ebitda * 0.9
    cumulativeCash += cashFlow

    years.push({
      year: 2026 + y - 1,
      hotels,
      avgRoomsPerHotel: params.avgRooms,
      revenuePerRoom: params.pricePerRoom,
      churnRate: params.churn * 100,
      setupFee: params.setupFee,
      monthlyRecurring: mrr,
      annualRecurring: arr,
      setupRevenue: setupRev,
      totalRevenue,
      infrastructure: infraCost,
      development: devCost,
      salesMarketing: salesCost,
      support: supportCost,
      operations: opsCost,
      totalCosts,
      ebitda,
      ebitdaMargin,
      cashFlow,
      cumulativeCashFlow: cumulativeCash,
    })
  }

  const totalRevenue5Y = years.reduce((sum, y) => sum + y.totalRevenue, 0)
  const totalProfit5Y = years.reduce((sum, y) => sum + y.ebitda, 0)

  // ROI = Profit / Investment * 100
  const roi = (totalProfit5Y / initialInvestment) * 100

  // Break-even: calcola mese approssimativo (60 mesi = 5 anni)
  let breakEven = 999
  let cumulative = -initialInvestment
  for (let m = 1; m <= 60; m++) {
    const yearIdx = Math.floor((m - 1) / 12)
    if (yearIdx < years.length) {
      cumulative += years[yearIdx].cashFlow / 12
      if (cumulative >= 0 && breakEven === 999) {
        breakEven = m
        break
      }
    }
  }

  return {
    ...params,
    years,
    breakEvenMonth: breakEven,
    totalInvestmentNeeded: initialInvestment,
    roi5Years: roi,
    totalRevenue5Y,
    totalProfit5Y,
  }
}

const scenarios: Record<Scenario, ScenarioData> = {
  worst: calculateScenarioData("worst"),
  base: calculateScenarioData("base"),
  best: calculateScenarioData("best"),
}

// Componenti UI
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle?: string
  trend?: "up" | "down" | "neutral"
  icon?: React.ElementType
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{title}</span>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">{value}</span>
          {trend === "up" && <TrendingUp className="h-4 w-4 text-green-600" />}
          {trend === "down" && <TrendingDown className="h-4 w-4 text-red-600" />}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `€${(value / 1000000).toFixed(2)}M`
  }
  if (Math.abs(value) >= 1000) {
    return `€${(value / 1000).toFixed(1)}K`
  }
  return `€${value.toFixed(0)}`
}

function YearCard({ data }: { data: YearData }) {
  const isPositive = data.ebitda > 0

  return (
    <Card className={isPositive ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30"}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Anno {data.year}</CardTitle>
          <Badge variant={isPositive ? "default" : "destructive"} className={isPositive ? "" : "text-white"}>
            {isPositive ? "Profitto" : "Perdita"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI principali */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 bg-background rounded-lg border">
            <div className="text-2xl font-bold text-blue-600">{data.hotels}</div>
            <div className="text-xs text-muted-foreground">Hotel</div>
          </div>
          <div className="text-center p-3 bg-background rounded-lg border">
            <div className="text-2xl font-bold text-purple-600">{formatCurrency(data.monthlyRecurring)}</div>
            <div className="text-xs text-muted-foreground">MRR</div>
          </div>
        </div>

        {/* Revenues */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">ARR (Ricorrente)</span>
            <span className="font-medium">{formatCurrency(data.annualRecurring)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Setup Fees</span>
            <span className="font-medium">{formatCurrency(data.setupRevenue)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t pt-1">
            <span>Fatturato Totale</span>
            <span className="text-green-600">{formatCurrency(data.totalRevenue)}</span>
          </div>
        </div>

        {/* Costi */}
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-1">COSTI</div>
          <div className="flex justify-between text-xs">
            <span>Infrastruttura</span>
            <span>{formatCurrency(data.infrastructure)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Sviluppo</span>
            <span>{formatCurrency(data.development)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Sales & Marketing</span>
            <span>{formatCurrency(data.salesMarketing)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Customer Support</span>
            <span>{formatCurrency(data.support)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Operations</span>
            <span>{formatCurrency(data.operations)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t pt-1">
            <span>Costi Totali</span>
            <span className="text-red-600">{formatCurrency(data.totalCosts)}</span>
          </div>
        </div>

        {/* EBITDA */}
        <div className={`p-3 rounded-lg ${isPositive ? "bg-green-100" : "bg-red-100"}`}>
          <div className="flex justify-between items-center">
            <span className="font-semibold">EBITDA</span>
            <span className={`text-xl font-bold ${isPositive ? "text-green-700" : "text-red-700"}`}>
              {formatCurrency(data.ebitda)}
            </span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span>Margine</span>
            <span>{data.ebitdaMargin.toFixed(1)}%</span>
          </div>
        </div>

        {/* Cash Flow cumulativo */}
        <div className="text-center pt-2 border-t">
          <div className="text-xs text-muted-foreground">Cash Flow Cumulativo</div>
          <div className={`text-lg font-bold ${data.cumulativeCashFlow >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(data.cumulativeCashFlow)}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AssumptionsList({ assumptions }: { assumptions: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="h-4 w-4" />
          Assunzioni Chiave
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {assumptions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function RisksCard({ scenario }: { scenario: Scenario }) {
  const risks = {
    worst: [
      "Mercato saturo, difficolta acquisizione clienti",
      "Competizione da player internazionali (IDeaS, Duetto)",
      "Resistenza al cambiamento degli albergatori tradizionali",
      "Churn elevato erode la base clienti",
    ],
    base: [
      "Tempi di vendita piu lunghi del previsto (ciclo 2-4 mesi)",
      "Necessita di piu customizzazioni per cliente",
      "Stagionalita del settore (Q1 lento)",
    ],
    best: [
      "Scaling troppo veloce, problemi di qualita servizio",
      "Dipendenza da poche partnership chiave",
      "Concorrenti reagiscono abbassando prezzi",
    ],
  }

  return (
    <Card className="border-orange-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-orange-700">
          <AlertTriangle className="h-4 w-4" />
          Rischi Principali
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {risks[scenario].map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <div className="h-2 w-2 rounded-full bg-orange-500 mt-1.5 flex-shrink-0" />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ComparisonTable() {
  const worst = scenarios.worst
  const base = scenarios.base
  const best = scenarios.best

  const data = [
    {
      metric: "Hotel Anno 5",
      worst: worst.years[4].hotels,
      base: base.years[4].hotels,
      best: best.years[4].hotels,
    },
    {
      metric: "MRR Anno 5",
      worst: formatCurrency(worst.years[4].monthlyRecurring),
      base: formatCurrency(base.years[4].monthlyRecurring),
      best: formatCurrency(best.years[4].monthlyRecurring),
    },
    {
      metric: "Fatturato Anno 5",
      worst: formatCurrency(worst.years[4].totalRevenue),
      base: formatCurrency(base.years[4].totalRevenue),
      best: formatCurrency(best.years[4].totalRevenue),
    },
    {
      metric: "EBITDA Anno 5",
      worst: formatCurrency(worst.years[4].ebitda),
      base: formatCurrency(base.years[4].ebitda),
      best: formatCurrency(best.years[4].ebitda),
    },
    {
      metric: "Fatturato Totale 5Y",
      worst: formatCurrency(worst.totalRevenue5Y),
      base: formatCurrency(base.totalRevenue5Y),
      best: formatCurrency(best.totalRevenue5Y),
    },
    {
      metric: "Profitto Totale 5Y",
      worst: formatCurrency(worst.totalProfit5Y),
      base: formatCurrency(base.totalProfit5Y),
      best: formatCurrency(best.totalProfit5Y),
    },
    {
      metric: "Investimento Iniziale",
      worst: formatCurrency(worst.totalInvestmentNeeded),
      base: formatCurrency(base.totalInvestmentNeeded),
      best: formatCurrency(best.totalInvestmentNeeded),
    },
    {
      metric: "ROI 5 anni",
      worst: `${worst.roi5Years.toFixed(0)}%`,
      base: `${base.roi5Years.toFixed(0)}%`,
      best: `${best.roi5Years.toFixed(0)}%`,
    },
    {
      metric: "Break-even (mesi)",
      worst: worst.breakEvenMonth > 60 ? "Mai" : worst.breakEvenMonth,
      base: base.breakEvenMonth > 60 ? "60+" : base.breakEvenMonth,
      best: best.breakEvenMonth > 60 ? "60+" : best.breakEvenMonth,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Confronto Scenari
        </CardTitle>
        <CardDescription>Metriche chiave a 5 anni calcolate a confronto</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium">Metrica</th>
                <th className="text-right py-2 font-medium text-red-600">Pessimistico</th>
                <th className="text-right py-2 font-medium text-blue-600">Base</th>
                <th className="text-right py-2 font-medium text-green-600">Ottimistico</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2 text-muted-foreground">{row.metric}</td>
                  <td className="py-2 text-right font-mono text-red-700">{row.worst}</td>
                  <td className="py-2 text-right font-mono font-medium text-blue-700">{row.base}</td>
                  <td className="py-2 text-right font-mono text-green-700">{row.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function MarketAnalysis() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5" />
          Analisi di Mercato
        </CardTitle>
        <CardDescription>Mercato italiano hospitality</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">33,000</div>
            <div className="text-xs text-muted-foreground">Hotel in Italia</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">~1.1M</div>
            <div className="text-xs text-muted-foreground">Camere totali</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">12-15%</div>
            <div className="text-xs text-muted-foreground">Usano RMS oggi</div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">28,000</div>
            <div className="text-xs text-muted-foreground">Hotel senza RMS</div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <h4 className="font-medium text-sm">Target primario SANTADDEO</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>- Hotel indipendenti 20-60 camere</li>
            <li>- Boutique hotel e agriturismi 3-4 stelle</li>
            <li>- Piccole catene familiari (2-5 strutture)</li>
            <li>- Focus: Toscana, Liguria, Veneto, Emilia-Romagna</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function PricingModel({ scenario }: { scenario: ScenarioData }) {
  const avgArpu = scenario.years[2].monthlyRecurring / scenario.years[2].hotels
  const ltv = avgArpu * 60 * (1 - scenario.years[2].churnRate / 100) // 60 mesi = 5 anni
  const cac = 800 // Stima CAC medio

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Modello di Pricing
        </CardTitle>
        <CardDescription>Struttura ricavi e unit economics</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium text-sm mb-2">Pricing per camera/mese</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>1-30 camere</span>
              <span className="font-medium">€5.50/camera</span>
            </div>
            <div className="flex justify-between">
              <span>31-60 camere</span>
              <span className="font-medium">€4.50/camera</span>
            </div>
            <div className="flex justify-between">
              <span>61+ camere</span>
              <span className="font-medium">€3.50/camera</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t">
          <h4 className="font-medium text-sm">Unit Economics (scenario base)</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted cursor-help">ARPU mensile:</TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      <strong>ARPU</strong> (Average Revenue Per User): Ricavo medio mensile per cliente/hotel
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium">{formatCurrency(avgArpu)}</span>
            </div>
            <div className="flex justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted cursor-help">LTV (5 anni):</TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      <strong>LTV</strong> (Lifetime Value): Valore totale generato da un cliente in 5 anni,
                      considerando il churn rate
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium">{formatCurrency(ltv)}</span>
            </div>
            <div className="flex justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted cursor-help">CAC stimato:</TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      <strong>CAC</strong> (Customer Acquisition Cost): Costo medio per acquisire un nuovo cliente,
                      inclusi marketing, vendite, demo e onboarding. Include tempo del founder + costi diretti.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium">€800</span>
            </div>
            <div className="flex justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted cursor-help">LTV/CAC:</TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      <strong>Rapporto Valore/Costo Cliente</strong>: Indica quanto vale un cliente rispetto a quanto
                      costa acquisirlo. Un rapporto {">"} 3x è considerato sano per un SaaS. 6x indica un modello molto
                      efficiente.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-medium text-green-600">6.0x</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BusinessPlanDashboard() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario>("base")
  const scenario = scenarios[selectedScenario]

  const summaryStatus = scenario.totalProfit5Y > 0 ? "profitable" : "loss"

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Scenario Selector */}
        <div className="flex items-center justify-center gap-2 p-4 bg-muted/50 rounded-lg">
          <span className="text-sm font-medium mr-2">Seleziona scenario:</span>
          <Button
            variant={selectedScenario === "worst" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedScenario("worst")}
            className={selectedScenario === "worst" ? "bg-red-600 hover:bg-red-700 text-white" : ""}
          >
            Pessimistico
          </Button>
          <Button
            variant={selectedScenario === "base" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedScenario("base")}
            className={selectedScenario === "base" ? "bg-blue-600 hover:bg-blue-700" : ""}
          >
            Base
          </Button>
          <Button
            variant={selectedScenario === "best" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedScenario("best")}
            className={selectedScenario === "best" ? "bg-green-600 hover:bg-green-700" : ""}
          >
            Ottimistico
          </Button>
        </div>

        {/* Header con Executive Summary */}
        <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl">Business Plan 2026-2030</CardTitle>
              <Badge
                className={
                  selectedScenario === "worst"
                    ? "bg-red-500 text-white"
                    : selectedScenario === "best"
                      ? "bg-green-500 text-white"
                      : "bg-blue-500 text-white"
                }
              >
                {scenario.name}
              </Badge>
            </div>
            <CardDescription className="text-slate-300">
              SANTADDEO - Revenue Management System per Strutture Ricettive Italiane
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-white/10 rounded-lg">
                <div className="text-3xl font-bold">{formatCurrency(scenario.totalRevenue5Y)}</div>
                <div className="text-sm text-slate-300">Fatturato 5Y</div>
              </div>
              <div className="text-center p-4 bg-white/10 rounded-lg">
                <div
                  className={`text-3xl font-bold ${summaryStatus === "profitable" ? "text-green-400" : "text-red-400"}`}
                >
                  {formatCurrency(scenario.totalProfit5Y)}
                </div>
                <div className="text-sm text-slate-300">Profitto 5Y</div>
              </div>
              <div className="text-center p-4 bg-white/10 rounded-lg">
                <div className={`text-3xl font-bold ${scenario.roi5Years > 0 ? "text-green-400" : "text-red-400"}`}>
                  {scenario.roi5Years.toFixed(0)}%
                </div>
                <div className="text-sm text-slate-300">ROI 5 anni</div>
              </div>
              <div className="text-center p-4 bg-white/10 rounded-lg">
                <div className="text-3xl font-bold">
                  {scenario.breakEvenMonth > 60 ? "Mai" : `${scenario.breakEvenMonth}m`}
                </div>
                <div className="text-sm text-slate-300">Break-even</div>
              </div>
            </div>

            {/* Executive Summary */}
            <div className="mt-4 p-4 bg-white/5 rounded-lg">
              <h4 className="font-medium mb-2">Executive Summary</h4>
              <p className="text-sm text-slate-300">
                {summaryStatus === "profitable" ? (
                  <>
                    <span className="text-green-400 font-medium">Modello sostenibile.</span> Con{" "}
                    {scenario.years[4].hotels} hotel al quinto anno e un MRR di{" "}
                    {formatCurrency(scenario.years[4].monthlyRecurring)}, il business raggiunge la profittabilità con un
                    margine EBITDA del {scenario.years[4].ebitdaMargin.toFixed(0)}%. Break-even previsto in{" "}
                    {scenario.breakEvenMonth} mesi.
                  </>
                ) : (
                  <>
                    <span className="text-red-400 font-medium">Modello non sostenibile.</span> La crescita lenta e
                    l&apos;alto churn non permettono di raggiungere la massa critica necessaria. Richiede pivot
                    strategico o funding addizionale.
                  </>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Metriche principali */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Investimento Iniziale"
            value={formatCurrency(scenario.totalInvestmentNeeded)}
            icon={Calculator}
          />
          <MetricCard
            title="Fatturato Totale 5Y"
            value={formatCurrency(scenario.totalRevenue5Y)}
            trend="up"
            icon={TrendingUp}
          />
          <MetricCard
            title="Profitto Totale 5Y"
            value={formatCurrency(scenario.totalProfit5Y)}
            trend={scenario.totalProfit5Y > 0 ? "up" : "down"}
            icon={scenario.totalProfit5Y > 0 ? TrendingUp : TrendingDown}
          />
          <MetricCard
            title="ROI 5 anni"
            value={`${scenario.roi5Years.toFixed(0)}%`}
            trend={scenario.roi5Years > 0 ? "up" : "down"}
            icon={Target}
          />
        </div>

        {/* Proiezioni annuali */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Proiezioni Annuali</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {scenario.years.map((year) => (
              <YearCard key={year.year} data={year} />
            ))}
          </div>
        </div>

        {/* Assunzioni e Rischi */}
        <div className="grid md:grid-cols-2 gap-4">
          <AssumptionsList assumptions={scenario.assumptions} />
          <RisksCard scenario={selectedScenario} />
        </div>

        {/* Confronto scenari */}
        <ComparisonTable />

        {/* Analisi di mercato e pricing */}
        <div className="grid md:grid-cols-2 gap-4">
          <MarketAnalysis />
          <PricingModel scenario={scenario} />
        </div>
      </div>
    </TooltipProvider>
  )
}
