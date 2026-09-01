type RateLimitResult={remaining:number;resetAt:string};

export function assertRequestSize(request:Request,maxBytes:number){
  const length=Number(request.headers.get("content-length")||0);
  if(Number.isFinite(length)&&length>maxBytes)throw new Response("İstek gövdesi izin verilen sınırı aşıyor.",{status:413});
}

export function assertSameOrigin(request:Request){
  const expected=new URL(request.url).origin;
  const origin=request.headers.get("origin");
  const fetchSite=request.headers.get("sec-fetch-site");
  if(origin!==expected||fetchSite&&fetchSite!=="same-origin")throw new Response("Çapraz kaynaklı değişiklik isteği engellendi.",{status:403});
}

async function sha256(value:string){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

export async function enforceRateLimit(DB:D1Database,request:Request,scope:string,limit:number,windowSeconds:number,principal="anonymous"):Promise<RateLimitResult>{
  const ip=request.headers.get("cf-connecting-ip")||request.headers.get("x-real-ip")||"unknown";
  const keyHash=await sha256(`${scope}|${principal.toLocaleLowerCase("en-US")}|${ip}`);
  const now=Math.floor(Date.now()/1000),windowStart=Math.floor(now/windowSeconds)*windowSeconds;
  await DB.prepare("INSERT INTO rate_limit_windows (scope,key_hash,window_start,hits,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(scope,key_hash,window_start) DO UPDATE SET hits=hits+1,updated_at=CURRENT_TIMESTAMP").bind(scope,keyHash,windowStart,1).run();
  const row=await DB.prepare("SELECT hits FROM rate_limit_windows WHERE scope=? AND key_hash=? AND window_start=?").bind(scope,keyHash,windowStart).first<{hits:number}>();
  const hits=Number(row?.hits||1),resetAt=new Date((windowStart+windowSeconds)*1000).toISOString();
  if(Math.random()<0.02)await DB.prepare("DELETE FROM rate_limit_windows WHERE window_start<?").bind(now-86400).run();
  if(hits>limit)throw new Response("Çok fazla istek gönderildi. Lütfen pencere yenilendikten sonra tekrar deneyin.",{status:429,headers:{"Retry-After":String(Math.max(1,windowStart+windowSeconds-now)),"X-RateLimit-Limit":String(limit),"X-RateLimit-Remaining":"0","X-RateLimit-Reset":resetAt}});
  return {remaining:Math.max(0,limit-hits),resetAt};
}

export type UploadScan={status:"CLEAN"|"QUARANTINED"|"PROVIDER_REQUIRED"|"SCAN_FAILED";engine:string;summary:string;providerVerified?:boolean};
export type MalwareScanConfig={provider?:string;cloudmersiveApiKey?:string};

function startsWith(bytes:Uint8Array,signature:number[]){return signature.every((value,index)=>bytes[index]===value)}

export function scanUploadedFile(type:string,bytes:Uint8Array):UploadScan{
  const engine="FILO_STATIC_SCAN_V1";
  if(startsWith(bytes,[0x4d,0x5a])||startsWith(bytes,[0x7f,0x45,0x4c,0x46])||startsWith(bytes,[0xcf,0xfa,0xed,0xfe])||startsWith(bytes,[0xfe,0xed,0xfa,0xcf])||startsWith(bytes,[0x50,0x4b,0x03,0x04]))return {status:"QUARANTINED",engine,summary:"Çalıştırılabilir veya arşiv kapsayıcısı imzası algılandı."};
  const sample=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
  if(sample.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"))return {status:"QUARANTINED",engine,summary:"EICAR test imzası algılandı."};
  if(type==="application/pdf"&&/(\/JavaScript|\/JS\s|\/Launch|\/EmbeddedFile|\/RichMedia)/i.test(sample))return {status:"QUARANTINED",engine,summary:"PDF içinde aktif içerik veya gömülü dosya işareti algılandı."};
  if((type==="text/plain"||type==="text/csv")&&(bytes.includes(0)||/<script\b|javascript:|<iframe\b|<object\b/i.test(sample)))return {status:"QUARANTINED",engine,summary:"Metin dosyasında ikili veya aktif içerik algılandı."};
  return {status:"CLEAN",engine,summary:"Tür, sihirli bayt, aktif içerik ve bilinen test imzası kontrolleri geçti."};
}

export async function scanUploadedFileWithProvider(config:MalwareScanConfig,type:string,bytes:Uint8Array,fileName:string):Promise<UploadScan>{
  const preflight=scanUploadedFile(type,bytes);
  if(preflight.status!=="CLEAN")return preflight;
  const provider=String(config.provider||"").trim().toUpperCase();
  if(provider!=="CLOUDMERSIVE"||!config.cloudmersiveApiKey)return {status:"PROVIDER_REQUIRED",engine:"CLOUDMERSIVE_VIRUS_SCAN_V1",summary:"Üretim kötü amaçlı yazılım sağlayıcısı yapılandırılmadan dosya temiz kabul edilemez."};
  const ownedBytes=new Uint8Array(bytes.byteLength);ownedBytes.set(bytes);const form=new FormData();form.append("inputFile",new Blob([ownedBytes.buffer],{type}),fileName||"upload.bin");
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch("https://api.cloudmersive.com/virus/scan/file",{method:"POST",headers:{Apikey:config.cloudmersiveApiKey},body:form,signal:controller.signal});
    const payload=await response.json().catch(()=>({})) as {CleanResult?:unknown;FoundViruses?:unknown};
    if(!response.ok)return {status:"SCAN_FAILED",engine:"CLOUDMERSIVE_VIRUS_SCAN_V1",summary:`Kötü amaçlı yazılım taraması HTTP ${response.status} ile tamamlanamadı.`};
    if(payload.CleanResult!==true){const found=Array.isArray(payload.FoundViruses)?payload.FoundViruses.slice(0,5).map(item=>typeof item==="string"?item:JSON.stringify(item)).join(", "):"Tehdit veya güvenli olmayan içerik";return {status:"QUARANTINED",engine:"CLOUDMERSIVE_VIRUS_SCAN_V1",summary:`Harici tarama dosyayı karantinaya aldı: ${found.slice(0,300)}`,providerVerified:true}}
    return {status:"CLEAN",engine:"CLOUDMERSIVE_VIRUS_SCAN_V1",summary:"Yerel ön kontrol ve Cloudmersive kötü amaçlı yazılım taraması temiz sonuçlandı.",providerVerified:true};
  }catch(error){return {status:"SCAN_FAILED",engine:"CLOUDMERSIVE_VIRUS_SCAN_V1",summary:`Kötü amaçlı yazılım sağlayıcısına ulaşılamadı: ${error instanceof Error?error.message:"bağlantı hatası"}`}}
  finally{clearTimeout(timeout)}
}

export function applySecurityHeaders(response:Response,request:Request){
  const headers=new Headers(response.headers);
  headers.set("X-Content-Type-Options","nosniff");
  headers.set("Referrer-Policy","strict-origin-when-cross-origin");
  headers.set("X-Frame-Options","DENY");
  headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=(self), payment=(self)");
  headers.set("Content-Security-Policy","default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.openstreetmap.org; connect-src 'self' https://challenges.cloudflare.com; frame-src https://www.openstreetmap.org https://challenges.cloudflare.com");
  if(new URL(request.url).protocol==="https:")headers.set("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
