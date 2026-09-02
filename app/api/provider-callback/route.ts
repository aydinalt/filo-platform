import { runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

async function hmac(secret:string,body:string){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
}

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

function secureEqual(left:string,right:string){
  if(left.length!==right.length)return false;let mismatch=0;
  for(let index=0;index<left.length;index++)mismatch|=left.charCodeAt(index)^right.charCodeAt(index);
  return mismatch===0;
}

export async function POST(request:Request){
  try{
    assertRequestSize(request,256*1024);
    const provider=(request.headers.get("x-filo-provider")||"").toUpperCase();
    const signature=(request.headers.get("x-filo-signature")||"").toLowerCase();
    const externalEventId=(request.headers.get("x-filo-event-id")||"").trim();
    const timestamp=(request.headers.get("x-filo-timestamp")||"").trim();
    const body=await request.text();const env=runtimeEnv();
    await enforceRateLimit(env.DB,request,`provider-callback:${provider||"unknown"}`,300,60,provider||"unknown");
    const secret=provider==="PAYMENT"?env.PAYMENT_WEBHOOK_SECRET:provider==="QUALIFIED_ESIGN"?env.ESIGN_WEBHOOK_SECRET:provider==="RESEND"?env.RESEND_WEBHOOK_SECRET:provider==="EINVOICE"?env.EINVOICE_WEBHOOK_SECRET:undefined;
    if(!secret)return Response.json({error:"Sağlayıcı geri bildirim anahtarı yapılandırılmamış."},{status:503});
    if(!externalEventId||externalEventId.length>128||!/^[a-zA-Z0-9._:-]+$/.test(externalEventId))return Response.json({error:"Geçerli x-filo-event-id zorunludur."},{status:400});
    const timestampMs=/^\d{10,13}$/.test(timestamp)?Number(timestamp)*(timestamp.length===10?1000:1):Date.parse(timestamp);
    if(!Number.isFinite(timestampMs)||Math.abs(Date.now()-timestampMs)>5*60*1000)return Response.json({error:"Geri bildirim zaman damgası geçersiz veya süresi dolmuş."},{status:401});
    if(!signature||!secureEqual(await hmac(secret,`${timestamp}.${body}`),signature))return Response.json({error:"Geçersiz sağlayıcı imzası."},{status:401});
    const payload=JSON.parse(body) as Record<string,unknown>;const tenantId=String(payload.tenantId||"");
    if(!tenantId)return Response.json({error:"tenantId zorunludur."},{status:400});
    const tenant=await env.DB.prepare("SELECT id FROM tenants WHERE id=?").bind(tenantId).first();
    if(!tenant)return Response.json({error:"Çalışma alanı bulunamadı."},{status:404});
    const callbackId=`PCB-${crypto.randomUUID()}`,payloadSha256=await sha256(body);
    const callbackInsert=await env.DB.prepare("INSERT OR IGNORE INTO provider_callback_events (id,tenant_id,provider,external_event_id,payload_sha256,status) VALUES (?,?,?,?,?,'RECEIVED')").bind(callbackId,tenantId,provider,externalEventId,payloadSha256).run();
    if(!callbackInsert.meta.changes){const existing=await env.DB.prepare("SELECT status FROM provider_callback_events WHERE provider=? AND external_event_id=?").bind(provider,externalEventId).first<{status:string}>();return Response.json({ok:existing?.status==="PROCESSED",duplicate:true,eventId:externalEventId,status:existing?.status||"UNKNOWN"},{status:existing?.status==="PROCESSED"?200:409})}
    const markProcessed=()=>env.DB.prepare("UPDATE provider_callback_events SET status='PROCESSED' WHERE id=?").bind(callbackId);
    const reject=async(message:string,status=400)=>{await env.DB.prepare("UPDATE provider_callback_events SET status='REJECTED' WHERE id=?").bind(callbackId).run();return Response.json({error:message,eventId:externalEventId},{status})};
    if(provider==="PAYMENT"){
      const orderId=String(payload.orderId||""),status=String(payload.status||"").toUpperCase(),reference=String(payload.providerReference||"");
      if(!orderId||!["COMPLETED","FAILED","CANCELLED","REFUNDED","EXPIRED"].includes(status))return reject("Geçersiz ödeme geri bildirimi.");
      const order=await env.DB.prepare("SELECT plan FROM subscription_orders WHERE tenant_id=? AND id=?").bind(tenantId,orderId).first<{plan:string}>();
      if(!order)return reject("Sipariş bulunamadı.",404);
      const statements=[env.DB.prepare("UPDATE subscription_orders SET status=?,provider_reference=?,failure_code=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?").bind(status,reference,["FAILED","CANCELLED","EXPIRED"].includes(status)?status:"",tenantId,orderId),env.DB.prepare("UPDATE provider_dispatches SET status=?,provider_reference=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='PAYMENT' AND record_id=?").bind(status==="COMPLETED"?"COMPLETED":status,reference,["FAILED","CANCELLED","EXPIRED"].includes(status)?status:"",tenantId,orderId),env.DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='PAYMENT'").bind(tenantId),env.DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'provider:payment','PAYMENT_CALLBACK','subscription',?,?)").bind(`AUD-${crypto.randomUUID()}`,tenantId,orderId,JSON.stringify({status,reference}))];
      if(status==="COMPLETED")statements.push(env.DB.prepare("INSERT INTO settings (tenant_id,key,value,updated_by,updated_at) VALUES (?,'plan',?,'provider:payment',CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(tenantId,order.plan));
      statements.push(markProcessed());await env.DB.batch(statements);
      if(status==="REFUNDED"){const active=await env.DB.prepare("SELECT plan FROM subscription_orders WHERE tenant_id=? AND status='COMPLETED' ORDER BY updated_at DESC LIMIT 1").bind(tenantId).first<{plan:string}>();if(!active)await env.DB.prepare("INSERT INTO settings (tenant_id,key,value,updated_by,updated_at) VALUES (?,'plan','FREE','provider:payment',CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,key) DO UPDATE SET value='FREE',updated_by='provider:payment',updated_at=CURRENT_TIMESTAMP").bind(tenantId).run()}
      return Response.json({ok:true,eventId:externalEventId,orderId,status});
    }
    if(provider==="RESEND"){
      const eventId=String(payload.eventId||""),status=String(payload.status||"").toUpperCase();
      if(!eventId||!["DELIVERED","BOUNCED","FAILED"].includes(status))return reject("Geçersiz e-posta teslimat geri bildirimi.");
      const next=status==="DELIVERED"?"PROCESSED":"FAILED";
      const result=await env.DB.prepare("UPDATE outbox_events SET status=?,last_error=?,processed_at=CASE WHEN ?='PROCESSED' THEN CURRENT_TIMESTAMP ELSE processed_at END WHERE tenant_id=? AND id=?").bind(next,status==="DELIVERED"?"":status,next,tenantId,eventId).run();
      if(!result.meta.changes)return reject("Teslimat olayı bulunamadı.",404);
      await env.DB.batch([env.DB.prepare("UPDATE notification_deliveries SET status=?,last_error=?,delivered_at=CASE WHEN ?='DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND outbox_event_id=? AND channel='EMAIL'").bind(status==="DELIVERED"?"DELIVERED":"FAILED",status==="DELIVERED"?"":status,status,tenantId,eventId),env.DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='RESEND'").bind(tenantId),env.DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'provider:resend','NOTIFICATION_CALLBACK','notifications',?,?)").bind(`AUD-${crypto.randomUUID()}`,tenantId,eventId,JSON.stringify({status})),markProcessed()]);
      return Response.json({ok:true,eventId:externalEventId,deliveryEventId:eventId,status});
    }
    if(provider==="EINVOICE"){
      const documentId=String(payload.documentId||""),status=String(payload.status||"").toUpperCase(),reference=String(payload.providerReference||"");
      if(!documentId||!["ACCEPTED","REJECTED","CANCELLED"].includes(status))return reject("Geçersiz e-belge geri bildirimi.");
      const document=await env.DB.prepare("SELECT id FROM e_documents WHERE tenant_id=? AND id=?").bind(tenantId,documentId).first();if(!document)return reject("E-belge kaydı bulunamadı.",404);
      await env.DB.batch([env.DB.prepare("UPDATE e_documents SET status=?,provider_reference=?,failure_code=?,issued_at=CASE WHEN ?='ACCEPTED' THEN CURRENT_TIMESTAMP ELSE issued_at END,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?").bind(status,reference,status==="REJECTED"?String(payload.failureCode||"REJECTED"):"",status,tenantId,documentId),env.DB.prepare("UPDATE provider_dispatches SET status=?,provider_reference=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='EINVOICE' AND record_id=?").bind(status,reference,status==="REJECTED"?String(payload.failureCode||"REJECTED"):"",tenantId,documentId),env.DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='EINVOICE'").bind(tenantId),env.DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'provider:einvoice','EINVOICE_CALLBACK','offers',?,?)").bind(`AUD-${crypto.randomUUID()}`,tenantId,documentId,JSON.stringify({status,reference})),markProcessed()]);
      return Response.json({ok:true,eventId:externalEventId,documentId,status});
    }
    if(provider!=="QUALIFIED_ESIGN")return reject("Desteklenmeyen sağlayıcı geri bildirimi.");
    const custodyRecordId=String(payload.custodyRecordId||""),status=String(payload.status||"").toUpperCase(),digest=String(payload.documentDigest||"");
    if(!custodyRecordId||!["VERIFIED","REJECTED","EXPIRED"].includes(status))return reject("Geçersiz e-imza geri bildirimi.");
    const result=await env.DB.prepare("UPDATE signature_requests SET status=?,document_digest=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND custody_record_id=? AND provider='QUALIFIED_ESIGN'").bind(status,digest,tenantId,custodyRecordId).run();
    if(!result.meta.changes)return reject("İmza isteği bulunamadı.",404);
    await env.DB.batch([env.DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider=?").bind(tenantId,provider),env.DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'provider:esign','ESIGN_CALLBACK','custody',?,?)").bind(`AUD-${crypto.randomUUID()}`,tenantId,custodyRecordId,JSON.stringify({status,digest})),markProcessed()]);
    return Response.json({ok:true,eventId:externalEventId,custodyRecordId,status});
  }catch(error){return apiErrorResponse(error,"Sağlayıcı geri bildirimi işlenemedi.")}
}
