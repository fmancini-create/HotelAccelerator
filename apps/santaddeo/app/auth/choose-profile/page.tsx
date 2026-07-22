import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChooseProfileClient } from "./choose-profile-client"

export const metadata = {
  title: "Scegli profilo | Santaddeo",
  description: "Seleziona con quale profilo accedere alla piattaforma",
}

export default async function ChooseProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch user profile info for display
  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, role")
    .eq("id", user.id)
    .single()

  // Fetch hotel associations for tenant dashboard preview (real access source)
  const { data: propertyMap } = await supabase
    .from("user_property_map")
    .select("hotel_id, hotels(name)")
    .eq("user_id", user.id)
    .limit(3)

  const hotels = propertyMap?.map((pm) => (pm.hotels as any)?.name).filter(Boolean) ?? []

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-white p-4">
      <ChooseProfileClient
        userName={[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || ""}
        hotels={hotels}
      />
    </div>
  )
}
