// Alert Service - Evaluates KPIs and generates alerts

import type { createClient } from "@supabase/supabase-js"
import type { AlertRule, AlertSeverity, DailyData } from "@/lib/types/database"

interface AlertEvaluation {
  shouldAlert: boolean
  severity: AlertSeverity
  title: string
  message: string
  metricValue: number
}

export class AlertService {
  /**
   * Evaluate a single alert rule against current data
   */
  static evaluateRule(rule: AlertRule, currentValue: number): AlertEvaluation {
    let shouldAlert = false

    switch (rule.operator) {
      case "less_than":
        shouldAlert = currentValue < rule.threshold
        break
      case "greater_than":
        shouldAlert = currentValue > rule.threshold
        break
      case "equals":
        shouldAlert = Math.abs(currentValue - rule.threshold) < 0.01
        break
    }

    return {
      shouldAlert,
      severity: rule.severity,
      title: this.generateAlertTitle(rule, shouldAlert),
      message: this.generateAlertMessage(rule, currentValue, shouldAlert),
      metricValue: currentValue,
    }
  }

  /**
   * Generate alert title based on rule
   */
  private static generateAlertTitle(rule: AlertRule, triggered: boolean): string {
    if (!triggered) return "Tutto OK"

    const metricNames: Record<string, string> = {
      occupancy_rate: "Tasso di Occupazione",
      revpar: "RevPAR",
      revpor: "RevPOR",
      cancellation_rate: "Tasso di Cancellazione",
      revenue: "Revenue",
    }

    return `Attenzione: ${metricNames[rule.metric] || rule.metric}`
  }

  /**
   * Generate alert message based on rule and current value
   */
  private static generateAlertMessage(rule: AlertRule, currentValue: number, triggered: boolean): string {
    if (!triggered) return "I tuoi KPI sono nella norma"

    const operatorText: Record<string, string> = {
      less_than: "inferiore a",
      greater_than: "superiore a",
      equals: "uguale a",
    }

    const metricNames: Record<string, string> = {
      occupancy_rate: "Il tasso di occupazione",
      revpar: "Il RevPAR",
      revpor: "Il RevPOR",
      cancellation_rate: "Il tasso di cancellazione",
      revenue: "Il revenue",
    }

    const metricName = metricNames[rule.metric] || rule.metric
    const operator = operatorText[rule.operator] || rule.operator
    const unit = rule.metric.includes("rate") || rule.metric.includes("occupancy") ? "%" : "€"

    return `${metricName} è ${operator} la soglia di ${rule.threshold}${unit}. Valore attuale: ${currentValue.toFixed(2)}${unit}. ${this.getRecommendation(rule.metric, rule.severity)}`
  }

  /**
   * Get recommendation based on metric and severity
   */
  private static getRecommendation(metric: string, severity: AlertSeverity): string {
    if (severity === "red") {
      return "Ti consigliamo di attivare Hotel Accelerator per ottimizzare le tue performance."
    } else if (severity === "orange") {
      return "Considera di consultare i nostri esperti per migliorare questo KPI."
    }
    return ""
  }

  /**
   * Check all rules for a hotel and generate alerts
   */
  static async checkAndGenerateAlerts(
    supabase: ReturnType<typeof createClient>,
    hotelId: string,
    dailyData: DailyData,
  ): Promise<void> {
    // Get active alert rules for this hotel
    const { data: rules } = await supabase
      .from("alert_rules")
      .select("*")
      .or(`hotel_id.eq.${hotelId},hotel_id.is.null`)
      .eq("is_active", true)

    if (!rules || rules.length === 0) return

    // Evaluate each rule
    for (const rule of rules) {
      let currentValue = 0

      switch (rule.metric) {
        case "occupancy_rate":
          currentValue = dailyData.occupancy_rate
          break
        case "revpar":
          currentValue = dailyData.revpar
          break
        case "revpor":
          currentValue = dailyData.revpor
          break
        case "cancellation_rate":
          currentValue = dailyData.cancellation_rate
          break
        case "revenue":
          currentValue = dailyData.total_revenue
          break
      }

      const evaluation = this.evaluateRule(rule, currentValue)

      if (evaluation.shouldAlert) {
        // Check if alert already exists for today
        const today = new Date().toISOString().split("T")[0]
        const { data: existingAlert } = await supabase
          .from("alerts")
          .select("id")
          .eq("hotel_id", hotelId)
          .eq("alert_rule_id", rule.id)
          .gte("created_at", `${today}T00:00:00`)
          .single()

        // Only create if doesn't exist
        if (!existingAlert) {
          await supabase.from("alerts").insert({
            hotel_id: hotelId,
            alert_rule_id: rule.id,
            severity: evaluation.severity,
            title: evaluation.title,
            message: evaluation.message,
            metric_value: evaluation.metricValue,
            is_read: false,
            is_dismissed: false,
          })
        }
      }
    }
  }

  /**
   * Get upgrade recommendation based on alert severity
   */
  static getUpgradeRecommendation(severity: AlertSeverity): {
    title: string
    description: string
    action: string
    link: string
  } {
    if (severity === "red") {
      return {
        title: "Attiva Hotel Accelerator",
        description:
          "Il nostro algoritmo di pricing dinamico può aiutarti a massimizzare il revenue e migliorare l'occupazione.",
        action: "Scopri Hotel Accelerator",
        link: "/upgrade/hotel-accelerator",
      }
    } else if (severity === "orange") {
      return {
        title: "Consulenza Revenue Management",
        description: "Parla con un nostro esperto per ottimizzare la strategia della tua struttura.",
        action: "Prenota Consulenza",
        link: "/upgrade/consultation",
      }
    }

    return {
      title: "Continua così!",
      description: "Le tue performance sono ottime. Continua a monitorare i tuoi KPI.",
      action: "Visualizza Report",
      link: "/reports",
    }
  }
}
