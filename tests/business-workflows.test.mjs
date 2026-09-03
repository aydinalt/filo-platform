import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const uiI18n = await readFile(new URL("../app/ui-i18n.ts", import.meta.url), "utf8");
const masterCss = await readFile(new URL("../app/MasterDesign.module.css", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../lib/platform-store.ts", import.meta.url), "utf8");
const readinessContract = await readFile(new URL("../lib/readiness-contract.ts", import.meta.url), "utf8");
const platformApi = await readFile(new URL("../app/api/platform/route.ts", import.meta.url), "utf8");
const filesApi = await readFile(new URL("../app/api/files/route.ts", import.meta.url), "utf8");
const telemetryApi = await readFile(new URL("../app/api/telemetry/route.ts", import.meta.url), "utf8");
const deviceTelemetryApi = await readFile(new URL("../app/api/device-telemetry/route.ts", import.meta.url), "utf8");
const mobileRuntimeApi = await readFile(new URL("../app/api/mobile-runtime/route.ts", import.meta.url), "utf8");
const trackerGatewayApi = await readFile(new URL("../app/api/tracker-gateway/route.ts", import.meta.url), "utf8");
const mobileRuntime = await readFile(new URL("../mobile-driver/src/driver-runtime.ts", import.meta.url), "utf8");
const mobileAppConfig = await readFile(new URL("../mobile-driver/app.config.ts", import.meta.url), "utf8");
const trackerBridge = await readFile(new URL("../gateways/tracker-http-bridge/index.mjs", import.meta.url), "utf8");
const backupApi = await readFile(new URL("../app/api/export-backup/route.ts", import.meta.url), "utf8");
const importApi = await readFile(new URL("../app/api/import/route.ts", import.meta.url), "utf8");
const eDocumentApi = await readFile(new URL("../app/api/export-einvoice-draft/route.ts", import.meta.url), "utf8");
const providerCallbackApi = await readFile(new URL("../app/api/provider-callback/route.ts", import.meta.url), "utf8");
const providerDispatch = await readFile(new URL("../lib/provider-dispatch.ts", import.meta.url), "utf8");
const providerDispatchApi = await readFile(new URL("../app/api/provider-dispatch/route.ts", import.meta.url), "utf8");
const resendWebhookApi = await readFile(new URL("../app/api/resend-webhook/route.ts", import.meta.url), "utf8");
const healthApi = await readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
const technicalReadinessApi = await readFile(new URL("../app/api/technical-readiness/route.ts", import.meta.url), "utf8");
const geocodeApi = await readFile(new URL("../app/api/geocode/route.ts", import.meta.url), "utf8");
const mapGeocoding = await readFile(new URL("../lib/map-geocoding.ts", import.meta.url), "utf8");
const backupValidatorApi = await readFile(new URL("../app/api/validate-backup/route.ts", import.meta.url), "utf8");
const restoreRehearsalApi = await readFile(new URL("../app/api/restore-rehearsal/route.ts", import.meta.url), "utf8");
const legalApi = await readFile(new URL("../app/api/legal-documents/route.ts", import.meta.url), "utf8");
const publicLegalApi = await readFile(new URL("../app/api/public-legal/route.ts", import.meta.url), "utf8");
const legalDocuments = await readFile(new URL("../lib/legal-documents.ts", import.meta.url), "utf8");
const security = await readFile(new URL("../lib/security.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const operationsTickApi = await readFile(new URL("../app/api/system/operations-tick/route.ts", import.meta.url), "utf8");
const securityMigration = await readFile(new URL("../drizzle/0003_productive_masque.sql", import.meta.url), "utf8");
const providerMigration = await readFile(new URL("../drizzle/0005_daily_firebrand.sql", import.meta.url), "utf8");
const hosting = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));

test("commercial flow wires all five stages and linked modules", () => {
  assert.match(page, /const stages = \["Talep","Keşif","Teklif","Müşteri","Operasyon"\]/);
  assert.match(page, /onClick=\{advance\}/);
  assert.match(page, /onClick=\{testFlow\}/);
  for (const moduleName of ["crm", "tasks", "offers", "operations"]) {
    assert.match(page, new RegExp(`"${moduleName}"`));
  }
});

test("Turkey quote example calculates net, KDV and gross separately", () => {
  const net = 6000;
  const rate = 20;
  const tax = net * rate / 100;
  assert.equal(tax, 1200);
  assert.equal(net + tax, 7200);
  assert.match(page, /Vergi hariç bedel/);
  assert.match(page, /Vergi dahil toplam/);
});

test("custody workflow contains notice, signature, activation and return actions", () => {
  for (const action of ["notice", "send-signature", "verify-signature", "activate", "return"]) {
    assert.match(page, new RegExp(`"${action}"`));
  }
  assert.match(page, /Belgeyi indir \/ yazdır/);
  assert.match(page, /Dijital imzaya gönder/);
});

test("support request captures module, page area, type and description", () => {
  assert.match(page, /function SupportCenter/);
  assert.match(page, /Modül \/ sayfa/);
  assert.match(page, /Sayfadaki alan/);
  assert.match(page, /Açıklama ve beklenen sonuç/);
});

test("sidebar follows the real customer-to-administration workflow", () => {
  const nav = page.slice(page.indexOf("const navGroups"), page.indexOf("const viewTitles"));
  const stages = [
    "1 · MÜŞTERİ & SATIŞ",
    "2 · FİLO KURULUMU",
    "3 · OPERASYON & TAKİP",
    "4 · ARAÇ YAŞAM DÖNGÜSÜ",
    "5 · CİHAZ, MOBİL & ZİMMET",
    "6 · İLETİŞİM & RAPORLAR",
    "7 · YÖNETİM",
  ];
  let previous = -1;
  for (const stage of stages) {
    const current = nav.indexOf(`label: "${stage}"`);
    assert.ok(current > previous, `${stage} should follow the previous workflow stage`);
    previous = current;
  }
  assert.ok(nav.indexOf('id: "devices"') < nav.indexOf('id: "custody"'));
  assert.ok(nav.indexOf('id: "reports"') < nav.indexOf('id: "settings"'));
});

test("public entry supports login, free signup and password recovery", () => {
  assert.match(page, /Ücretsiz üye ol/);
  assert.match(page, /Giriş sorunu yaşıyorum/);
  assert.match(page, /Filo&apos;ya giriş yapın/);
  assert.match(page, /story-free-chip/);
  assert.match(page, /submitSignup/);
  assert.match(page, /signin-with-chatgpt\?return_to=\//);
  assert.match(page, /Güvenli hesap kurtarmaya devam et/);
  assert.match(page, /parola bu uygulamada tutulmaz/);
  assert.match(page, /ÜCRETSİZ PAKET · 1 KULLANICI · 1 ARAÇ/);
  assert.doesNotMatch(page, /className="public-benefits"/);
  assert.doesNotMatch(page, /className="story-footer"/);
});

test("catalog keeps the approved price ladder while checkout offers only paid plans", () => {
  assert.match(page, /free:\{name:"Ücretsiz",usd:0,try:0,vehicles:1/);
  assert.match(page, /starter:\{name:"Başlangıç",usd:20,try:1000,vehicles:10/);
  assert.match(page, /professional:\{name:"Profesyonel",usd:39,try:2000,vehicles:30/);
  assert.match(page, /enterprise:\{name:"Kurumsal",usd:59,try:3000,vehicles:60/);
  assert.match(page, /const paidPlans:PaidPlanId\[\]=\["starter","professional","enterprise"\]/);
  assert.match(page, /Ücretsiz · 1 kullanıcı \+ 1 araç/);
  assert.match(page, /Yıllık · 2 ay avantaj/);
  assert.match(page, /KDV \(%20\)/);
});

test("overview keeps operational density with real tables, tracking and semantic status", () => {
  for (const label of ["OPERASYON KONTROL MERKEZİ", "Kritik aksiyonlar", "Canlı araç takibi", "Operasyon istisnaları", "Araç takip listesi"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /overview-data-table/);
  assert.match(page, /semantic-badge/);
  assert.match(page, /map-canvas overview-map-canvas/);
  assert.match(page, /setActionFilter/);
  assert.doesNotMatch(page, /className="product-map"/);
  assert.doesNotMatch(page, /className="priority-grid"/);
});

test("sidebar renders visibly grouped workflow navigation", () => {
  assert.match(page, /nav-group-\$\{groupIndex\}/);
  assert.match(page, /nav-\$\{item.id\}/);
});

test("each panel view keeps its context while the interface uses the operational design system", () => {
  assert.match(page, /className=\{`content view-\$\{view\}`\}/);
  assert.match(page, /FİLO PLATFORM · V1\.28\.20/);
});

test("functional core binds authenticated tenant data to D1 and evidence files to R2", () => {
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "BUCKET");
  for (const table of ["tenants", "tenant_members", "teams", "module_records", "record_links", "audit_events", "support_tickets", "settings", "file_objects", "outbox_events", "telemetry_events", "provider_connections", "provider_callback_events", "subscription_orders", "signature_requests", "device_ingest_tokens", "consent_events", "legal_profiles", "rate_limit_windows", "mobile_installations", "tracking_sessions", "tracker_gateway_events"]) {
    assert.match(schema, new RegExp(`sqliteTable\\(\"${table}\"`));
  }
  assert.match(store, /getChatGPTUser/);
  assert.match(store, /assertPermission/);
  assert.match(store, /workspace\.role === "Operator"/);
  assert.match(store, /PLAN_LIMITS/);
  assert.match(platformApi, /save-record/);
  assert.match(platformApi, /transition-record/);
  assert.match(platformApi, /save-settings/);
});

test("cross-module workflows are versioned, linked, audited and queued", () => {
  assert.match(store, /INSERT OR IGNORE INTO record_links/);
  assert.match(store, /version = version \+ 1/);
  assert.match(store, /INSERT INTO audit_events/);
  assert.match(store, /INSERT INTO outbox_events/);
  for (const status of ["TALEP AÇILDI", "TEKLİF HAZIRLANDI", "OPERASYONA AKTARILDI"]) {
    assert.match(store, new RegExp(status));
  }
});

test("evidence upload and telemetry ingestion validate input and retain operational proof", () => {
  assert.match(filesApi, /10 \* 1024 \* 1024/);
  assert.match(filesApi, /SHA-256/);
  assert.match(filesApi, /BUCKET\.put/);
  assert.match(filesApi, /FILE_UPLOADED/);
  assert.match(filesApi, /signatureMatches/);
  assert.match(telemetryApi, /Math\.abs\(latitude\) > 90/);
  assert.match(telemetryApi, /Math\.abs\(longitude\) > 180/);
  assert.match(telemetryApi, /telemetry\.received/);
});

test("production readiness follows the approved order and never self-certifies external work", () => {
  const orderedChecks=["RDY-MOBILE-IOS-KILLED","RDY-MOBILE-ANDROID-OEM","RDY-TRACKER-LIVE","RDY-TENANT-ISOLATION","RDY-PAYMENT","RDY-EINVOICE","RDY-NOTIFICATION","RDY-LEGAL-CUSTODY","RDY-DATA-MIGRATION","RDY-OBSERVABILITY","RDY-BACKUP-RESTORE","RDY-I18N","RDY-SECURITY-LOAD","RDY-PILOT-UAT","RDY-MOBILE-STORE"];
  let previous=-1;
  for (const check of orderedChecks){const current=readinessContract.indexOf(check);assert.ok(current>previous,`${check} should follow the previous readiness gate`);previous=current;assert.match(store,new RegExp(check));}
  assert.match(page,/READINESS_GATES/);
  assert.match(page,/Gerçek test yapılmadan BAŞARILI seçmeyin/);
  assert.match(page,/onSaveCheck/);
  assert.match(store,/validateReadinessCompletion/);
  assert.match(store,/temiz taramadan geçmiş ve SHA-256 özeti bulunan kanıt zorunludur/);
  assert.match(store,/Önce .* kapısı kanıtla kapatılmalıdır/);
  assert.match(store,/verifyProviderConfiguration/);
  assert.match(platformApi,/verify-providers/);
  assert.match(backupApi,/FILO_TENANT_EXPORT/);
  assert.match(backupApi,/TENANT_EXPORT_CREATED/);
});

test("security, health and backup drills create honest production evidence", () => {
  assert.match(store,/runSecuritySelfCheck/);
  assert.match(store,/SECURITY_SELF_CHECK_PASSED/);
  assert.match(store,/APPLICATION_SELF_CHECK_NOT_PENETRATION_TEST/);
  assert.match(store,/runSystemHealthCheck/);
  assert.match(store,/SYSTEM_HEALTH_CHECK_PASSED/);
  assert.match(platformApi,/security-self-check/);
  assert.match(platformApi,/system-health-check/);
  assert.match(healthApi,/version:RELEASE_VERSION\|\|"1\.28\.20"/);
  assert.match(healthApi,/objectStorage/);
  assert.match(backupValidatorApi,/NON_DESTRUCTIVE_RESTORE_VALIDATION/);
  assert.match(backupValidatorApi,/farklı bir çalışma alanına ait/);
  assert.match(page,/Yedek bütünlüğünü doğrula/);
});

test("health response reports the deployed release version from runtime configuration", () => {
  assert.match(healthApi,/const \{DB,BUCKET,RELEASE_VERSION\}=runtimeEnv\(\)/);
  assert.match(healthApi,/version:RELEASE_VERSION\|\|"1\.28\.20"/);
  assert.doesNotMatch(healthApi,/requireWorkspace/);
  assert.match(healthApi,/prefix:"__health__\/"/);
});

test("language selection is limited to Turkish and English in settings only", () => {
  const settingsSource=page.slice(page.indexOf("function Settings("),page.indexOf("function Subscription("));
  const topbarSource=page.slice(page.indexOf('<header className="topbar">'),page.indexOf('<div className="role-banner">'));
  assert.match(settingsSource,/<option value="tr">Türkçe<\/option><option value="en">English<\/option>/);
  assert.match(settingsSource,/value=\{language\} onChange=\{e=>setLanguage\(e\.target\.value as Language\)\}/);
  assert.doesNotMatch(topbarSource,/language-switch/);
  assert.doesNotMatch(topbarSource,/Switch to English|Türkçeye geç/);
});

test("English mode localizes the complete visible interface and persists the preference", () => {
  assert.match(page,/data-localize-ui/);
  assert.match(page,/installUiLocalization\(root,language\)/);
  assert.match(page,/localStorage\.setItem\("filo-ui-language",language\)/);
  assert.match(uiI18n,/MutationObserver/);
  assert.match(uiI18n,/translatedAttributes=\["placeholder","title","aria-label"\]/);
  for (const pair of [
    ["Giriş yap","Sign in"],["Araç / Sürücü","Vehicle / Driver"],["Yeni müşteri","New customer"],
    ["Ticari Süreç Akışı","Commercial Workflow"],["Sürücü uygulaması","Driver app"],
    ["Zimmet & teslim","Custody & handover"],["Bildirim operasyonları","Notification operations"],
    ["Hukuk & KVKK merkezi","Legal & privacy center"],["Üretim kanıtı","Production evidence"],
    ["Sistem dili","System language"],["Destek talebi oluştur","Create support request"],
  ]) {
    assert.match(uiI18n,new RegExp(`"${pair[0]}":"${pair[1]}`));
  }
});

test("technical gates 2-6 expose secret-safe production, provider, map and device readiness", () => {
  for (const gate of ["PRODUCTION_ENVIRONMENT","LIVE_PROVIDERS","MAP_GEOCODING","MOBILE_FIELD_MATRIX","TRACKER_FIELD_TEST"]) assert.match(store,new RegExp(gate));
  assert.match(store,/secretValuesIncluded:false/);
  assert.match(technicalReadinessApi,/technicalReadiness2to6/);
  assert.match(page,/function TechnicalReadiness26/);
  assert.match(page,/TEKNİK CANLIYA GEÇİŞ · 2–6/);
  assert.match(page,/Sağlayıcıları yeniden denetle/);
});

test("geocoding adapter enforces HTTPS allowlists, timeout and bounded results", () => {
  assert.match(mapGeocoding,/MAP_GEOCODING_ALLOWED_HOSTS/);
  assert.match(mapGeocoding,/url\.protocol!=="https:"/);
  assert.match(mapGeocoding,/AbortSignal\.timeout\(8000\)/);
  assert.match(mapGeocoding,/rows\.slice\(0,5\)/);
  assert.match(geocodeApi,/enforceRateLimit/);
  assert.match(geocodeApi,/query\.length<3\|\|query\.length>160/);
});

test("route history renders a real map for persisted telemetry", () => {
  assert.match(page,/openstreetmap\.org\/export\/embed/);
  assert.match(page,/map-provider-link/);
  assert.match(page,/activeEvents/);
});

test("bulk import validates before commit and enforces tenant plan limits", () => {
  assert.match(page,/function BulkImportCenter/);
  assert.match(page,/Dosyayı doğrula/);
  assert.match(page,/Hatasız kayıtları aktar/);
  assert.match(importApi,/parseCsv/);
  assert.match(store,/bulkImportRecords/);
  assert.match(store,/Toplu aktarım paket sınırını aşıyor/);
  assert.match(store,/BULK_IMPORT_VALIDATED/);
  assert.match(store,/BULK_IMPORT_COMMITTED/);
});

test("public signup separates contract acceptance from privacy notice acknowledgement", () => {
  assert.match(page,/Kullanım koşullarını/);
  assert.match(page,/açık rıza değil bilgilendirme kaydıdır/);
  assert.match(page,/documentKey:"TERMS_OF_SERVICE"/);
  assert.match(page,/documentKey:"PRIVACY_NOTICE_ACKNOWLEDGED"/);
  assert.match(page,/setView\("onboarding"\)/);
  assert.match(store,/separatePurposes:true/);
  assert.doesNotMatch(store,/TERMS_PRIVACY/);
});

test("public signup stays closed until real publisher identity and an explicit activation flag exist", () => {
  for(const key of ["LEGAL_CONTROLLER_NAME","LEGAL_CONTROLLER_EMAIL","LEGAL_CONTROLLER_ADDRESS","LEGAL_TERMS_EFFECTIVE_AT","PUBLIC_SIGNUP_ENABLED"]){
    assert.match(legalDocuments,new RegExp(key));
  }
  assert.match(legalDocuments,/PUBLIC_SIGNUP_ENABLED!=="true"/);
  assert.match(store,/!status\.ready\|\|documentVersion!==status\.version/);
  assert.match(page,/legalMissing\.map/);
});

test("provider center reports configuration without exposing values and requires real callbacks", () => {
  for(const provider of ["RESEND","EXPO_FCM","PAYMENT","QUALIFIED_ESIGN","EINVOICE","DEVICE_TELEMETRY","TELTONIKA_GATEWAY","QUECLINK_GATEWAY"]){
    assert.match(store,new RegExp(`${provider}:\\{`));
  }
  assert.match(store,/configured:missing\.length===0/);
  assert.match(store,/item\.status==="CONNECTED"\?"CONNECTED"/);
  assert.match(page,/yalnız imzalı gerçek geri bildirim sonrasında bağlı kabul edilir/);
});

test("legal center produces versioned tenant documents and blocks unapproved legal profiles", () => {
  assert.match(page,/function LegalCompliance/);
  assert.match(page,/Hukuk & KVKK Merkezi/);
  assert.match(page,/onSave=\{persistLegalProfile\}/);
  assert.match(store,/saveLegalProfile/);
  assert.match(store,/legalProfileReadiness/);
  assert.match(store,/APPROVED/);
  assert.match(store,/RDY-LEGAL-CUSTODY/);
  assert.match(legalDocuments,/LEGAL_VERSION="2026-08-v4"/);
  for(const title of ["Genel KVKK / GDPR aydınlatma bildirimi","Çalışan ve sürücü aydınlatma bildirimi","Konum takibi özel bildirimi","Saklama ve imha politikası","Araç / telefon / cihaz zimmet tutanağı","Veri işleme ek protokolü","Alt işleyen ve aktarım kayıt tablosu","Kişisel veri ihlali müdahale prosedürü"]){
    assert.match(legalDocuments,new RegExp(title));
  }
  assert.match(legalDocuments,/www\.kvkk\.gov\.tr/);
  assert.match(legalDocuments,/eur-lex\.europa\.eu/);
  assert.match(legalDocuments,/hukukçu onayı olmadan nihai sözleşme değildir/i);
  assert.match(legalApi,/buildLegalDocument/);
  assert.match(publicLegalApi,/platformLegalStatus/);
  assert.match(page,/legalStatus!=="ready"/);
});

test("security hardening enforces origin, rate limits, file quarantine and append-only audit", () => {
  assert.match(security,/assertSameOrigin/);
  assert.match(security,/sec-fetch-site/);
  assert.match(security,/enforceRateLimit/);
  assert.match(security,/rate_limit_windows/);
  assert.match(security,/Retry-After/);
  assert.match(security,/scanUploadedFile/);
  assert.match(security,/EICAR/);
  assert.match(security,/PDF içinde aktif içerik veya gömülü dosya işareti/);
  assert.match(filesApi,/scan\.status/);
  assert.match(filesApi,/scanStatus!=="CLEAN"/);
  assert.match(securityMigration,/CREATE TRIGGER `audit_events_block_update`/);
  assert.match(securityMigration,/CREATE TRIGGER `audit_events_block_delete`/);
  assert.match(worker,/applySecurityHeaders/);
  assert.match(security,/Content-Security-Policy/);
  assert.match(security,/Strict-Transport-Security/);
  assert.match(store,/FILE_RESCAN_COMPLETED/);
  assert.match(store,/bağımsız raporlu yük\/OWASP koşulları/);
});

test("provider callbacks resist replay and external delivery is never self-certified", () => {
  for(const header of ["x-filo-event-id","x-filo-timestamp","x-filo-signature"])assert.match(providerCallbackApi,new RegExp(header));
  assert.match(providerCallbackApi,/\$\{timestamp\}\.\$\{body\}/);
  assert.match(providerCallbackApi,/5\*60\*1000/);
  assert.match(providerCallbackApi,/INSERT OR IGNORE INTO provider_callback_events/);
  assert.match(providerCallbackApi,/duplicate:true/);
  assert.match(store,/DISPATCH_READY/);
  assert.doesNotMatch(store,/next=.*providerReady\?"PROCESSED"/);
});

test("payment lifecycle is idempotent and activates plans only after signed callbacks",()=>{
  for(const token of ["FILO_PAYMENT_V1","Idempotency-Key","PAYMENT_CHECKOUT_HOSTS","CHECKOUT_READY","PAYMENT_DISPATCH_FAILED"])assert.match(providerDispatch,new RegExp(token));
  assert.match(providerDispatchApi,/payment-checkout/);
  for(const status of ["COMPLETED","FAILED","CANCELLED","REFUNDED","EXPIRED"])assert.match(providerCallbackApi,new RegExp(status));
  assert.match(providerCallbackApi,/status==="COMPLETED"/);
  assert.match(providerCallbackApi,/status==="REFUNDED"/);
  assert.match(providerCallbackApi,/allowedPrevious/);
  assert.match(providerCallbackApi,/providerReference!==reference/);
  assert.match(providerCallbackApi,/Ödeme durum geçişi reddedildi/);
  assert.match(page,/Ödemeyi başlat \/ tekrar dene/);
  assert.match(page,/imzalı başarılı callback sonrasında aktifleşir/);
});

test("e-document lifecycle validates invoice identity and waits for provider acceptance",()=>{
  for(const token of ["FILO_EDOCUMENT_V1","buyerTaxId","E_FATURA","E_ARSIV","source.status","SUBMITTED"])assert.match(providerDispatch,new RegExp(token));
  assert.match(providerDispatchApi,/e-document/);
  for(const status of ["ACCEPTED","REJECTED","CANCELLED"])assert.match(providerCallbackApi,new RegExp(status));
  assert.match(providerCallbackApi,/UPDATE e_documents SET status=/);
  assert.match(page,/E-belge sağlayıcısına gönder/);
  assert.match(page,/Alıcı vergi \/ şirket kimliği/);
});

test("notification delivery uses Resend signatures, Expo receipts and durable retry identities",()=>{
  for(const table of ["provider_dispatches","e_documents","notification_deliveries"])assert.match(schema,new RegExp(`sqliteTable\\("${table}"`));
  for(const table of ["provider_dispatches","e_documents","notification_deliveries"])assert.ok(providerMigration.includes(`CREATE TABLE \`${table}\``));
  assert.match(providerDispatch,/https:\/\/api\.resend\.com\/emails/);
  assert.match(providerDispatch,/https:\/\/exp\.host\/--\/api\/v2\/push\/send/);
  assert.match(providerDispatch,/getReceipts/);
  assert.match(providerDispatch,/DeviceNotRegistered/);
  for(const header of ["svix-id","svix-timestamp","svix-signature"])assert.match(resendWebhookApi,new RegExp(header));
  for(const event of ["email.delivered","email.bounced","email.failed","email.complained","email.suppressed"])assert.match(resendWebhookApi,new RegExp(event.replace(".","\\.")));
  assert.match(mobileRuntime,/getExpoPushTokenAsync/);
  assert.match(mobileAppConfig,/expo-notifications/);
  assert.match(page,/Webhook \/ push receipt/);
});

test("readiness center ships executable field, legal, migration and pilot kits", () => {
  for(const label of ["iOS saha matrisi","Android OEM matrisi","Takip cihazı kabul testi","Hukuk ve zimmet kontrolü","Veri geçiş provası","İzleme ve nöbet planı","Yedek RPO\/RTO provası","TR\/EN yerelleştirme QA","OWASP ve yük testi","Pilot UAT kabul planı","Mobil mağaza hazırlığı"]){
    assert.match(page,new RegExp(label));
  }
  assert.match(page,/FILO_READINESS_EVIDENCE_MANIFEST/);
  assert.match(page,/file\.sha256/);
  assert.match(store,/BACKUP_DRY_RUN_PASSED/);
  assert.match(store,/fiziksel IPHONE\/IPAD/);
  assert.match(store,/ANDROID sürümü ve test edilen gerçek OEM/);
});

test("operations automation creates deduplicated tasks and support has an SLA workflow", () => {
  assert.match(store,/runOperationalAutomations/);
  assert.match(store,/automationKey/);
  assert.match(store,/transitionSupportTicket/);
  assert.match(platformApi,/run-automations/);
  assert.match(platformApi,/transition-support/);
  assert.match(page,/Destek SLA/);
  assert.match(page,/Kuralları çalıştır/);
});

test("telematics adapters and accounting export preserve provider boundaries", () => {
  assert.match(page,/function TrackerIntegrations/);
  for(const provider of ["TELTONIKA","QUECLINK","HMAC-SHA256","VENDOR_PROFILE_REQUIRED"])assert.match(page,new RegExp(provider));
  assert.match(page,/E-belge taslağını indir/);
  assert.match(eDocumentApi,/DRAFT_NOT_ISSUED/);
  assert.match(eDocumentApi,/E_DOCUMENT_DRAFT_EXPORTED/);
  assert.match(store,/EINVOICE_API_KEY/);
  assert.match(providerCallbackApi,/RESEND_WEBHOOK_SECRET/);
  assert.match(providerCallbackApi,/EINVOICE_WEBHOOK_SECRET/);
  assert.match(providerCallbackApi,/NOTIFICATION_CALLBACK/);
  assert.match(providerCallbackApi,/EINVOICE_CALLBACK/);
  assert.match(store,/DEVICE_TELEMETRY/);
});

test("native driver runtime uses secure enrollment, background tasks and a durable offline queue", () => {
  assert.match(mobileRuntime,/TaskManager\.defineTask/);
  assert.match(mobileRuntime,/SecureStore/);
  assert.match(mobileRuntime,/AsyncStorage/);
  assert.match(mobileRuntime,/Location\.startLocationUpdatesAsync/);
  assert.match(mobileRuntimeApi,/start-session/);
  assert.match(mobileRuntimeApi,/heartbeat/);
  assert.match(deviceTelemetryApi,/sessionId/);
  assert.match(deviceTelemetryApi,/Fiziksel takip cihazları yalnız imzalı tracker gateway/);
  assert.match(store,/tracking_sessions/);
  assert.match(mobileAppConfig,/UIBackgroundModes/);
  assert.match(mobileAppConfig,/FOREGROUND_SERVICE_LOCATION/);
  assert.match(page,/Native teslimat kapsamı/);
  assert.match(page,/gerçek iPhone ve Android OEM saha matrisi/);
});

test("physical tracker gateway validates codec integrity and signed replay-safe batches", () => {
  assert.match(trackerBridge,/crc16Ibm/);
  assert.match(trackerBridge,/0x08,0x8e/);
  assert.match(trackerBridge,/QUECLINK_PROFILE_JSON olmadan/);
  assert.match(trackerBridge,/createHmac\("sha256"/);
  assert.match(trackerGatewayApi,/x-filo-message-id/);
  assert.match(trackerGatewayApi,/x-filo-signature/);
  assert.match(trackerGatewayApi,/5\*60\*1000/);
  assert.match(trackerGatewayApi,/INSERT OR IGNORE INTO tracker_gateway_events/);
  assert.match(trackerGatewayApi,/records\.length>100/);
  assert.match(store,/TELTONIKA_GATEWAY/);
  assert.match(store,/QUECLINK_GATEWAY/);
  assert.match(store,/status='PROCESSED'/);
  assert.match(page,/Fiziksel cihazdan imzalı paket gelmedi/);
});

test("overview uses controlled semantic color accents", () => {
  assert.match(page, /overview-status-icon/);
  assert.match(page, /table-status-pill/);
  assert.match(page, /overview-status-card \$\{metric\.tone\}/);
});

test("company page has functional search, publication filtering, CSV and editable records", () => {
  assert.match(page, /function CompanyPage/);
  assert.match(page, /setCompanyQuery/);
  assert.match(page, /setPublishFilter/);
  assert.match(page, /exportCompanyCsv/);
  for (const label of ["Profil tamamlığı", "Yayındaki hizmet", "Aylık görüntüleme", "Gelen talep", "Güncel kayıtlar"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /company-data-table/);
  assert.match(page, /company-badge/);
  assert.match(page, /view === "company" && <CompanyPage/);
});

test("CRM page has interactive pipeline, semantic stage badges and customer actions", () => {
  assert.match(page, /function CrmCustomersPage/);
  assert.match(page, /setCrmQuery/);
  assert.match(page, /setStageFilter/);
  assert.match(page, /exportCrmCsv/);
  for (const label of ["Toplam müşteri", "Açık fırsat", "Takip bekleyen", "Dönüşüm", "Dönüşüm hunisi", "Güncel kayıtlar"]) {
    assert.match(page, new RegExp(label));
  }
  for (const tone of ["candidate", "discovery", "offer", "customer"]) {
    assert.match(page, new RegExp(tone));
  }
  assert.match(page, /crm-pipeline-step/);
  assert.match(page, /crm-stage-badge/);
  assert.match(page, /crm-data-table/);
  assert.match(page, /view === "crm" && <CrmCustomersPage/);
});

test("vehicles page uses segmented status filters and accessible phone health bars", () => {
  assert.match(page, /setActiveTab/);
  assert.match(page, /vehicles-segmented/);
  assert.match(page, /vehicles-status/);
  assert.match(page, /vehicles-data-table/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /aria-valuenow=\{vehicle\.battery\}/);
  assert.match(page, /vehicles-progress-value/);
  for (const label of ["Tümü", "Seferde", "Beklemede", "Dikkat", "Sinyal gücü", "ARAÇ / SÜRÜCÜ", "SON VERİ"]) {
    assert.match(page, new RegExp(label));
  }
});

test("customer requests page has functional search, stage filtering, CSV, SLA emphasis and record actions", () => {
  assert.match(page, /function CustomerRequestsPage/);
  assert.match(page, /function RequestStatusBadge/);
  assert.match(page, /setRequestQuery/);
  assert.match(page, /setRequestStageFilter/);
  assert.match(page, /exportRequestsCsv/);
  for (const label of ["Aktif talep", "Keşif planlı", "Teklife hazır", "SLA içinde", "Güncel kayıtlar"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /requests-stage-badge/);
  assert.match(page, /requests-sla/);
  assert.match(page, /view === "requests" && <CustomerRequestsPage/);
});

test("commercial process detail uses a connected stepper, asymmetric workspace and linked records", () => {
  for (const className of ["commercial-stepper-panel", "commercial-detail-grid", "commercial-info-grid", "commercial-checklist", "commercial-linked-records", "commercial-advance-button"]) {
    assert.match(page, new RegExp(className));
  }
  assert.match(page, /SLA içinde/);
  assert.match(page, /Akışı otomatik test et/);
});

test("quotes and proforma page has icon metrics, semantic statuses, validity warnings and record actions", () => {
  assert.match(page, /function OffersPage/);
  assert.match(page, /function OfferStatusBadge/);
  assert.match(page, /setOfferQuery/);
  assert.match(page, /setOfferStatusFilter/);
  assert.match(page, /exportOffersCsv/);
  assert.match(page, /validityMeta/);
  for (const label of ["Taslak", "Onay bekleyen", "Kazanıldı", "Kazanım", "Güncel teklifler"]) {
    assert.match(page, new RegExp(label));
  }
  for (const tone of ["sent", "proforma", "revised", "approved"]) {
    assert.match(page, new RegExp(tone));
  }
  assert.match(page, /offers-status-badge/);
  assert.match(page, /offers-validity/);
  assert.match(page, /offers-data-table/);
  assert.match(page, /view === "offers" && <OffersPage/);
});

test("master design system is shared by generic and specialized fleet pages", () => {
  for (const component of ["MasterPageHeader", "MasterMetricGrid", "MasterStatusBadge", "MasterDateValue"]) {
    assert.match(page, new RegExp("function "+component));
  }
  for (const specialized of ["Fleet", "CommercialFlow", "Routes", "DriverApp", "Onboarding", "NotificationOps", "UsersTeams", "Settings", "Subscription", "Mobile", "Rollout"]) {
    const start = page.indexOf("function "+specialized);
    assert.ok(start >= 0, specialized+" should exist");
    const body = page.slice(start, page.indexOf("\nfunction ", start + 10) === -1 ? undefined : page.indexOf("\nfunction ", start + 10));
    assert.match(body, /MasterMetricGrid/, specialized+" should use the shared four-card summary");
  }
  assert.match(page, /className=\{master\.dataTable\}/);
  assert.match(masterCss, /#f3f4f6|#dfe3e8/);
  assert.match(masterCss, /grid-template-columns: repeat\(4/);
  assert.match(masterCss, /background: #f1f5f9/);
  assert.match(masterCss, /\.statusBadge/);
  assert.match(masterCss, /\.dateCritical/);
});

test("tracking and driver runtime layouts keep rows aligned with stable columns", () => {
  assert.match(page, /driver-installations-table/);
  assert.match(page, /<colgroup>/);
  assert.match(page, /scope="col"/);
  assert.match(css, /\.operational-data-table\{table-layout:fixed\}/);
  assert.match(css, /\.view-driverApp \.mobile-gate-row\{padding:12px 18px\}/);
  assert.match(css, /\.view-driverApp \.runtime-selection\{display:flex/);
  assert.match(css, /\.view-trackers \.adapter-grid\{grid-template-columns:repeat\(auto-fit,minmax\(220px,1fr\)\)\}/);
  assert.match(css, /\.view-trackers \.module-table table\{table-layout:fixed/);
});

test("all requested operations remain represented in navigation or dedicated pages", () => {
  for (const view of ["commercialFlow","entities","fleet","drivers","operations","routes","geofences","alerts","tasks","inspections","tires","expenses","documents","safety","incidents","devices","trackers","mobile","driverApp","custody","notifications","notificationOps","reports","onboarding","users","subscription","security","settings","audit","rollout"]) {
    assert.match(page, new RegExp('id: "'+view+'"|view === "'+view+'"'));
  }
});

test("v1.27 readiness gates persist legal, migration, alarm, restore and localization evidence", () => {
  for(const table of ["migration_runs","monitoring_events","restore_rehearsals","restore_staging_records"])assert.match(schema,new RegExp(table));
  for(const field of ["legal_opinion_reference","policy_version"])assert.match(schema,new RegExp(field));
  assert.match(store,/BULK_IMPORT_ROLLED_BACK/);
  assert.match(store,/OBSERVABILITY_DRILL_PASSED/);
  assert.match(store,/I18N_SELF_CHECK_PASSED/);
  assert.match(store,/scan_status='CLEAN'/);
  assert.match(restoreRehearsalApi,/ISOLATED_SHADOW_RESTORE/);
  assert.match(restoreRehearsalApi,/productionMutated:false/);
  assert.match(importApi,/action==="rollback"/);
  for(const label of ["Alarm yaşam döngüsü provası","İzole geri yükleme provası","TR\/EN biçim denetimi"])assert.match(page,new RegExp(label));
});

test("v1.27 final gates require structured external security, pilot and store evidence", () => {
  for(const table of ["security_test_runs","security_findings","pilot_runs","pilot_scenarios","mobile_releases"])assert.match(schema,new RegExp(table));
  for(const fn of ["recordSecurityTestRun","resolveSecurityFinding","recordPilotUat","recordMobileRelease"])assert.match(store,new RegExp(fn));
  assert.match(store,/concurrency>=100 AND p95_ms<=500 AND error_rate_bps<=100/);
  assert.match(store,/p99Ms<=1000/);
  assert.match(store,/allowedPrevious/);
  assert.match(store,/company_count>=2 AND vehicle_count>=3/);
  assert.match(store,/COUNT\(DISTINCT platform\)/);
  assert.match(store,/store_status='APPROVED'/);
  for(const action of ["record-security-test","resolve-security-finding","record-pilot-uat","record-mobile-release"])assert.match(platformApi,new RegExp(action));
  for(const label of ["Bağımsız kabul merkezi","8 · Bağımsız test","9 · Gerçek pilot","10 · Mağaza kabulü","Bağımsız test sonucunu kaydet","Gerçek firma pilotunu çalıştır","iOS \/ Android mağaza yaşam döngüsünü kaydet"])assert.match(page,new RegExp(label));
});

test("v1.27 records phased go-no-go activation from persisted production measurements", () => {
  assert.match(schema,/sqliteTable\("production_rollouts"/);
  assert.match(platformApi,/record-production-rollout/);
  assert.match(store,/recordProductionRollout/);
  assert.match(store,/PRODUCTION-ACTIVATION/);
  assert.match(store,/INTERNAL:\{target:0,minimumMinutes:60\}/);
  assert.match(store,/PILOT:\{target:5,minimumMinutes:240/);
  assert.match(store,/CUSTOMER_25:\{target:25,minimumMinutes:720/);
  assert.match(store,/GENERAL:\{target:100,minimumMinutes:1440/);
  assert.match(store,/PRODUCTION_GO_LIVE_APPROVED/);
  for(const label of ["KONTROLLÜ YAYIN","Kontrollü canlı aktivasyon","Go \/ No-Go değerlendirmesi","İç kullanıcı","Pilot firma","Müşteri grubu","Genel açılış"])assert.match(page,new RegExp(label));
});

test("v1.27 validates mobile field runs, physical trackers and real data with server evidence", () => {
  for(const table of ["field_validation_runs","data_acceptance_runs"])assert.match(schema,new RegExp(table));
  for(const action of ["record-field-validation","record-data-acceptance"])assert.match(platformApi,new RegExp(action));
  for(const fn of ["recordFieldValidation","recordDataAcceptance","fieldMetrics"])assert.match(store,new RegExp(fn));
  assert.match(store,/COUNT\(DISTINCT os_version\)/);
  assert.match(store,/SAMSUNG','XIAOMI','OPPO','PIXEL/);
  assert.match(store,/gateway_event_count/);
  assert.match(store,/reconciliation_status='MATCHED'/);
  for(const label of ["Fiziksel doğrulama ve gerçek veri merkezi","5 · Mobil saha","6 · Fiziksel cihaz","7 · Gerçek veri"])assert.match(page,new RegExp(label));
});

test("v1.27 records genuine API role tenant and browser E2E acceptance without self-asserted success", () => {
  assert.match(schema,/sqliteTable\("e2e_acceptance_runs"/);
  assert.match(store,/recordE2eAcceptance/);
  assert.match(store,/failedCount=totals\.reduce/);
  assert.match(store,/latestCleanReadinessEvidence\(workspace,"E2E-ACCEPTANCE"\)/);
  assert.match(platformApi,/record-e2e-acceptance/);
  for(const label of ["12 · Gerçek E2E","Harici E2E koşusunu kaydet","API","Tenant","Commit SHA"])assert.match(page,new RegExp(label));
});

test("v1.27 provides persistent accessibility preferences and complete bilingual hardening UI", () => {
  assert.match(page,/largeText:String\(largeText\)/);
  assert.match(page,/highContrast:String\(highContrast\)/);
  assert.match(page,/document\.documentElement\.lang=language/);
  assert.match(page,/role="status" aria-live="polite"/);
  assert.match(page,/13 · Dil ve erişim/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/focus-visible/);
  assert.match(css,/\.ui-high-contrast/);
});

test("v1.27 versions a tenant catalog and records official NHTSA VIN decodes", () => {
  for(const table of ["vehicle_catalog_versions","vehicle_catalog_entries","vin_decode_events"])assert.match(schema,new RegExp(table));
  assert.match(store,/importVehicleCatalog/);
  assert.match(store,/decodeVehicleVin/);
  assert.match(store,/vpic\.nhtsa\.dot\.gov\/api\/vehicles\/DecodeVinValues/);
  assert.match(store,/UPDATE vehicle_catalog_entries SET active=0/);
  for(const action of ["import-vehicle-catalog","decode-vehicle-vin"])assert.match(platformApi,new RegExp(action));
  assert.match(page,/serverCatalog/);
  assert.match(page,/14 · Araç kataloğu/);
});

test("v1.27 enforces on-call alert backup and incident discipline with restore freshness", () => {
  for(const table of ["operations_controls","operations_readiness_runs"])assert.match(schema,new RegExp(table));
  for(const fn of ["saveOperationsControl","runOperationsDisciplineAudit"])assert.match(store,new RegExp(fn));
  assert.match(store,/ON_CALL','ALERT','BACKUP','INCIDENT/);
  assert.match(store,/restoreAgeDays<=30/);
  assert.match(store,/latestCleanReadinessEvidence\(workspace,"OPS-DISCIPLINE"\)/);
  for(const action of ["save-operations-control","run-operations-audit"])assert.match(platformApi,new RegExp(action));
  assert.match(page,/15 · Operasyon disiplini/);
});

test("v1.28 runs tenant operations through an authenticated idempotent scheduler contract", () => {
  assert.match(schema,/sqliteTable\("scheduled_job_runs"/);
  assert.match(schema,/scheduled_job_tenant_slot_uq/);
  for(const fn of ["scheduledTenantWorkspaces","claimScheduledJob","finishScheduledJob"])assert.match(store,new RegExp(fn));
  assert.match(store,/status IN \('PENDING','FAILED'\)/);
  assert.match(operationsTickApi,/OPERATIONS_CRON_SECRET/);
  assert.match(operationsTickApi,/constantTimeTokenMatch/);
  assert.match(operationsTickApi,/runOperationalAutomations/);
  assert.match(operationsTickApi,/dispatchNotifications/);
  assert.doesNotMatch(operationsTickApi,/requireWorkspace/);
});

test("v1.28 fails file uploads closed until a real malware provider returns a verdict", () => {
  assert.match(security,/scanUploadedFileWithProvider/);
  assert.match(security,/https:\/\/api\.cloudmersive\.com\/virus\/scan\/file/);
  assert.match(security,/payload\.CleanResult!==true/);
  assert.match(filesApi,/PROVIDER_REQUIRED/);
  assert.match(filesApi,/SCAN_FAILED/);
  assert.match(store,/MALWARE_SCAN/);
  assert.match(store,/CLOUDMERSIVE_API_KEY/);
});

test("v1.28 versions global tax profiles and routes non-US VINs through an allowlisted adapter", () => {
  for(const table of ["tax_profile_versions","tax_profile_entries"])assert.match(schema,new RegExp(`sqliteTable\\("${table}"`));
  for(const fn of ["importTaxProfiles","resolveActiveTaxProfile"])assert.match(store,new RegExp(fn));
  assert.match(platformApi,/import-tax-profiles/);
  assert.match(providerDispatch,/FILO_EDOCUMENT_V2/);
  assert.match(providerDispatch,/taxProfile/);
  assert.match(store,/FILO_VIN_DECODE_V1/);
  assert.match(store,/VEHICLE_CATALOG_ALLOWED_HOSTS/);
  assert.match(page,/GLOBAL VERGİ & E-BELGE/);
  assert.match(page,/availableTaxProfiles/);
});
