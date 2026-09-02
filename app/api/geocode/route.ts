import { geocodeAddress } from "../../../lib/map-geocoding";
import { requireWorkspace, runtimeEnv } from "../../../lib/platform-store";
import { enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const workspace=await requireWorkspace(false),env=runtimeEnv();
    await enforceRateLimit(env.DB,request,"geocoding",30,60,workspace.email);
    const url=new URL(request.url),query=String(url.searchParams.get("q")||"").trim(),locale=String(url.searchParams.get("locale")||"tr-TR");
    if(query.length<3||query.length>160)return Response.json({error:"Adres araması 3–160 karakter olmalıdır."},{status:400});
    const results=await geocodeAddress(env,query,locale);
    return Response.json({query,results},{headers:{"Cache-Control":"private, max-age=300"}});
  }catch(error){return apiErrorResponse(error,"Adres aranamadı.")}
}
