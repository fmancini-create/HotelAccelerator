"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, TrendingUp, Star, Zap, Target, Rocket, Calendar, DollarSign, BarChart3, Users, Clock, Award, Lightbulb, TrendingDown, ArrowUpRight, CheckCircle, AlertTriangle, Eye } from "lucide-react"

// Tipi di messaggio: generici, basati su performance, azioni suggerite
type MessageCategory = "motivational" | "performance" | "action" | "insight" | "celebration"

interface MotivationalMessage {
  icon: any
  title: (name?: string) => string
  subtitle: (name?: string, data?: HotelPerformanceData) => string
  category: MessageCategory
}

// Dati di performance hotel (opzionali, passati dal componente padre)
export interface HotelPerformanceData {
  occupancyRate?: number // 0-100
  revpar?: number
  adr?: number
  bookingsToday?: number
  revenueToday?: number
  weekTrend?: "up" | "down" | "stable"
  pendingActions?: number
  lowOccupancyDays?: number
  highDemandDays?: number
}

// Funzione per generare messaggi dinamici basati sui dati
const getContextualMessages = (data?: HotelPerformanceData): MotivationalMessage[] => {
  const messages: MotivationalMessage[] = []
  
  // Messaggi basati sull'occupazione
  if (data?.occupancyRate !== undefined) {
    if (data.occupancyRate < 50) {
      messages.push({
        icon: AlertTriangle,
        title: (name) => name ? `${name}, e' il momento di agire!` : "E' il momento di agire!",
        subtitle: () => `L'occupazione e' al ${data.occupancyRate}%. Rivedi le tariffe dei prossimi giorni per aumentare le prenotazioni!`,
        category: "action"
      })
    } else if (data.occupancyRate >= 80) {
      messages.push({
        icon: Award,
        title: (name) => name ? `Complimenti ${name}!` : "Complimenti!",
        subtitle: () => `Occupazione al ${data.occupancyRate}%! Hai considerato di alzare le tariffe per massimizzare i ricavi?`,
        category: "celebration"
      })
    }
  }
  
  // Messaggi basati sul trend settimanale
  if (data?.weekTrend === "down") {
    messages.push({
      icon: TrendingDown,
      title: (name) => name ? `${name}, invertiamo la rotta!` : "Invertiamo la rotta!",
      subtitle: () => "Il trend settimanale e' in calo. Controlla le tariffe e lancia una promozione mirata!",
      category: "action"
    })
  }
  
  // Messaggi basati su giorni a bassa occupazione
  if (data?.lowOccupancyDays && data.lowOccupancyDays > 0) {
    messages.push({
      icon: Calendar,
      title: (name) => name ? `${name}, hai ${data.lowOccupancyDays} giorni da riempire!` : `Hai ${data.lowOccupancyDays} giorni da riempire!`,
      subtitle: () => "Controlla il calendario e ottimizza le tariffe per i giorni con bassa occupazione.",
      category: "action"
    })
  }
  
  // Messaggi basati su alta domanda
  if (data?.highDemandDays && data.highDemandDays > 0) {
    messages.push({
      icon: TrendingUp,
      title: (name) => name ? `${name}, opportunita' in arrivo!` : "Opportunita' in arrivo!",
      subtitle: () => `Ci sono ${data.highDemandDays} giorni ad alta domanda. Verifica che le tariffe siano ottimizzate!`,
      category: "insight"
    })
  }
  
  // Messaggi basati su azioni pendenti
  if (data?.pendingActions && data.pendingActions > 0) {
    messages.push({
      icon: CheckCircle,
      title: (name) => name ? `${name}, hai ${data.pendingActions} azioni in sospeso!` : `Hai ${data.pendingActions} azioni in sospeso!`,
      subtitle: () => "Completa le attivita' suggerite per migliorare le performance della tua struttura.",
      category: "action"
    })
  }
  
  return messages
}

