import { assertPermission, requireWorkspace, runtimeEnv } from "../../../lib/platform-store";
import { assertRequestSize, assertSameOrigin, enforceRateLimit, scanUploadedFileWithProvider } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-errors";

export const dynamic = "force-dynamic";
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain", "text/csv"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "txt", "csv"]);

function signatureMatches(type:string,bytes:Uint8Array){
  if(type==="application/pdf")return String.fromCharCode(...bytes.slice(0,5))==="%PDF-";
  if(type==="image/png")return bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
  if(type==="image/jpeg")return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  return true;
}

function errorResponse(error: unknown) {
  return apiErrorResponse(error, "Dosya işlemi başarısız.");
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);assertRequestSize(request,12*1024*1024);
    const workspace = await requireWorkspace(false);
    await enforceRateLimit(runtimeEnv().DB,request,"file-upload",20,300,workspace.email);
    const form = await request.formData();
    const file = form.get("file");
    const moduleName = String(form.get("module") || "");
    const recordId = String(form.get("recordId") || "");
    if (!(file instanceof File) || !moduleName || !recordId) return Response.json({ error: "Dosya, modül ve kayıt zorunludur." }, { status: 400 });
    assertPermission(workspace,"record",moduleName);
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "Dosya boyutu en fazla 10 MB olabilir." }, { status: 413 });
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "Yalnız PDF, JPG, PNG, TXT ve CSV yüklenebilir." }, { status: 415 });
    const extension=file.name.split(".").pop()?.toLowerCase()||"";
    if(!ALLOWED_EXTENSIONS.has(extension))return Response.json({error:"Dosya uzantısına izin verilmiyor."},{status:415});
    const { DB, BUCKET } = runtimeEnv();
    const exists = await DB.prepare("SELECT id FROM module_records WHERE tenant_id = ? AND module = ? AND id = ? AND archived = 0").bind(workspace.tenantId, moduleName, recordId).first();
    if (!exists) return Response.json({ error: "Bağlı kayıt bulunamadı." }, { status: 404 });
    const bytes = await file.arrayBuffer();
    if(!signatureMatches(file.type,new Uint8Array(bytes)))return Response.json({error:"Dosya içeriği bildirilen türle eşleşmiyor."},{status:415});
    const scan=await scanUploadedFileWithProvider({provider:runtimeEnv().MALWARE_SCAN_PROVIDER,cloudmersiveApiKey:runtimeEnv().CLOUDMERSIVE_API_KEY},file.type,new Uint8Array(bytes),file.name);
    const pendingScan=new Set(["PROVIDER_REQUIRED","SCAN_FAILED"]).has(scan.status);
    if(scan.status==="QUARANTINED"){if(scan.providerVerified)await DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='MALWARE_SCAN'").bind(workspace.tenantId).run();return Response.json({error:`Dosya güvenlik taramasında karantinaya alındı: ${scan.summary}`},{status:422})}
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    const id = `FILE-${crypto.randomUUID()}`;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const objectKey = `${workspace.tenantId}/${moduleName}/${recordId}/${id}-${safeName}`;
    await BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { tenantId: workspace.tenantId, module:moduleName, recordId, sha256,scanStatus:scan.status,scanEngine:scan.engine } });
    const statements=[
      DB.prepare("INSERT INTO file_objects (id, tenant_id, module, record_id, object_key, file_name, content_type, size, sha256, scan_status, scan_engine, scan_summary, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, workspace.tenantId, moduleName, recordId, objectKey, file.name, file.type, file.size, sha256,scan.status,scan.engine,scan.summary,workspace.email),
      DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, 'FILE_UPLOADED', ?, ?, ?)").bind(`AUD-${crypto.randomUUID()}`, workspace.tenantId, workspace.email, moduleName, recordId, JSON.stringify({ fileId: id, fileName: file.name, sha256,scan })),
    ];if(scan.providerVerified)statements.push(DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='MALWARE_SCAN'").bind(workspace.tenantId));
    await DB.batch(statements);
    return Response.json({ file: { id, fileName: file.name, contentType: file.type, size: file.size, sha256,scanStatus:scan.status },warning:pendingScan?scan.summary:undefined }, { status: pendingScan?202:201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const workspace = await requireWorkspace(false);
    const id = new URL(request.url).searchParams.get("id") || "";
    const { DB, BUCKET } = runtimeEnv();
    const meta = await DB.prepare("SELECT object_key AS objectKey, file_name AS fileName, content_type AS contentType,scan_status AS scanStatus FROM file_objects WHERE tenant_id = ? AND id = ?").bind(workspace.tenantId, id).first<{ objectKey: string; fileName: string; contentType: string;scanStatus:string }>();
    if (!meta) return new Response("Dosya bulunamadı.", { status: 404 });
    if(meta.scanStatus!=="CLEAN")return new Response("Dosya güvenlik taraması tamamlanmadan indirilemez.",{status:423});
    const object = await BUCKET.get(meta.objectKey);
    if (!object) return new Response("Dosya içeriği bulunamadı.", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": meta.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
