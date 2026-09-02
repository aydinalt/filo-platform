import { buildLegalDocument, LEGAL_DOCUMENTS, legalProfileReadiness, type LegalDocumentKey } from "../../../lib/legal-documents";
import { getLegalProfile, requireWorkspace } from "../../../lib/platform-store";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  try{
    const workspace=await requireWorkspace(false),profile=await getLegalProfile(workspace),url=new URL(request.url),key=String(url.searchParams.get("document")||"") as LegalDocumentKey;
    if(!LEGAL_DOCUMENTS.some(document=>document.key===key))return Response.json({error:"Tanımsız hukuk belgesi."},{status:400});
    const content=buildLegalDocument(key,profile),readiness=legalProfileReadiness(profile),definition=LEGAL_DOCUMENTS.find(document=>document.key===key)!;
    return new Response(content,{headers:{"Content-Type":"text/plain; charset=utf-8","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(`${key}-2026-08-v4.txt`)}`,"Cache-Control":"private, no-store","X-Legal-Profile-Ready":String(readiness.ready),"X-Legal-Document-Title":encodeURIComponent(definition.title)}});
  }catch(error){return apiErrorResponse(error,"Hukuk belgesi üretilemedi.")}
}
