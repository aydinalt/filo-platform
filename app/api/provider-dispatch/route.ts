import { dispatchNotifications, startPaymentCheckout, submitEDocument } from "../../../lib/provider-dispatch";
import { requirePrivilegedAccess, requireWorkspace, runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";

export const dynamic = "force-dynamic";

function errorResponse(error:unknown){
  if(error instanceof Response)return error;
  return Response.json({error:error instanceof Error?error.message:"Sağlayıcı işlemi tamamlanamadı."},{status:500});
}

export async function POST(request:Request){
  try{
    assertSameOrigin(request);assertRequestSize(request,32*1024);
    const payload=await request.json() as Record<string,unknown>,action=String(payload.action||"");
    const workspace=await requireWorkspace(false);
    await requirePrivilegedAccess(workspace,`provider-dispatch:${action||"unknown"}`);
    await enforceRateLimit(runtimeEnv().DB,request,`provider-dispatch:${action||"unknown"}`,20,60,workspace.email);
    if(action==="payment-checkout")return Response.json(await startPaymentCheckout(workspace,String(payload.orderId||""),request.url));
    if(action==="e-document")return Response.json(await submitEDocument(workspace,{module:String(payload.module||""),id:String(payload.id||""),documentType:payload.documentType?String(payload.documentType):undefined,origin:request.url}));
    if(action==="notifications")return Response.json(await dispatchNotifications(workspace));
    return Response.json({error:"Geçersiz sağlayıcı işlemi."},{status:400});
  }catch(error){return errorResponse(error)}
}
