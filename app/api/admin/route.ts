import { apiErrorResponse } from "../../../lib/api-errors";
import { platformAdminSaveMember, platformAdminSnapshot, requirePlatformAdmin } from "../../../lib/platform-admin";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";
import { runtimeEnv } from "../../../lib/platform-store";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const identity=await requirePlatformAdmin(false);
    return Response.json(await platformAdminSnapshot(identity),{headers:{"Cache-Control":"no-store"}});
  }catch(error){return apiErrorResponse(error,"Admin verileri alınamadı.");}
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);assertRequestSize(request,64*1024);
    const identity=await requirePlatformAdmin(true);
    await enforceRateLimit(runtimeEnv().DB,request,"platform-admin",30,60,identity.email);
    const payload=await request.json() as Record<string,unknown>;
    if(payload.action==="save-member")return Response.json({member:await platformAdminSaveMember(identity,(payload.member||{}) as Record<string,unknown>)});
    return Response.json({error:"Geçersiz admin işlemi."},{status:400});
  }catch(error){return apiErrorResponse(error,"Admin işlemi tamamlanamadı.");}
}
