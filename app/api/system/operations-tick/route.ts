import { dispatchNotifications } from "../../../../lib/provider-dispatch";
import { runOperationsCenterSweep } from "../../../../lib/operations-center";
import {
  claimScheduledJob,
  finishScheduledJob,
  processOutbox,
  runOperationalAutomations,
  runtimeEnv,
  scheduledTenantWorkspaces,
} from "../../../../lib/platform-store";

export const dynamic = "force-dynamic";
const JOB_NAME="OPERATIONS_QUARTER_HOUR";

async function constantTimeTokenMatch(received:string,expected:string){
  const encoder=new TextEncoder();
  const [left,right]=await Promise.all([
    crypto.subtle.digest("SHA-256",encoder.encode(received)),
    crypto.subtle.digest("SHA-256",encoder.encode(expected)),
  ]);
  const a=new Uint8Array(left),b=new Uint8Array(right);let difference=a.length^b.length;
  for(let index=0;index<Math.max(a.length,b.length);index++)difference|=(a[index%a.length]||0)^(b[index%b.length]||0);
  return difference===0;
}

function currentSlot(){
  const quarterHour=15*60*1000;
  return new Date(Math.floor(Date.now()/quarterHour)*quarterHour).toISOString();
}

function noStore(body:unknown,status=200){
  return Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
}

async function executeTick(request:Request){
  const env=runtimeEnv(),secret=String(env.OPERATIONS_CRON_SECRET||"");
  if(secret.length<32)return noStore({error:"Zamanlayıcı sırrı en az 32 karakter olarak yapılandırılmalıdır."},503);
  const authorization=request.headers.get("authorization")||"";
  if(!await constantTimeTokenMatch(authorization,`Bearer ${secret}`))return noStore({error:"Yetkisiz zamanlayıcı isteği."},401);
  const slot=currentSlot(),selection=await scheduledTenantWorkspaces(100,slot),{workspaces,hasMore}=selection,summary={slot,selected:workspaces.length,totalTenants:selection.total,rotationOffset:selection.offset,nextRotationOffset:selection.nextOffset,completed:0,failed:0,duplicate:0,hasMore,tenants:[] as Array<Record<string,unknown>>};
  for(const workspace of workspaces){
    const claim=await claimScheduledJob(workspace,JOB_NAME,slot);
    if(!claim){summary.duplicate++;continue}
    try{
      const tasks=await runOperationalAutomations(workspace),monitoring=await runOperationsCenterSweep(workspace),outbox=await processOutbox(workspace),notifications=await dispatchNotifications(workspace),result={tasks,monitoring,outbox,notifications};
      await finishScheduledJob(workspace,claim.id,"COMPLETED",result);summary.completed++;summary.tenants.push({tenantId:workspace.tenantId,status:"COMPLETED",...result});
    }catch(error){
      const message=error instanceof Error?error.message:"Beklenmeyen zamanlanmış işlem hatası.";
      await finishScheduledJob(workspace,claim.id,"FAILED",{},message);summary.failed++;summary.tenants.push({tenantId:workspace.tenantId,status:"FAILED",error:message});
    }
  }
  return noStore(summary,summary.failed?207:200);
}

export async function POST(request:Request){return executeTick(request)}

// Vercel Cron invokes configured paths with GET and an Authorization bearer
// token. The same signed, idempotent job contract is retained for both hosts.
export async function GET(request:Request){return executeTick(request)}
