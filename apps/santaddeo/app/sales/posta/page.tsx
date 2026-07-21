import { MailClient } from "@/components/sales/mail-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Posta - Sales SANTADDEO" }

export default function SalesMailPage() {
  return <MailClient basePath="/sales" />
}
