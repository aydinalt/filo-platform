import {
  mobileHeartbeat,
  recordMobileRuntimeEvent,
  mobileRuntimeStatus,
  registerMobileInstallation,
  runtimeEnv,
  startMobileTrackingSession,
  stopMobileTrackingSession,
  workspaceForDeviceToken,
} from "../../../lib/platform-store";
import { assertRequestSize, enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";

function bearer(request:Request){
  const authorization=request.headers.get("authorization")||"";
  return authorization.startsWith("Bearer ")?authorization.slice(7).trim():"";
}

function errorResponse(error:unknown){
  return apiErrorResponse(error,"Mobil çalışma zamanı işlemi başarısız.");
}

export async function GET(request:Request){
  try{
    const token=bearer(request);if(!token)return Response.json({error:"Mobil cihaz anahtarı zorunludur."},{status:401});
    const device=await workspaceForDeviceToken(token);await enforceRateLimit(runtimeEnv().DB,request,"mobile-runtime-status",120,60,device.deviceId);
    return Response.json(await mobileRuntimeStatus(device),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return errorResponse(error)}
}

export async function POST(request:Request){
  try{
    assertRequestSize(request,32*1024);const token=bearer(request);if(!token)return Response.json({error:"Mobil cihaz anahtarı zorunludur."},{status:401});
    const device=await workspaceForDeviceToken(token);await enforceRateLimit(runtimeEnv().DB,request,"mobile-runtime-command",180,60,device.deviceId);
    const payload=await request.json() as Record<string,unknown>,action=String(payload.action||"");
    if(action==="register")return Response.json({installation:await registerMobileInstallation(device,payload)},{status:201});
    if(action==="start-session")return Response.json({session:await startMobileTrackingSession(device,payload)},{status:201});
    if(action==="heartbeat")return Response.json({heartbeat:await mobileHeartbeat(device,payload)});
    if(action==="diagnostic")return Response.json({event:await recordMobileRuntimeEvent(device,payload)},{status:201});
    if(action==="stop-session")return Response.json({session:await stopMobileTrackingSession(device,payload)});
    return Response.json({error:"Geçersiz mobil çalışma zamanı işlemi."},{status:400});
  }catch(error){return errorResponse(error)}
}
