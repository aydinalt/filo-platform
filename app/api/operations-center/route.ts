import {
  acknowledgeMonitoringEvent,
  operationsCenterSnapshot,
  resolveMonitoringEvent,
  runOperationsCenterSweep,
} from "../../../lib/operations-center";
import { requirePrivilegedAccess, requireWorkspace, runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic="force-dynamic";

const noStore=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const fail=(error:unknown)=>apiErrorResponse(error,"Operasyon merkezi işlemi tamamlanamadı.");

export async function GET(){
  try{return noStore(await operationsCenterSnapshot(await requireWorkspace(false)))}catch(error){return fail(error)}
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);assertRequestSize(request,64*1024);const payload=await request.json() as Record<string,unknown>,action=String(payload.action||""),workspace=await requireWorkspace(false);
    await requirePrivilegedAccess(workspace,`operations-center:${action||"unknown"}`);
    await enforceRateLimit(runtimeEnv().DB,request,`operations-center:${action||"unknown"}`,30,60,workspace.email);
    if(action==="sweep")return noStore({result:await runOperationsCenterSweep(workspace)});
    if(action==="acknowledge")return noStore({result:await acknowledgeMonitoringEvent(workspace,payload)});
    if(action==="resolve")return noStore({result:await resolveMonitoringEvent(workspace,payload)});
    return noStore({error:"Geçersiz operasyon merkezi işlemi."},400);
  }catch(error){return fail(error)}
}
