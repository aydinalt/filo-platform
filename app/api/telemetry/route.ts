import { assertPermission, requireWorkspace, runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  return apiErrorResponse(error, "Telemetri işlemi başarısız.");
}

export async function GET() {
  try {
    const workspace = await requireWorkspace(false);
    const { DB } = runtimeEnv();
    const rows = await DB.prepare(
      `SELECT vehicle_id AS vehicleId, device_id AS deviceId, latitude, longitude, speed, battery,
              captured_at AS capturedAt, received_at AS receivedAt
       FROM telemetry_events WHERE tenant_id = ? ORDER BY captured_at DESC LIMIT 200`,
    ).bind(workspace.tenantId).all();
    return Response.json({ events: rows.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);assertRequestSize(request,32*1024);
    const workspace = await requireWorkspace(false);
    const env=runtimeEnv();
    if(String(env.APP_ENV||"").toLowerCase()==="production"&&String(env.BROWSER_TELEMETRY_ENABLED||"").toLowerCase()!=="true")return Response.json({error:"Üretimde tarayıcı telemetrisi kapalıdır; yetkili mobil veya fiziksel cihaz kanalını kullanın.",code:"DEVICE_CHANNEL_REQUIRED"},{status:403});
    await enforceRateLimit(env.DB,request,"browser-telemetry",240,60,workspace.email);
    assertPermission(workspace,"record","devices");
    const payload = await request.json() as Record<string, unknown>;
    const vehicleId = String(payload.vehicleId || "").trim().toLocaleUpperCase("tr-TR");
    const deviceId = String(payload.deviceId || "").trim().toLocaleUpperCase("tr-TR");
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const speed = Math.max(0, Math.round(Number(payload.speed) || 0));
    const battery = Math.min(100, Math.max(0, Math.round(Number(payload.battery) || 0)));
    const capturedAt = String(payload.capturedAt || new Date().toISOString());
    if (!vehicleId || !deviceId || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return Response.json({ error: "Araç, cihaz ve geçerli koordinatlar zorunludur." }, { status: 400 });
    }
    const id = `TEL-${crypto.randomUUID()}`;
    const { DB } = env;
    const [vehicle,device]=await Promise.all([DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0 AND (id=? OR upper(json_extract(data,'$.plate'))=?)").bind(workspace.tenantId,vehicleId,vehicleId).first(),DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='devices' AND archived=0 AND (id=? OR upper(json_extract(data,'$.assetId'))=?)").bind(workspace.tenantId,deviceId,deviceId).first()]);
    if(!vehicle||!device)return Response.json({error:"Araç ve cihaz bu çalışma alanının aktif envanterinde bulunmalıdır."},{status:404});
    const result=await DB.prepare("INSERT OR IGNORE INTO telemetry_events (id, tenant_id, vehicle_id, device_id, latitude, longitude, speed, battery, source, provider, event_type, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'BROWSER_DIAGNOSTIC', 'INTERNAL', 'DIAGNOSTIC', ?)").bind(id, workspace.tenantId, vehicleId, deviceId, String(latitude), String(longitude), speed, battery, capturedAt).run();
    if(!result.meta.changes)return Response.json({duplicate:true,event:{vehicleId,deviceId,capturedAt}});
    await DB.prepare("INSERT INTO outbox_events (id, tenant_id, topic, payload) VALUES (?, ?, 'telemetry.received', ?)").bind(`OUT-${crypto.randomUUID()}`, workspace.tenantId, JSON.stringify({ id, vehicleId, deviceId, capturedAt })).run();
    return Response.json({ event: { id, vehicleId, deviceId, latitude, longitude, speed, battery, capturedAt } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
