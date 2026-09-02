import { requireWorkspace, technicalReadiness2to6 } from "../../../lib/platform-store";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const workspace=await requireWorkspace(false);
    return Response.json(await technicalReadiness2to6(workspace),{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return apiErrorResponse(error,"Teknik hazırlık denetlenemedi.")}
}
