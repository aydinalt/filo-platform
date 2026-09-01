import { requireWorkspace, technicalReadiness2to6 } from "../../../lib/platform-store";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const workspace=await requireWorkspace(false);
    return Response.json(await technicalReadiness2to6(workspace),{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){if(error instanceof Response)return error;return Response.json({error:error instanceof Error?error.message:"Teknik hazırlık denetlenemedi."},{status:500})}
}
