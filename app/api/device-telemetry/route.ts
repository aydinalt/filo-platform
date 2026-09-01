import { runtimeEnv, workspaceForDeviceToken } from "../../../lib/platform-store";
import { assertRequestSize, enforceRateLimit } from "../../../lib/security";

export const dynamic = "force-dynamic";

function responseError(error:unknown){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Telemetri alınamadı."},{status:500});}

export async function POST(request:Request){
  try{
    assertRequestSize(request,32*1024);
    const authorization=request.headers.get("authorization")||"";
    const token=authorization.startsWith("Bearer ")?authorization.slice(7).trim():"";
    if(!token)return Response.json({error:"Cihaz anahtarı zorunludur."},{status:401});
    const device=await workspaceForDeviceToken(token);
    if(device.provider!=="MOBILE")return Response.json({error:"Fiziksel takip cihazları yalnız imzalı tracker gateway üzerinden veri gönderebilir."},{status:403});
    await enforceRateLimit(runtimeEnv().DB,request,"device-telemetry",600,60,device.deviceId);
    const body=await request.json() as Record<string,unknown>;
    const vehicleId=String(body.vehicleId||"").trim().toLocaleUpperCase("tr-TR"),sessionId=String(body.sessionId||"").trim(),source=String(body.source||device.provider||"MOBILE").trim().toLocaleUpperCase("tr-TR"),eventType=String(body.eventType||"LOCATION").trim().toLocaleUpperCase("tr-TR");
    const latitude=Number(body.latitude),longitude=Number(body.longitude),speed=Math.max(0,Math.round(Number(body.speed)||0)),battery=Math.min(100,Math.max(0,Math.round(Number(body.battery)||0)));
    const sequence=Math.max(0,Math.round(Number(body.sequence)||0)),accuracy=Math.max(0,Math.round(Number(body.accuracy)||0)),altitude=Math.round(Number(body.altitude)||0),heading=Math.min(359,Math.max(0,Math.round(Number(body.heading)||0)));
    const capturedAt=String(body.capturedAt||new Date().toISOString());
    if(!vehicleId||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||Number.isNaN(Date.parse(capturedAt))||source!=="MOBILE"||!/^[A-Z0-9_.-]{2,40}$/.test(eventType))return Response.json({error:"Araç, kaynak, olay, ISO tarih ve geçerli koordinatlar zorunludur."},{status:400});
    if(source!==device.provider)return Response.json({error:"Telemetri kaynağı cihaz anahtarı sağlayıcısıyla eşleşmiyor."},{status:403});
    const {DB}=runtimeEnv(),id=`TEL-${crypto.randomUUID()}`;
    const vehicle=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0 AND (id=? OR upper(json_extract(data,'$.plate'))=?)").bind(device.tenantId,vehicleId,vehicleId).first();
    if(!vehicle)return Response.json({error:"Telemetri aracının bu çalışma alanında aktif kaydı bulunamadı."},{status:404});
    if(source==="MOBILE"){
      const active=await DB.prepare("SELECT id FROM tracking_sessions WHERE tenant_id=? AND device_id=? AND vehicle_id=? AND id=? AND status='ACTIVE'").bind(device.tenantId,device.deviceId,vehicleId,sessionId).first();if(!active)return Response.json({error:"Geçerli aktif mobil takip oturumu zorunludur."},{status:409});
    }
    const result=await DB.prepare("INSERT OR IGNORE INTO telemetry_events (id,tenant_id,vehicle_id,device_id,latitude,longitude,speed,battery,source,provider,event_type,sequence,accuracy,altitude,heading,session_id,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,device.tenantId,vehicleId,device.deviceId,String(latitude),String(longitude),speed,battery,source,device.provider,eventType,sequence,accuracy,altitude,heading,sessionId,capturedAt).run();
    if(!result.meta.changes)return Response.json({duplicate:true,event:{vehicleId,deviceId:device.deviceId,capturedAt}},{status:200});
    const connectionProvider="DEVICE_TELEMETRY";const statements=[
      DB.prepare("INSERT INTO outbox_events (id,tenant_id,topic,payload) VALUES (?,?,'telemetry.received',?)").bind(`OUT-${crypto.randomUUID()}`,device.tenantId,JSON.stringify({id,vehicleId,deviceId:device.deviceId,capturedAt})),
      DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider=?").bind(device.tenantId,connectionProvider),
    ];if(source==="MOBILE")statements.push(DB.prepare("UPDATE tracking_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status='ACTIVE'").bind(device.tenantId,sessionId),DB.prepare("UPDATE mobile_installations SET last_heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND device_id=?").bind(device.tenantId,device.deviceId));await DB.batch(statements);
    return Response.json({event:{id,vehicleId,deviceId:device.deviceId,source,provider:device.provider,eventType,sequence,accuracy,altitude,heading,sessionId,latitude,longitude,speed,battery,capturedAt}},{status:201});
  }catch(error){return responseError(error)}
}
