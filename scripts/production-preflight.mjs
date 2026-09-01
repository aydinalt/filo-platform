#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const args=new Set(process.argv.slice(2));
const environmentArg=[...args].find(value=>value.startsWith("--environment="));
const environment=String(environmentArg?.split("=")[1]||process.env.APP_ENV||"production").trim().toLowerCase();
if(!["development","staging","production"].includes(environment))throw new Error("--environment development, staging veya production olmalıdır.");
const profile=JSON.parse(await readFile(resolve(import.meta.dirname,"../config/environments",`${environment}.json`),"utf8"));
const strict=args.has("--strict"),json=args.has("--json");
const runtime=String(process.env.FILO_RUNTIME||"cloudflare").trim().toLowerCase()==="supabase"?"supabase":"cloudflare";

const httpsUrl=value=>{try{const url=new URL(value);return url.protocol==="https:"&&!/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/u.test(url.hostname)}catch{return false}};
const email=value=>/^\S+@\S+\.\S+$/u.test(value);
const positiveInteger=value=>/^\d+$/u.test(value)&&Number(value)>0;
const isoDate=value=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()+300000;
const hostList=value=>value.split(",").map(item=>item.trim()).filter(Boolean).every(host=>/^[a-z0-9.-]+$/iu.test(host)&&!host.includes(".."));
const postgresUrl=value=>{try{return ["postgres:","postgresql:"].includes(new URL(value).protocol)}catch{return false}};
const csvIncludes=value=>value.split(",").map(item=>item.trim()).filter(Boolean);
const emailList=value=>{const values=csvIncludes(value);return values.length>0&&values.length<=10&&values.every(email)};
const clean=value=>String(value??"").trim();
const isPlaceholder=value=>/^(replace_with_|re_replace|example|changeme|todo|your_|test_secret|00000000-0000-0000-0000-000000000000)/iu.test(clean(value));
const secretAgeValid=value=>{if(!isoDate(value))return false;const ageDays=(Date.now()-Date.parse(value))/86400000;return ageDays>=0&&ageDays<=Number(process.env.SECRET_MAX_AGE_DAYS||profile.secretMaxAgeDays)};

