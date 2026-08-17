import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { AccessError, accessErrorStatus, requireTenantAdmin } from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { inizioGiornoItaliano, istanteDaOraItaliana } from "@/lib/hr/time"

const schema=z.discriminatedUnion("action",[
 z.object({action:z.literal("department"),name:z.string().trim().min(2).max(80)}),
 z.object({action:z.literal("employee"),first_name:z.string().trim().min(1),last_name:z.string().trim().min(1),email:z.string().email().optional().or(z.literal("")),department_id:z.string().uuid().nullable().optional(),job_title:z.string().max(100).optional(),weekly_hours:z.coerce.number().min(0).max(168).default(40),telegram_chat_id:z.string().max(80).optional()}),
 z.object({action:z.literal("shift"),employee_id:z.string().uuid(),date:z.string().date(),starts:z.string().regex(/^\d\d:\d\d$/),ends:z.string().regex(/^\d\d:\d\d$/),break_minutes:z.coerce.number().int().min(0).max(720).default(0),location:z.string().max(120).optional()}),
 z.object({action:z.literal("publish"),shift_ids:z.array(z.string().uuid()).min(1).max(200)}),
 z.object({action:z.literal("leave"),employee_id:z.string().uuid(),kind:z.enum(["holiday","permission","rol","sickness","unavailability"]),starts_on:z.string().date(),ends_on:z.string().date(),reason:z.string().max(500).optional()}),
 z.object({action:z.literal("review_leave"),request_id:z.string().uuid(),decision:z.enum(["approved","rejected"])})
])

async function context(req:NextRequest){const identity=await requireTenantAdmin(req);const db=createServiceClient();if(!await isModuleActive(db,identity.propertyId,"hr"))throw new AccessError("Modulo HR non attivo",403);return {identity,db}}

export async function GET(req:NextRequest){try{const {identity,db}=await context(req);const from=new URL(req.url).searchParams.get("from")||new Date().toISOString().slice(0,10);
 // La finestra segue la mezzanotte ITALIANA: con i confini in UTC un turno che
 // inizia alle 00:30 del primo giorno cade fuori e sparisce dal tabellone.
 const giornoDopoDueSettimane=new Date(`${from}T00:00:00Z`);giornoDopoDueSettimane.setUTCDate(giornoDopoDueSettimane.getUTCDate()+14);
 const inizioFinestra=inizioGiornoItaliano(from).toISOString(),fineFinestra=inizioGiornoItaliano(giornoDopoDueSettimane.toISOString().slice(0,10)).toISOString();
 const [d,e,s,l]=await Promise.all([
 db.from("hr_departments").select("id,name,color").eq("property_id",identity.propertyId).eq("is_active",true).order("name"),
 db.from("hr_employees").select("id,first_name,last_name,email,job_title,weekly_hours,department_id,telegram_chat_id").eq("property_id",identity.propertyId).eq("employment_status","active").order("last_name"),
 db.from("hr_shifts").select("id,employee_id,department_id,starts_at,ends_at,break_minutes,status,response_status,location").eq("property_id",identity.propertyId).gte("starts_at",inizioFinestra).lt("starts_at",fineFinestra).neq("status","cancelled").order("starts_at"),
 db.from("hr_leave_requests").select("id,employee_id,kind,starts_on,ends_on,reason,status").eq("property_id",identity.propertyId).order("starts_on",{ascending:false}).limit(100)
 ]);const error=d.error||e.error||s.error||l.error;if(error)throw error;return NextResponse.json({departments:d.data||[],employees:e.data||[],shifts:s.data||[],leave_requests:l.data||[]})}catch(error){return NextResponse.json({error:"hr_load_failed"},{status:accessErrorStatus(error)})}}

