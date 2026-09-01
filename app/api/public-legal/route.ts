import { buildPublicLegalDocument, platformLegalStatus } from "../../../lib/legal-documents";
import { runtimeEnv } from "../../../lib/platform-store";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const env=runtimeEnv(),kind=new URL(request.url).searchParams.get("document")||"status",status=platformLegalStatus(env);
    if(kind==="status")return Response.json(status,{headers:{"Cache-Control":"public, max-age=60"}});
    if(kind!=="terms"&&kind!=="privacy")return Response.json({error:"Tanımsız kamu hukuk belgesi."},{status:400});
    return new Response(buildPublicLegalDocument(kind,env),{headers:{"Content-Type":"text/plain; charset=utf-8","Content-Disposition":`inline; filename=${kind}-${status.version}.txt`,"Cache-Control":"public, max-age=60","X-Legal-Profile-Ready":String(status.ready)}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Yasal bilgiler yüklenemedi."},{status:500})}
}
