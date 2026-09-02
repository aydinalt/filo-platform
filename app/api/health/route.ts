import { runtimeEnv } from "../../../lib/platform-store";

export const dynamic = "force-dynamic";

export async function GET(){
  try{
    const {DB,BUCKET,RELEASE_VERSION}=runtimeEnv();
    const started=Date.now();
    const [database,storage]=await Promise.all([
      DB.prepare("SELECT 1 AS ok").first<{ok:number}>(),
      BUCKET.list({prefix:"__health__/",limit:1}),
    ]);
    return Response.json({
      status:database?.ok===1&&Boolean(storage)?"healthy":"degraded",
      version:RELEASE_VERSION||"1.28.20",
      components:{database:database?.ok===1?"up":"down",objectStorage:storage?"up":"down"},
      latencyMs:Date.now()-started,
      checkedAt:new Date().toISOString(),
    },{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const incidentId=`ERR-${crypto.randomUUID()}`;
    console.error(`[${incidentId}] Sağlık kontrolü başarısız.`,error);
    return Response.json({status:"down",version:"1.28.20",error:"Sağlık kontrolü başarısız.",incidentId},{status:503,headers:{"Cache-Control":"private, no-store"}});
  }
}