export async function POST(req:NextRequest){try{const {identity,db}=await context(req);const parsed=schema.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:"invalid_payload",details:parsed.error.flatten()},{status:400});const b=parsed.data;const property_id=identity.propertyId;
 if(b.action==="department"){const q=await db.from("hr_departments").insert({property_id,name:b.name}).select().single();if(q.error)throw q.error;return NextResponse.json(q.data,{status:201})}
 if(b.action==="employee"){let admin_user_id:null|string=null;if(b.email){const linked=await db.from("admin_users").select("id").eq("property_id",property_id).ilike("email",b.email).maybeSingle();admin_user_id=linked.data?.id||null}const q=await db.from("hr_employees").insert({property_id,admin_user_id,first_name:b.first_name,last_name:b.last_name,email:b.email||null,department_id:b.department_id||null,job_title:b.job_title||null,weekly_hours:b.weekly_hours,telegram_chat_id:b.telegram_chat_id||null,notification_telegram:Boolean(b.telegram_chat_id)}).select().single();if(q.error)throw q.error;return NextResponse.json(q.data,{status:201})}
 if(b.action==="shift"){let endDate=b.date;if(b.ends<=b.starts){const d=new Date(`${b.date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);endDate=d.toISOString().slice(0,10)}const starts_at=istanteDaOraItaliana(b.date,b.starts).toISOString(),ends_at=istanteDaOraItaliana(endDate,b.ends).toISOString();const owner=await db.from("hr_employees").select("id,department_id").eq("id",b.employee_id).eq("property_id",property_id).maybeSingle();if(!owner.data)return NextResponse.json({error:"employee_not_found"},{status:404});const overlap=await db.from("hr_shifts").select("id").eq("property_id",property_id).eq("employee_id",b.employee_id).neq("status","cancelled").lt("starts_at",ends_at).gt("ends_at",starts_at).limit(1);if(overlap.data?.length)return NextResponse.json({error:"shift_overlap"},{status:409});const q=await db.from("hr_shifts").insert({property_id,employee_id:b.employee_id,department_id:owner.data.department_id,starts_at,ends_at,break_minutes:b.break_minutes,location:b.location||null,created_by:identity.adminUserId}).select().single();if(q.error)throw q.error;return NextResponse.json(q.data,{status:201})}
 if(b.action==="publish"){const owned=await db.from("hr_shifts").select("id,employee_id").eq("property_id",property_id).in("id",b.shift_ids).eq("status","draft");if(!owned.data?.length)return NextResponse.json({error:"no_drafts"},{status:400});const ids=owned.data.map((x:{id:string})=>x.id);const now=new Date().toISOString();const update=await db.from("hr_shifts").update({status:"published",published_at:now,updated_at:now}).eq("property_id",property_id).in("id",ids);if(update.error)throw update.error;const employees=await db.from("hr_employees").select("id,email,telegram_chat_id,notification_email,notification_telegram").eq("property_id",property_id).in("id",owned.data.map((x:{employee_id:string})=>x.employee_id));const byId=new Map((employees.data||[]).map((x:any)=>[x.id,x]));const rows=owned.data.flatMap((x:any)=>{const employee:any=byId.get(x.employee_id);return [{property_id,shift_id:x.id,employee_id:x.employee_id,event_type:"published",channel:"in_app"},...(employee?.notification_email&&employee.email?[{property_id,shift_id:x.id,employee_id:x.employee_id,event_type:"published",channel:"email"}]:[]),...(employee?.notification_telegram&&employee.telegram_chat_id?[{property_id,shift_id:x.id,employee_id:x.employee_id,event_type:"published",channel:"telegram"}]:[])]});const coda=await db.from("hr_shift_notifications").upsert(rows,{onConflict:"shift_id,event_type,channel",ignoreDuplicates:true});
  // I turni risultano pubblicati anche se la coda avvisi non si scrive: dichiarare
  // "notifiche: N" senza guardare l'errore diceva che il personale era stato
  // avvisato mentre non lo era. Il turno resta pubblicato, ma l'esito e' sincero.
  if(coda.error)return NextResponse.json({published:ids.length,notifications:0,notify_error:coda.error.message},{status:207});
  // Gli avvisi email restano in coda e falliscono nel cron con "smtp_not_configured":
  // l'errore vive solo a DB, quindi chi pubblica crederebbe di aver avvisato tutti.
  // Lo diciamo subito, contando le righe email davvero non recapitabili.
  const emailInCoda=rows.filter((r:{channel:string})=>r.channel==="email").length;
  const smtpMancante=emailInCoda>0&&(!process.env.HR_SMTP_HOST||!process.env.HR_SMTP_FROM);
  return NextResponse.json({published:ids.length,notifications:rows.length,...(smtpMancante?{email_pending:emailInCoda,email_not_configured:true}:{})})}
 if(b.action==="leave"){if(b.ends_on<b.starts_on)return NextResponse.json({error:"invalid_leave_range"},{status:400});
  // Il dipendente va verificato come per i turni: `property_id` viene dalla
  // sessione, quindi senza questo controllo si potrebbe agganciare alla propria
  // struttura l'id di un dipendente di un'altra.
  const suo=await db.from("hr_employees").select("id").eq("id",b.employee_id).eq("property_id",property_id).maybeSingle();if(!suo.data)return NextResponse.json({error:"employee_not_found"},{status:404});
  const q=await db.from("hr_leave_requests").insert({property_id,employee_id:b.employee_id,kind:b.kind,starts_on:b.starts_on,ends_on:b.ends_on,reason:b.reason||null}).select().single();if(q.error)throw q.error;return NextResponse.json(q.data,{status:201})}
 const q=await db.from("hr_leave_requests").update({status:b.decision,reviewed_by:identity.adminUserId,reviewed_at:new Date().toISOString()}).eq("id",b.request_id).eq("property_id",property_id).eq("status","pending").select().maybeSingle();if(q.error)throw q.error;
 // Nessuna riga aggiornata = richiesta inesistente, di un'altra struttura o
 // gia' decisa. Rispondere 200 con `null` faceva sembrare riuscita una decisione
 // che non ha cambiato nulla, e il secondo giudizio scompariva in silenzio.
 if(!q.data)return NextResponse.json({error:"leave_not_pending"},{status:409});
 return NextResponse.json(q.data)
 }catch(error){console.error("[hr] save",error);return NextResponse.json({error:"hr_save_failed"},{status:accessErrorStatus(error)})}}