// Messaggi motivazionali generici (sempre disponibili)
const genericMessages: MotivationalMessage[] = [
  // MOTIVAZIONALI PERSONALIZZATI
  {
    icon: TrendingUp,
    title: (name) => name ? `${name}, il tuo RevPAR puo' crescere!` : "Il tuo RevPAR puo' crescere!",
    subtitle: () => "Ogni giorno e' un'opportunita' per superare i tuoi obiettivi",
    category: "motivational"
  },
  {
    icon: Target,
    title: (name) => name ? `${name}, punta all'eccellenza!` : "Punta all'eccellenza!",
    subtitle: () => "L'occupazione perfetta e' a portata di mano",
    category: "motivational"
  },
  {
    icon: Rocket,
    title: (name) => name ? `${name}, verso nuovi traguardi!` : "Verso nuovi traguardi!",
    subtitle: () => "I dati sono dalla tua parte, usali per vincere",
    category: "motivational"
  },
  {
    icon: Star,
    title: (name) => name ? `Buongiorno ${name}!` : "Buongiorno!",
    subtitle: () => "Oggi sara' una giornata straordinaria per la tua struttura",
    category: "motivational"
  },
  {
    icon: Zap,
    title: (name) => name ? `${name}, massimizza il potenziale!` : "Massimizza il potenziale!",
    subtitle: () => "L'ADR ottimale e' il tuo prossimo obiettivo",
    category: "motivational"
  },
  {
    icon: Sparkles,
    title: (name) => name ? `${name}, brillante come sempre!` : "Brillante come sempre!",
    subtitle: () => "I tuoi KPI stanno per raggiungere nuove vette",
    category: "motivational"
  },
  
  // AZIONI SUGGERITE
  {
    icon: Calendar,
    title: (name) => name ? `${name}, controlla il calendario!` : "Controlla il calendario!",
    subtitle: () => "Verifica le tariffe per i prossimi 30 giorni e ottimizza dove necessario",
    category: "action"
  },
  {
    icon: DollarSign,
    title: (name) => name ? `${name}, e' ora di analizzare i ricavi!` : "E' ora di analizzare i ricavi!",
    subtitle: () => "Confronta i tuoi risultati con gli obiettivi mensili e agisci di conseguenza",
    category: "action"
  },
  {
    icon: BarChart3,
    title: (name) => name ? `${name}, i dati ti aspettano!` : "I dati ti aspettano!",
    subtitle: () => "Analizza le performance della settimana scorsa per migliorare quella in arrivo",
    category: "action"
  },
  {
    icon: Users,
    title: (name) => name ? `${name}, conosci i tuoi ospiti!` : "Conosci i tuoi ospiti!",
    subtitle: () => "Studia i canali di prenotazione piu' performanti e investi su di essi",
    category: "action"
  },
  {
    icon: Eye,
    title: (name) => name ? `${name}, tieni d'occhio la concorrenza!` : "Tieni d'occhio la concorrenza!",
    subtitle: () => "Monitora i prezzi dei competitor per posizionarti al meglio",
    category: "action"
  },
  
  // INSIGHT E SUGGERIMENTI
  {
    icon: Lightbulb,
    title: (name) => name ? `${name}, lo sapevi?` : "Lo sapevi?",
    subtitle: () => "Aumentare l'ADR del 5% puo' avere un impatto maggiore che aumentare l'occupazione del 5%",
    category: "insight"
  },
  {
    icon: Clock,
    title: (name) => name ? `${name}, il timing e' tutto!` : "Il timing e' tutto!",
    subtitle: () => "Le prenotazioni last-minute spesso accettano tariffe piu' alte. Sfruttale!",
    category: "insight"
  },
  {
    icon: ArrowUpRight,
    title: (name) => name ? `${name}, crescita costante!` : "Crescita costante!",
    subtitle: () => "Piccoli miglioramenti quotidiani portano a grandi risultati annuali",
    category: "insight"
  },
  {
    icon: Award,
    title: (name) => name ? `${name}, sei sulla strada giusta!` : "Sei sulla strada giusta!",
    subtitle: () => "La costanza nell'analisi dei dati e' la chiave del successo nel revenue management",
    category: "insight"
  },
  
  // CELEBRAZIONI E POSITIVI
  {
    icon: Star,
    title: (name) => name ? `${name}, ogni prenotazione conta!` : "Ogni prenotazione conta!",
    subtitle: () => "Trasforma ogni camera venduta in un'opportunita' di revenue ottimale",
    category: "celebration"
  },
  {
    icon: Rocket,
    title: (name) => name ? `${name}, pronto a decollare?` : "Pronto a decollare?",
    subtitle: () => "Le tue decisioni di oggi definiranno i ricavi di domani",
    category: "celebration"
  },
  {
    icon: Sparkles,
    title: (name) => name ? `Bentornato ${name}!` : "Bentornato!",
    subtitle: () => "La tua struttura ti sta aspettando per raggiungere nuovi record",
    category: "celebration"
  },
  {
    icon: Target,
    title: (name) => name ? `${name}, obiettivo in vista!` : "Obiettivo in vista!",
    subtitle: () => "Sei piu' vicino ai tuoi traguardi di quanto pensi",
    category: "motivational"
  },
  {
    icon: TrendingUp,
    title: (name) => name ? `${name}, il mercato ti premia!` : "Il mercato ti premia!",
    subtitle: () => "Chi analizza i dati con costanza ottiene risultati migliori del 23%",
    category: "insight"
  },
  {
    icon: Zap,
    title: (name) => name ? `${name}, energia al massimo!` : "Energia al massimo!",
    subtitle: () => "Trasforma questa energia in azioni concrete per la tua struttura",
    category: "motivational"
  },
]

