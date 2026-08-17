import type React from "react"
import { redirect } from "next/navigation"
import { requireAreaPage } from "@/lib/auth/area-access"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { isModuleActive } from "@/lib/modules"
export default async function Layout({children}:{children:React.ReactNode}){await requireAreaPage("hr");const identity=await getCallerIdentity();if(!identity?.propertyId||!await isModuleActive(createServiceClient(),identity.propertyId,"hr"))redirect("/admin/dashboard");return <>{children}</>}
