import { assertPermission, requireWorkspace, runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";
const MAX_BACKUP_SIZE=10*1024*1024;

export async function POST(request:Request){
  try{
    assertSameOrigin(request);assertRequestSize(request,MAX_BACKUP_SIZE);
    const workspace=await requireWorkspace(false);
    await enforceRateLimit(runtimeEnv().DB,request,"backup-validate",6,600,workspace.email);
    assertPermission(workspace,"settings");
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>MAX_BACKUP_SIZE)return Response.json({error:"Yedek dosyası en fazla 10 MB olabilir."},{status:413});
    const backup=JSON.parse(raw) as Record<string,unknown>;
    if(backup.format!=="FILO_TENANT_EXPORT")return Response.json({error:"Geçersiz Filo yedek biçimi."},{status:400});
    const exportedWorkspace=backup.workspace as Record<string,unknown>|undefined;
    if(exportedWorkspace?.tenantId!==workspace.tenantId)return Response.json({error:"Yedek farklı bir çalışma alanına ait."},{status:409});
    const records=Array.isArray(backup.records)?backup.records as Array<Record<string,unknown>>:[];
    const files=Array.isArray(backup.files)?backup.files as Array<Record<string,unknown>>:[];
    const recordKeys=new Set<string>();const duplicateRecords:string[]=[];
    for(const row of records){const key=`${String(row.module||"")}:${String(row.id||"")}`;if(recordKeys.has(key))duplicateRecords.push(key);recordKeys.add(key)}
    const fileIds=new Set<string>();const duplicateFiles:string[]=[];
    for(const row of files){const id=String(row.id||"");if(fileIds.has(id))duplicateFiles.push(id);fileIds.add(id)}
    const checks=[
      {key:"FORMAT",passed:true,detail:String(backup.version||"sürümsüz")},
      {key:"TENANT_MATCH",passed:true,detail:workspace.tenantId},
      {key:"RECORD_IDENTIFIERS",passed:duplicateRecords.length===0,detail:`${records.length} kayıt · ${duplicateRecords.length} mükerrer`},
      {key:"FILE_METADATA",passed:duplicateFiles.length===0,detail:`${files.length} dosya üst verisi · ${duplicateFiles.length} mükerrer`},
    ];
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(raw));
    const sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
    const valid=checks.every(item=>item.passed);const {DB}=runtimeEnv();
    await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,valid?"BACKUP_DRY_RUN_PASSED":"BACKUP_DRY_RUN_FAILED","security","backup-validator",JSON.stringify({checks,sha256,scope:"NON_DESTRUCTIVE_RESTORE_VALIDATION"})).run();
    return Response.json({valid,checks,sha256,scope:"NON_DESTRUCTIVE_RESTORE_VALIDATION",warning:"Bu kontrol veri bütünlüğünü doğrular; ayrı ortamda gerçek geri yükleme provasının yerine geçmez."});
  }catch(error){
    if(error instanceof Response)return error;
    if(error instanceof SyntaxError)return Response.json({error:"Yedek dosyası geçerli JSON değil."},{status:400});
    return apiErrorResponse(error,"Yedek doğrulanamadı.");
  }
}
