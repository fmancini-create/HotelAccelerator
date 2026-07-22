import type { Metadata } from "next"
import ForgotPasswordContent from "./forgot-password-content"

export const metadata: Metadata = {
  title: "Recupera Password | SANTADDEO",
  description: "Recupera la password del tuo account SANTADDEO. Ti invieremo un link per reimpostare la tua password.",
  robots: { index: false, follow: false },
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />
}
