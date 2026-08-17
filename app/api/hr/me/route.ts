import {type NextRequest,NextResponse} from "next/server"
import {z} from "zod"
import {getCallerIdentity} from "@/lib/auth/admin-access"
import {createServiceClient} from "@/lib/supabase/server"
import {isModuleActive} from "@/lib/modules"
const schema=z.discriminatedUnion("action",[z.object({action:z.literal("respond"),shift_id:z.string().uuid(),response:z.enum(["confirmed","declined"])}),z.object({action:z.literal("leave"),kind:z.enum(["holiday","permission","rol","sickness","unavailability"]),starts_on:z.string().date(),ends_on:z.string().date(),reason:z.string().max(500).optional()})]);async function employee(req:NextRequest){const i=await getCallerIdentity(req);if(!i?.propertyId||!i.adminUserId)return null;const db=createServiceClient();if(!await isModuleActive(db,i.propertyId,"hr"))return null;const e=await db.from("hr_employees").select("id,property_id,first_name,last_name").eq("property_id",i.propertyId).eq("admin_user_id",i.adminUserId).maybeSingle();return e.data?{db,identity:i,employee:e.data}:null}
export async function GET(req:NextRequest){const c=await employee(req);if(!c)return NextResponse.json({error:"employee_not_linked"},{status:403});const [s,l]=await Promise.all([c.db.from("hr_shifts").select("id,starts_at,ends_at,location,status,response_status").eq("property_id",c.identity.propertyId).eq("employee_id",c.employee.id).gte("ends_at",new Date().toISOString()).neq("status","cancelled").order("starts_at"),c.db.from("hr_leave_requests").select("id,kind,starts_on,ends_on,status").eq("property_id",c.identity.propertyId).eq("employee_id",c.employee.id).order("created_at",{ascending:false}).limit(30)]);
 // Una query fallita NON e' "nessun turno": con `|| []` un errore di database
 // mostrava al dipendente un'agenda vuota, che è indistinguibile dal non avere
 // turni assegnati. Meglio un errore visibile che far mancare qualcuno al lavoro.
 if(s.error||l.error){console.error("[hr] agenda dipendente",s.error||l.error);return NextResponse.json({error:"hr_me_load_failed"},{status:500})}
 return NextResponse.json({employee:c.employee,shifts:s.data||[],leave_requests:l.data||[]})}
export async function POST(req:NextRequest){const c=await employee(req);if(!c)return NextResponse.json({error:"employee_not_linked"},{status:403});const p=schema.safeParse(await req.json());if(!p.success)return NextResponse.json({error:"invalid_payload"},{status:400});if(p.data.action==="respond"){const q=await c.db.from("hr_shifts").update({response_status:p.data.response,updated_at:new Date().toISOString()}).eq("id",p.data.shift_id).eq("property_id",c.identity.propertyId).eq("employee_id",c.employee.id).eq("status","published").select().maybeSingle();
 // Turno inesistente, non suo o non ancora pubblicato: rispondere 200 con `null`
 // faceva credere al dipendente di aver confermato, mentre il responsabile
 // continuava a vedere "in attesa".
 if(q.error){console.error("[hr] risposta turno",q.error);return NextResponse.json({error:"respond_failed"},{status:500})}
 if(!q.data)return NextResponse.json({error:"shift_not_respondable"},{status:409});
 return NextResponse.json(q.data)}if(p.data.ends_on<p.data.starts_on)return NextResponse.json({error:"invalid_range"},{status:400});const q=await c.db.from("hr_leave_requests").insert({property_id:c.identity.propertyId,employee_id:c.employee.id,kind:p.data.kind,starts_on:p.data.starts_on,ends_on:p.data.ends_on,reason:p.data.reason||null}).select().single();
 // Senza questo controllo un inserimento rifiutato tornava 201 con corpo `null`:
 // il dipendente vedeva la richiesta accettata e nessuno la riceveva.
 if(q.error){console.error("[hr] richiesta assenza",q.error);return NextResponse.json({error:"leave_failed"},{status:500})}
 return NextResponse.json(q.data,{status:201})}