// Particelle stellari animate
function StarParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(50)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full"
          initial={{
            x: Math.random() * (typeof window !== "undefined" ? window.innerWidth : 1000),
            y: Math.random() * (typeof window !== "undefined" ? window.innerHeight : 800),
            opacity: 0,
            scale: 0,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{
            duration: Math.random() * 2 + 1,
            repeat: Infinity,
            delay: Math.random() * 2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  )
}

// Cerchi di luce animati
function GlowingOrbs() {
  return (
    <>
      <motion.div
        className="absolute w-96 h-96 rounded-full bg-gradient-to-r from-emerald-500/20 to-teal-500/20 blur-3xl"
        animate={{
          x: ["-20%", "20%", "-20%"],
          y: ["-10%", "10%", "-10%"],
          scale: [1, 1.2, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ top: "10%", left: "10%" }}
      />
      <motion.div
        className="absolute w-80 h-80 rounded-full bg-gradient-to-r from-amber-500/15 to-orange-500/15 blur-3xl"
        animate={{
          x: ["20%", "-20%", "20%"],
          y: ["10%", "-10%", "10%"],
          scale: [1.2, 1, 1.2],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ bottom: "20%", right: "10%" }}
      />
    </>
  )
}

interface MotivationalSplashProps {
  onComplete?: () => void
  duration?: number // in milliseconds
  userName?: string // Nome dell'utente per personalizzare i messaggi
  performanceData?: HotelPerformanceData // Dati di performance per messaggi contestuali
}

export function MotivationalSplash({ 
  onComplete, 
  duration = 4000, 
  userName, 
  performanceData 
}: MotivationalSplashProps) {
  const [isVisible, setIsVisible] = useState(true)
  
  // Seleziona un messaggio: prima dai contestuali (se disponibili), poi dai generici
  const [message] = useState(() => {
    const contextualMessages = getContextualMessages(performanceData)
    const allMessages = [...contextualMessages, ...genericMessages]
    
    // 60% probabilita' di mostrare un messaggio contestuale se disponibile
    if (contextualMessages.length > 0 && Math.random() < 0.6) {
      return contextualMessages[Math.floor(Math.random() * contextualMessages.length)]
    }
    
    return allMessages[Math.floor(Math.random() * allMessages.length)]
  })

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => {
        onComplete?.()
      }, 500) // Wait for exit animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onComplete])

  const IconComponent = message.icon

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Background effects */}
          <StarParticles />
          <GlowingOrbs />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-2xl">
            {/* Animated icon */}
            <motion.div
              className="mb-8 p-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: 0.2,
              }}
            >
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <IconComponent className="w-16 h-16 text-emerald-400" strokeWidth={1.5} />
              </motion.div>
            </motion.div>

            {/* Title */}
            <motion.h1
              className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              {message.title(userName)}
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="text-xl md:text-2xl text-slate-400 font-light"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              {message.subtitle(userName, performanceData)}
            </motion.p>

            {/* Loading bar */}
            <motion.div
              className="mt-12 w-64 h-1 bg-slate-800 rounded-full overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: duration / 1000 - 0.5, ease: "linear" }}
              />
            </motion.div>

            {/* SANTADDEO branding */}
            <motion.div
              className="mt-8 flex items-center gap-2 text-slate-600"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <span className="text-sm font-medium tracking-widest uppercase">SANTADDEO</span>
              <span className="text-xs text-emerald-500">AI-Powered</span>
            </motion.div>
          </div>

          {/* Click to skip */}
          <motion.button
            className="absolute bottom-8 text-slate-600 text-sm hover:text-slate-400 transition-colors"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            onClick={() => {
              setIsVisible(false)
              setTimeout(() => onComplete?.(), 500)
            }}
          >
            Clicca per continuare
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
