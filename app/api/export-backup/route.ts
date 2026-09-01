import { assertPermission, requirePrivilegedAccess, requireWorkspace, runtimeEnv, workspaceSnapshot } from "../../../lib/platform-store";

export const dynamic = "force-dynamic";

function errorResponse(error:unknown){
  if(error instanceof Response)return error;
  return Response.json({error:error instanceof Error?error.message:"Dışa aktarma başarısız."},{status:500});
}

export async function GET(){
  try{
    const workspace=await requireWorkspace(false);
    assertPermission(workspace,"settings");
    await requirePrivilegedAccess(workspace,"export-tenant-backup");
    const snapshot=await workspaceSnapshot(workspace);
    const exportedAt=new Date().toISOString();
    const payload={format:"FILO_TENANT_EXPORT",version:"1.27.0",exportedAt,...snapshot};
    const {DB}=runtimeEnv();
    await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'TENANT_EXPORT_CREATED','security','workspace',?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,JSON.stringify({exportedAt,recordCount:snapshot.records.length,fileCount:snapshot.files.length})).run();
    const safeDate=exportedAt.slice(0,10);
    return new Response(JSON.stringify(payload,null,2),{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename=filo-tenant-export-${safeDate}.json`,"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error)}
}
