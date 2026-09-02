import { runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic="force-dynamic";

function secureEqual(left:Uint8Array,right:Uint8Array){if(left.length!==right.length)return false;let mismatch=0;for(let index=0;index<left.length;index++)mismatch|=left[index]^right[index];return mismatch===0}
function decodeBase64(value:string){try{return Uint8Array.from(atob(value),character=>character.charCodeAt(0))}catch{return new Uint8Array()}}
async function hmac(secret:string,value:string){const keyBytes=decodeBase64(secret.replace(/^whsec_/,""));if(!keyBytes.length)return new Uint8Array();const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value)))}
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}

export async function POST(request:Request){
  const env=runtimeEnv();
  try{
    assertRequestSize(request,256*1024);await enforceRateLimit(env.DB,request,"resend-webhook",300,60,"resend");
    if(!env.RESEND_WEBHOOK_SECRET)return Response.json({error:"Resend webhook sırrı yapılandırılmamış."},{status:503});
    const id=request.headers.get("svix-id")||"",timestamp=request.headers.get("svix-timestamp")||"",signatures=request.headers.get("svix-signature")||"",body=await request.text();
    const timestampMs=/^\d{10}$/.test(timestamp)?Number(timestamp)*1000:NaN;if(!id||!Number.isFinite(timestampMs)||Math.abs(Date.now()-timestampMs)>5*60*1000)return Response.json({error:"Webhook kimliği veya zaman damgası geçersiz."},{status:401});
    const expected=await hmac(env.RESEND_WEBHOOK_SECRET,`${id}.${timestamp}.${body}`),valid=signatures.split(/\s+/).some(item=>{const encoded=item.startsWith("v1,")?item.slice(3):"";return encoded?secureEqual(expected,decodeBase64(encoded)):false});
    if(!valid)return Response.json({error:"Geçersiz Resend webhook imzası."},{status:401});
    const payload=JSON.parse(body) as {type?:string;data?:{email_id?:string;id?:string}},eventType=String(payload.type||""),providerReference=String(payload.data?.email_id||payload.data?.id||"");
    if(!providerReference)return Response.json({error:"E-posta sağlayıcı kimliği eksik."},{status:400});
    const delivery=await env.DB.prepare("SELECT id,tenant_id AS tenantId,outbox_event_id AS outboxEventId FROM notification_deliveries WHERE channel='EMAIL' AND provider_reference=? ORDER BY created_at DESC LIMIT 1").bind(providerReference).first<{id:string;tenantId:string;outboxEventId:string}>();
    if(!delivery)return Response.json({error:"Teslimat kaydı bulunamadı."},{status:404});
    const callbackId=`PCB-${crypto.randomUUID()}`,inserted=await env.DB.prepare("INSERT OR IGNORE INTO provider_callback_events (id,tenant_id,provider,external_event_id,payload_sha256,status) VALUES (?,?, 'RESEND_NATIVE',?,?, 'RECEIVED')").bind(callbackId,delivery.tenantId,id,await sha256(body)).run();
    if(!inserted.meta.changes){const existing=await env.DB.prepare("SELECT status FROM provider_callback_events WHERE provider='RESEND_NATIVE' AND external_event_id=?").bind(id).first<{status:string}>();return Response.json({ok:existing?.status==="PROCESSED",duplicate:true,status:existing?.status||"UNKNOWN"},{status:existing?.status==="PROCESSED"?200:409})}
    const delivered=eventType==="email.delivered",failed=["email.bounced","email.failed","email.complained","email.suppressed"].includes(eventType),sent=["email.sent","email.delivery_delayed"].includes(eventType);
    if(!delivered&&!failed&&!sent){await env.DB.prepare("UPDATE provider_callback_events SET status='REJECTED' WHERE id=?").bind(callbackId).run();return Response.json({error:"Desteklenmeyen Resend olay türü."},{status:400})}
    const deliveryStatus=delivered?"DELIVERED":failed?"FAILED":"SENT",outboxStatus=delivered?"PROCESSED":failed?"FAILED":"DISPATCHED";
    await env.DB.batch([
      env.DB.prepare("UPDATE notification_deliveries SET status=?,last_error=?,delivered_at=CASE WHEN ?='DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?").bind(deliveryStatus,failed?eventType:"",deliveryStatus,delivery.tenantId,delivery.id),
      env.DB.prepare("UPDATE outbox_events SET status=?,last_error=?,processed_at=CASE WHEN ?='PROCESSED' THEN CURRENT_TIMESTAMP ELSE processed_at END WHERE tenant_id=? AND id=?").bind(outboxStatus,failed?eventType:"",outboxStatus,delivery.tenantId,delivery.outboxEventId),
      env.DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='RESEND'").bind(delivery.tenantId),
      env.DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'provider:resend','NOTIFICATION_CALLBACK','notifications',?,?)").bind(`AUD-${crypto.randomUUID()}`,delivery.tenantId,delivery.outboxEventId,JSON.stringify({eventType,providerReference})),
      env.DB.prepare("UPDATE provider_callback_events SET status='PROCESSED' WHERE id=?").bind(callbackId),
    ]);
    return Response.json({ok:true,eventType,deliveryId:delivery.id,status:deliveryStatus});
  }catch(error){return apiErrorResponse(error,"Resend webhook işlenemedi.")}
}