const environmentCheck=runtime==="supabase"?{
  id:"ENVIRONMENT_ISOLATION",label:"Vercel ve Supabase ortam ayrımı",
  required:["APP_ENV","ENVIRONMENT_ID","PUBLIC_APP_ORIGIN","FILO_RUNTIME","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY","SUPABASE_SERVICE_ROLE_KEY","SUPABASE_DATABASE_URL","SUPABASE_STORAGE_BUCKET","SUPABASE_CRON_MODE"],
  exact:{APP_ENV:environment.toUpperCase(),FILO_RUNTIME:"supabase",SUPABASE_CRON_MODE:"PG_CRON"},
  validators:{PUBLIC_APP_ORIGIN:profile.requiresHttps?httpsUrl:value=>/^https?:\/\//u.test(value),ENVIRONMENT_ID:value=>value.length>=6,NEXT_PUBLIC_SUPABASE_URL:httpsUrl,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:value=>value.length>=20,SUPABASE_SERVICE_ROLE_KEY:value=>value.length>=32,SUPABASE_DATABASE_URL:postgresUrl,SUPABASE_STORAGE_BUCKET:value=>/^[a-z0-9][a-z0-9-]{2,62}$/u.test(value)},
  note:"Vercel production, Supabase project, private Storage ve pg_cron kimlikleri staging ortamından ayrı olmalıdır."
}:{
  id:"ENVIRONMENT_ISOLATION",label:"Cloudflare ortam kimliği ve kaynak ayrımı",
  required:["APP_ENV","ENVIRONMENT_ID","PUBLIC_APP_ORIGIN","D1_ENVIRONMENT_ID","R2_ENVIRONMENT_ID"],
  exact:{APP_ENV:environment.toUpperCase()},
  validators:{PUBLIC_APP_ORIGIN:profile.requiresHttps?httpsUrl:value=>/^https?:\/\//u.test(value),ENVIRONMENT_ID:value=>value.length>=6,D1_ENVIRONMENT_ID:value=>value.length>=6,R2_ENVIRONMENT_ID:value=>value.length>=6},
  note:"Development, staging ve production farklı kimlik, D1, R2 ve origin kullanmalıdır."
};

const checks=[
  environmentCheck,
  ...(runtime==="supabase"?[{id:"SUPABASE_AUTH",label:"Supabase üretim kimlik güvenliği",required:["SUPABASE_AUTH_SITE_URL","SUPABASE_AUTH_ALLOWED_REDIRECTS","SUPABASE_AUTH_EMAIL_CONFIRMATION_REQUIRED","SUPABASE_AUTH_CUSTOM_SMTP_ENABLED","SUPABASE_AUTH_CAPTCHA_ENABLED","NEXT_PUBLIC_SUPABASE_REQUIRE_CAPTCHA","NEXT_PUBLIC_TURNSTILE_SITE_KEY","SUPABASE_AUTH_RATE_LIMIT_EMAILS_PER_HOUR","SUPABASE_AUTH_PASSWORD_MIN_LENGTH","PRIVILEGED_MFA_REQUIRED"],exact:{SUPABASE_AUTH_EMAIL_CONFIRMATION_REQUIRED:"true",SUPABASE_AUTH_CUSTOM_SMTP_ENABLED:"true",SUPABASE_AUTH_CAPTCHA_ENABLED:"true",NEXT_PUBLIC_SUPABASE_REQUIRE_CAPTCHA:"true",PRIVILEGED_MFA_REQUIRED:"true"},validators:{SUPABASE_AUTH_SITE_URL:value=>httpsUrl(value)&&value.replace(/\/$/,"")===clean(process.env.PUBLIC_APP_ORIGIN).replace(/\/$/,""),SUPABASE_AUTH_ALLOWED_REDIRECTS:value=>csvIncludes(value).includes(`${clean(process.env.PUBLIC_APP_ORIGIN).replace(/\/$/,"")}/auth/callback`),NEXT_PUBLIC_TURNSTILE_SITE_KEY:value=>value.length>=10,SUPABASE_AUTH_RATE_LIMIT_EMAILS_PER_HOUR:value=>positiveInteger(value)&&Number(value)<=1000,SUPABASE_AUTH_PASSWORD_MIN_LENGTH:value=>positiveInteger(value)&&Number(value)>=10},note:"Site URL, tek üretim callback'i, e-posta doğrulama, özel SMTP, CAPTCHA, AAL2/MFA ve Auth hız sınırları Supabase panelinde aynı değerlerle doğrulanmalıdır."}]:[]),
  {id:"SECRET_ROTATION",label:"Secret rotasyonu ve sahiplik",required:["SECRETS_ROTATED_AT","SECRET_ROTATION_OWNER","SECRET_MAX_AGE_DAYS"],validators:{SECRETS_ROTATED_AT:secretAgeValid,SECRET_ROTATION_OWNER:value=>value.length>=3,SECRET_MAX_AGE_DAYS:value=>positiveInteger(value)&&Number(value)<=profile.secretMaxAgeDays},note:`Sırlar en fazla ${profile.secretMaxAgeDays} günde döndürülmeli ve sahibi kayıtlı olmalıdır.`},
  {id:"LEGAL_PROFILE",label:"Hukuk ve kamuya açık kayıt",required:["LEGAL_CONTROLLER_NAME","LEGAL_CONTROLLER_EMAIL","LEGAL_CONTROLLER_ADDRESS","LEGAL_TERMS_EFFECTIVE_AT","PUBLIC_SIGNUP_ENABLED"],exact:{PUBLIC_SIGNUP_ENABLED:String(profile.publicSignupAllowed)},validators:{LEGAL_CONTROLLER_EMAIL:email,LEGAL_TERMS_EFFECTIVE_AT:isoDate},note:"KVKK/GDPR, alt işleyen ve kamuya açık şartlar için hukuk onayı gerekir."},
  {id:"SCHEDULED_OPERATIONS",label:"Zamanlanmış operasyonlar",required:["OPERATIONS_CRON_SECRET","OPERATIONS_ALERT_EMAILS","BROWSER_TELEMETRY_ENABLED"],exact:{BROWSER_TELEMETRY_ENABLED:"false"},validators:{OPERATIONS_CRON_SECRET:value=>value.length>=32,OPERATIONS_ALERT_EMAILS:emailList},note:"15 dakikalık operasyon zamanlayıcısı, gerçek nöbetçi e-posta rotası ve üretimde kapalı tarayıcı telemetrisi zorunludur."},
  {id:"MALWARE_SCAN",label:"Kötü amaçlı yazılım taraması",required:["MALWARE_SCAN_PROVIDER","CLOUDMERSIVE_API_KEY"],exact:{MALWARE_SCAN_PROVIDER:"CLOUDMERSIVE"},validators:{CLOUDMERSIVE_API_KEY:value=>value.length>=20},note:"Gerçek temiz/karantina sağlayıcı sonucu olmadan dosya temiz kabul edilmez."},
  {id:"QUALIFIED_ESIGN",label:"Nitelikli elektronik imza",required:["ESIGN_API_KEY","ESIGN_WEBHOOK_SECRET"],validators:{ESIGN_API_KEY:value=>value.length>=20,ESIGN_WEBHOOK_SECRET:value=>value.length>=32},note:"İmza niyeti, belge özeti, zaman damgası ve imzalı callback kanıtlanmalıdır."},
  {id:"VIN_US_CA_MX",label:"ABD/Kanada/Meksika VIN",required:[],note:"NHTSA vPIC canlı erişimi ve hız/ağ politikası çalışma zamanı ile doğrulanır.",advisory:true},
  {id:"VIN_CUSTOM_MARKETS",label:"Diğer pazar VIN adaptörü",required:["VEHICLE_CATALOG_PROVIDER","VEHICLE_CATALOG_API_URL","VEHICLE_CATALOG_API_KEY","VEHICLE_CATALOG_ALLOWED_HOSTS"],exact:{VEHICLE_CATALOG_PROVIDER:"CUSTOM_HTTP_V1"},validators:{VEHICLE_CATALOG_API_URL:httpsUrl,VEHICLE_CATALOG_API_KEY:value=>value.length>=20,VEHICLE_CATALOG_ALLOWED_HOSTS:hostList},note:"Diğer ISO-2 pazarlar için yalnız HTTPS ve izinli host sözleşmesi kullanılmalı."},
  {id:"E_DOCUMENT",label:"E-belge sağlayıcısı",required:["EINVOICE_API_URL","EINVOICE_API_KEY","EINVOICE_WEBHOOK_SECRET"],validators:{EINVOICE_API_URL:httpsUrl,EINVOICE_API_KEY:value=>value.length>=20,EINVOICE_WEBHOOK_SECRET:value=>value.length>=32},note:"E-belge yalnız onaylı teklif ve doğrulanmış vergi profiliyle gönderilir."},
  {id:"PAYMENT",label:"Ödeme sağlayıcısı",required:["PAYMENT_API_URL","PAYMENT_API_KEY","PAYMENT_WEBHOOK_SECRET","PAYMENT_CHECKOUT_HOSTS"],validators:{PAYMENT_API_URL:httpsUrl,PAYMENT_API_KEY:value=>value.length>=20,PAYMENT_WEBHOOK_SECRET:value=>value.length>=32,PAYMENT_CHECKOUT_HOSTS:hostList},note:"Ücretsiz plan dışındaki paketlerde gerçek tamamlanmış callback gerekir."},
  {id:"MESSAGING",label:"E-posta ve push",required:["RESEND_API_KEY","RESEND_WEBHOOK_SECRET","RESEND_FROM","EXPO_ACCESS_TOKEN","EXPO_PROJECT_ID"],validators:{RESEND_API_KEY:value=>value.length>=20,RESEND_WEBHOOK_SECRET:value=>value.length>=32,RESEND_FROM:value=>value.length>=5,EXPO_ACCESS_TOKEN:value=>value.length>=20,EXPO_PROJECT_ID:value=>/^[0-9a-f-]{36}$/iu.test(value)},note:"Teslimat, bounce ve push receipt sonuçları doğrulanmadan bildirim başarılı sayılmaz."},
  {id:"TRACKER_GATEWAYS",label:"Fiziksel takip gatewayleri",required:["TRACKER_GATEWAY_MODE","DEVICE_TOKEN_MAX_AGE_DAYS"],exact:{TRACKER_GATEWAY_MODE:"DEVICE_TOKEN"},validators:{DEVICE_TOKEN_MAX_AGE_DAYS:value=>positiveInteger(value)&&Number(value)<=90},note:"Teltonika/Queclink ortak sabit sır yerine süreli cihaz tokenı, HMAC ve replay koruması kullanır."},
  {id:"MAP_PROVIDER",label:"Harita ve konum sağlayıcısı",required:["MAP_PROVIDER","MAP_ALLOWED_HOSTS"],exact:{MAP_PROVIDER:"OPENSTREETMAP"},validators:{MAP_ALLOWED_HOSTS:value=>hostList(value)&&value.split(",").map(item=>item.trim().toLowerCase()).includes("www.openstreetmap.org")},note:"Harita host izin listesi, kullanım şartları ve konum veri akışı hukuk profilinde kayıtlı olmalıdır."},
];

const results=checks.map(check=>{
  const missing=check.required.filter(key=>!clean(process.env[key])||isPlaceholder(process.env[key]));
  const wrong=Object.entries(check.exact??{}).filter(([key,expected])=>clean(process.env[key]).toUpperCase()!==String(expected).toUpperCase()).map(([key,expected])=>({key,expected}));
  const invalid=Object.entries(check.validators??{}).filter(([key,validator])=>clean(process.env[key])&&!validator(clean(process.env[key]))).map(([key])=>key);
  const status=check.advisory&&check.required.length===0?"ADVISORY":missing.length||wrong.length||invalid.length?"CONFIG_REQUIRED":"CONFIGURED_REQUIRES_LIVE_PROOF";
  return {id:check.id,label:check.label,status,missing,wrong,invalid,note:check.note};
});
const blockers=results.filter(result=>result.status==="CONFIG_REQUIRED"),output={format:"FILO_PRODUCTION_PREFLIGHT_V3",environment,runtime,profile,status:blockers.length?"CONFIG_REQUIRED":"READY_FOR_LIVE_PROOF",strict,checks:results,secretValuesIncluded:false};
if(json)console.log(JSON.stringify(output,null,2));else{console.log(`Filo Platform ${environment} ön kontrolü · ${output.status}`);for(const result of results){const details=[result.missing.length?`eksik: ${result.missing.join(", ")}`:"",result.invalid.length?`geçersiz: ${result.invalid.join(", ")}`:"",result.wrong.length?`beklenen: ${result.wrong.map(item=>`${item.key}=${item.expected}`).join(", ")}`:""].filter(Boolean).join(" · ");console.log(`${result.status.padEnd(30)} ${result.id}${details?` · ${details}`:""}`)}console.log("Bu kontrol sır değerlerini yazmaz; gerçek callback, hukuk, saha, bağımsız test, pilot ve rollout kanıtı ayrıca zorunludur.")}
if(strict&&blockers.length)process.exitCode=2;
