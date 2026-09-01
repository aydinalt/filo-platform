export type LegalProfile={
  controllerName:string;taxId:string;address:string;contactEmail:string;dpoContact:string;jurisdictions:string;
  employeeLegalBasis:string;locationPurposes:string;retentionDays:number;periodicDestructionMonths:number;subprocessors:string;
  status:string;approvedBy:string;approvedAt:string;legalOpinionReference:string;policyVersion:string;updatedAt?:string;
};

export const LEGAL_DOCUMENTS=[
  {key:"privacy-notice",title:"Genel KVKK / GDPR aydınlatma bildirimi",audience:"Müşteri, kullanıcı ve yetkililer"},
  {key:"employee-driver-notice",title:"Çalışan ve sürücü aydınlatma bildirimi",audience:"Çalışanlar ve sözleşmeli sürücüler"},
  {key:"location-tracking-notice",title:"Konum takibi özel bildirimi",audience:"Sürücü ve cihaz kullanıcısı"},
  {key:"retention-destruction-policy",title:"Saklama ve imha politikası",audience:"Veri sorumlusu ve operasyon ekipleri"},
  {key:"custody-handover-agreement",title:"Araç / telefon / cihaz zimmet tutanağı",audience:"Teslim eden ve teslim alan"},
  {key:"data-processing-addendum",title:"Veri işleme ek protokolü",audience:"Veri sorumlusu ve veri işleyen"},
  {key:"subprocessor-register",title:"Alt işleyen ve aktarım kayıt tablosu",audience:"Uyum, satın alma ve hukuk"},
  {key:"incident-response-procedure",title:"Kişisel veri ihlali müdahale prosedürü",audience:"Olay müdahale ekibi"},
] as const;

export type LegalDocumentKey=typeof LEGAL_DOCUMENTS[number]["key"];
export const LEGAL_VERSION="2026-08-v4";

const sources=`RESMİ DAYANAK VE KONTROL KAYNAKLARI
- KVKK aydınlatma ve çalışan verisi: https://www.kvkk.gov.tr/Icerik/6913/2020-404
- KVKK işleme şartları: https://www.kvkk.gov.tr/Icerik/4190/Kisisel-Verilerin-Islenme-Sartlari
- Saklama ve imha yönetmeliği: https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK
- Veri ihlali bildirimi: https://www.kvkk.gov.tr/Icerik/5362/Veri-Ihlali-Bildirimi
- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
- eIDAS: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02014R0910-20241018`;

const value=(input:string,fallback:string)=>input.trim()||`[[${fallback}]]`;
const header=(title:string,profile:LegalProfile)=>`${title.toLocaleUpperCase("tr-TR")}
Belge sürümü: ${LEGAL_VERSION}
Durum: ${profile.status||"HUKUK İNCELEMESİ GEREKLİ"}
Veri sorumlusu / controller: ${value(profile.controllerName,"YASAL UNVAN")}
İletişim: ${value(profile.contactEmail,"UYUM E-POSTASI")}
Yargı alanı: ${value(profile.jurisdictions,"TR / AB / DİĞER")}

ÖNEMLİ: Bu metin operasyonel şablondur. Yetkili hukukçu ülke, iş ilişkisi, toplu iş sözleşmesi, cihaz sahipliği ve veri aktarım modeline göre yazılı onay vermeden nihai metin olarak yayımlanamaz.
`;

export function legalProfileReadiness(profile:LegalProfile){
  const fields:Record<string,string|number>={"Yasal unvan":profile.controllerName,"Vergi / kayıt numarası":profile.taxId,"Açık adres":profile.address,"Uyum e-postası":profile.contactEmail,"KVKK/DPO irtibatı":profile.dpoContact,"Yargı alanı":profile.jurisdictions,"Çalışan verisi hukuki sebebi":profile.employeeLegalBasis,"Konum işleme amaçları":profile.locationPurposes,"Saklama süresi":profile.retentionDays,"Periyodik imha":profile.periodicDestructionMonths,"Alt işleyenler":profile.subprocessors,"Hukuk onaylayan":profile.approvedBy,"Hukuk onay tarihi":profile.approvedAt,"Yazılı hukuk görüşü referansı":profile.legalOpinionReference,"Onaylı politika sürümü":profile.policyVersion};
  const missing=Object.entries(fields).filter(([,entry])=>!String(entry||"").trim()||Number(entry)===0).map(([label])=>label);
  return {ready:missing.length===0&&profile.status==="APPROVED",missing};
}

export function buildLegalDocument(key:LegalDocumentKey,profile:LegalProfile){
  const company=value(profile.controllerName,"YASAL UNVAN"),contact=value(profile.contactEmail,"UYUM E-POSTASI"),dpo=value(profile.dpoContact,"KVKK/DPO İRTİBATI"),address=value(profile.address,"AÇIK ADRES"),basis=value(profile.employeeLegalBasis,"HER İŞLEME AMACI İÇİN HUKUKİ SEBEP"),purposes=value(profile.locationPurposes,"VARDİYA İÇİ GÜVENLİK VE OPERASYON AMAÇLARI"),subprocessors=value(profile.subprocessors,"SAĞLAYICI / ÜLKE / AMAÇ / VERİ GRUBU / GÜVENCE");
  const documents:Record<LegalDocumentKey,string>={
    "privacy-notice":`${header("Genel KVKK / GDPR Aydınlatma Bildirimi",profile)}
1. KİMLİK VE İLETİŞİM
${company}, ${address} adresinde veri sorumlusu/controller olarak hareket eder. Başvuru kanalı: ${contact}; veri koruma irtibatı: ${dpo}.

2. VERİ KATEGORİLERİ
Kimlik ve iletişim, şirket/rol, araç-sürücü ilişkisi, cihaz kimliği ve sağlık sinyalleri, vardiya ve rota, konum/telemetri, bakım-gider-belge, destek, işlem geçmişi ve güvenlik kayıtları.

3. AMAÇLAR VE HUKUKİ SEBEPLER
Filo operasyonunun kurulması ve yürütülmesi; araç, çalışan ve varlık güvenliği; sözleşme ve yasal yükümlülüklerin yerine getirilmesi; hakların tesisi ve savunulması; bilgi güvenliği. Her amaç için veri envanterindeki dayanak esas alınır. Çalışan verisi dayanak özeti: ${basis}. Açık rıza, zorunlu sözleşme veya iş ilişkisinin genel şartı olarak kullanılmaz.

4. TOPLAMA YÖNTEMİ
Kullanıcı formları, şirket yöneticisi kayıtları, sürücü mobil uygulaması, takip cihazları, iş ortakları, destek kanalı ve sunucu güvenlik günlükleri üzerinden otomatik veya kısmen otomatik yollarla.

5. AKTARIMLAR
Yetkili kullanıcılar, hukuken yetkili kamu kurumları, barındırma/iletişim/e-imza/e-belge/ödeme sağlayıcıları ve sözleşmeli alt işleyenlerle amaçla sınırlı aktarım yapılabilir. Güncel kayıt: ${subprocessors}.

6. SAKLAMA
Varsayılan operasyon süresi ${profile.retentionDays||"[[GÜN]]"} gündür. Yasal zorunluluk, uyuşmazlık veya sözleşme için farklı süre gerekiyorsa veri envanterindeki özel süre uygulanır; sona erince güvenli silme, yok etme veya anonimleştirme yapılır.

7. HAKLAR
İlgili kişiler erişim, düzeltme, silme/yok etme, işlemeye itiraz, aktarım bilgisi ve uygulanabildiği ölçüde veri taşınabilirliği taleplerini ${contact} kanalına iletebilir. Kimlik doğrulaması ve yasal yanıt süreleri uygulanır.

8. DEĞİŞİKLİK
Maddi değişiklikler yeni sürümle yayımlanır; yalnız önceki onaya dayanılarak yeni amaç eklenmez.

${sources}`,
    "employee-driver-notice":`${header("Çalışan ve Sürücü Aydınlatma Bildirimi",profile)}
1. KAPSAM
Bu bildirim çalışanlar, sözleşmeli sürücüler ve kendisine araç/telefon/takip cihazı tahsis edilen kişiler içindir.

2. İŞLENEN VERİLER
Kimlik, iletişim, ehliyet ve yetkinlik, iş/ekip/vardiya, araç ve cihaz ataması, kontrol-bakım-kaza kayıtları, sürüş güvenliği, konum ve telemetri, zimmet/imza kanıtı, destek ve denetim kayıtları.

3. AMAÇ VE DAYANAK
İşin ve filo görevinin yürütülmesi, iş sağlığı ve güvenliği, can-mal güvenliği, yasal yükümlülük, hakların tesisi/savunulması ve bilgi güvenliği. Kuruma özgü rol analizi: ${basis}. Çalışanın genel açık rızası tek veya varsayılan dayanak değildir.

4. ŞEFFAFLIK VE ÖLÇÜLÜLÜK
İzleme kapsamı görev ve vardiya ile sınırlandırılır. Performans değerlendirmesi veya disiplin amacı ayrıca tanımlanmadıkça konum verisi bu amaçla kullanılmaz. Yetkili rol, erişim zamanı ve dışa aktarma işlemleri kaydedilir.

5. VARDİYA DIŞI DURUM
Vardiya sona erdiğinde takip durdurulur veya kurumsal cihaz/araç güvenliği için zorunlu sınırlı mod uygulanır. Kişisel cihazda sürekli izleme yapılamaz; acil istisna kayıt altına alınır.

6. BAŞVURU
Hak ve itirazlar ${contact} veya ${dpo} kanalına iletilir.

${sources}`,
    "location-tracking-notice":`${header("Konum Takibi Özel Bildirimi",profile)}
1. TAKİBİN AMACI
${purposes}.

2. KAPSAM
GPS konumu, zaman, doğruluk, hız, yön, cihaz/araç kimliği, batarya-sinyal, vardiya ve geofence olayları işlenebilir. Mikrofon, kamera, mesaj içeriği ve kişisel uygulamalar bu kapsamda toplanmaz.

3. BAŞLATMA VE DURDURMA
Takip yalnız atanmış araç/cihaz ve aktif vardiya ile başlatılır. Kullanıcıya görünür durum göstergesi sunulur. Vardiya bitişi, iade veya acil durdurma işleminde veri üretimi kapatılır. Kapatma başarısızlığı güvenlik olayıdır.

4. SIKLIK VE SAKLAMA
Normal aktarım aralığı şirket politikasında belirlenir; iş amacı için gerekenden sık olamaz. Konum verisi en fazla ${profile.retentionDays||"[[GÜN]]"} gün saklanır; olay/uyuşmazlık kilidi varsa gerekçe ve süre kaydedilir.

5. ERİŞİM VE AKTARIM
Canlı konuma yalnız görevli operasyon/güvenlik rolleri erişir. Rota dışa aktarımı ve üçüncü taraf paylaşımı ayrıca kaydedilir. Alt işleyen özeti: ${subprocessors}.

6. HUKUKİ SEBEP VE HAKLAR
Kuruma özgü dayanak: ${basis}. Kullanıcı ${contact} üzerinden erişim, düzeltme, silme ve itiraz hakkını kullanabilir.

${sources}`,
    "retention-destruction-policy":`${header("Kişisel Veri Saklama ve İmha Politikası",profile)}
1. AMAÇ VE KAYIT ORTAMLARI
Amaç, işleme sebebi ortadan kalkan verilerin D1 kayıtları, R2 dosyaları, yedekler, sağlayıcı günlükleri ve dışa aktarımlarda tutarlı biçimde silinmesi, yok edilmesi veya anonimleştirilmesidir.

2. SORUMLULUKLAR
Veri sahibi: ilgili iş birimi; uygulayan: sistem yöneticisi; onaylayan: ${dpo}; doğrulayan: iç denetim/hukuk.

3. SÜRE TABLOSU
- Konum/ham telemetri: ${profile.retentionDays||"[[GÜN]]"} gün.
- Destek ve işlem geçmişi: [[SÜRE VE DAYANAK]].
- Zimmet/e-imza kanıtı: [[SÜRE VE DAYANAK]].
- Fatura/vergi belgeleri: [[ÜLKESEL YASAL SÜRE]].
- Yedekler: [[YEDEK DÖNGÜSÜ]].

4. PERİYODİK İMHA
İmha kontrolü en geç ${profile.periodicDestructionMonths||"[[AY]]"} ayda bir çalıştırılır; Türkiye profili için hukuk değerlendirmesiyle altı ay üst sınırı gözetilir. Her işlem kapsam, yöntem, adet, uygulayan, onaylayan ve kanıt özetiyle kaydedilir.

5. YÖNTEM
Aktif kayıtta erişilemez kılma/silme, kriptografik anahtar imhası veya fiziksel yok etme; istatistik için geri döndürülemez anonimleştirme. Yedek süresi dolana kadar geri dönüşte yeniden silme listesi uygulanır.

6. HUKUKİ BEKLETME
Uyuşmazlık veya yetkili makam talebi için bekletme yalnız tanımlı kapsam, sahibi ve bitiş gözden geçirmesiyle uygulanır.

${sources}`,
    "custody-handover-agreement":`${header("Araç / Telefon / Cihaz Zimmet ve Teslim Tutanağı",profile)}
TESLİM EDEN: [[AD SOYAD / UNVAN]]
TESLİM ALAN: [[AD SOYAD / KİMLİK/ÇALIŞAN NO]]
VARLIK: [[ARAÇ PLAKA/VIN VEYA CİHAZ TÜRÜ/MARKA/MODEL/SERİ/IMEI]]
AKSESUARLAR: [[LİSTE]]
TESLİM TARİHİ-SAATİ: [[ISO TARİH-SAAT / SAAT DİLİMİ]]
TESLİM KONUMU: [[YER]]
MEVCUT DURUM / HASAR / KM: [[AÇIKLAMA VE FOTOĞRAF KANITLARI]]

1. AMAÇ VE KULLANIM
Varlık yalnız görev, sözleşme ve şirket politikası kapsamında kullanılacaktır. Kullanıcı güvenlik bilgilerini paylaşmayacak, kayıp/hasar/arıza ve yetkisiz erişimi gecikmeden bildirecektir.

2. KONUM VE TELEMETRİ BİLDİRİMİ
Varlığın takip özelliği, işleme amaçları (${purposes}), hukuki sebep (${basis}), sıklık, vardiya sınırı, saklama süresi ve başvuru kanalı (${contact}) kullanıcıya teslimden önce ayrı bildirimle açıklanmıştır. Bu tutanak açık rızanın yerine geçmez.

3. İADE
İade tarihi, durum, aksesuar, kilometre, veri/hesap kaldırma ve tarafların tespitleri ayrı iade kaydında karşılaştırılır.

4. İMZA
Yöntem: [[ISLAK / GÜVENLİ E-İMZA / NİTELİKLİ E-İMZA]]
Belge SHA-256: [[ÖZET]]
Zaman damgası / sağlayıcı doğrulaması: [[REFERANS]]
TESLİM EDEN İMZA: __________  TESLİM ALAN İMZA: __________

${sources}`,
    "data-processing-addendum":`${header("Veri İşleme Ek Protokolü (DPA)",profile)}
TARAFLAR
Veri sorumlusu/controller: [[MÜŞTERİ YASAL UNVANI]]
Veri işleyen/processor: ${company}

1. KONU, SÜRE, AMAÇ VE VERİLER
Hizmet: filo, sürücü, araç, cihaz, konum ve operasyon yönetimi. Süre: ana sözleşme ve yasal saklama yükümlülükleri. Veri sahibi grupları, veri kategorileri, amaçlar ve talimatlar Ek-1 envanterinde belirtilir.

2. TALİMAT VE GİZLİLİK
Veri işleyen yalnız belgelenmiş talimatla hareket eder; yetkili personel gizlilik yükümlülüğündedir. Hukuka aykırı talimat fark edilirse yazılı bildirim yapılır.

3. GÜVENLİK
Tenant ve rol izolasyonu, SIWC kimliği, origin/CSRF kontrolü, oran sınırlama, şifreli aktarım, özel nesne depolama, dosya tarama, değiştirilemez denetim kayıtları, yedekleme ve olay müdahalesi uygulanır. Bağımsız test sonuçları ayrıca sunulur.

4. ALT İŞLEYENLER VE AKTARIM
Liste: ${subprocessors}. Yeni alt işleyen ve ülke değişikliği için sözleşmedeki bildirim/itiraz süreci uygulanır. Sınır ötesi aktarım mekanizması ayrıca belgelenir.

5. İLGİLİ KİŞİ VE İHLAL DESTEĞİ
Başvuru, DPIA/etki değerlendirmesi, denetim ve ihlal bildiriminde makul destek sağlanır. İhlal şüphesi gecikmeksizin [[SAAT]] içinde bildirilir.

6. SONA ERME
Talimata göre veriler iade veya güvenli biçimde silinir; yasal saklama istisnası kapsam ve süreyle belgelenir.

${sources}`,
    "subprocessor-register":`${header("Alt İşleyen ve Aktarım Kayıt Tablosu",profile)}
GÜNCEL BEYAN: ${subprocessors}

Her sağlayıcı için doldurulacak alanlar:
| Sağlayıcı/Yasal unvan | Hizmet | Rol | Veri grubu | Veri sahibi | Barındırma/ülke | Aktarım mekanizması | Saklama | Güvenlik kanıtı | Sözleşme tarihi | Son inceleme | Durum |
|---|---|---|---|---|---|---|---|---|---|---|---|
| [[SAĞLAYICI]] | [[HİZMET]] | [[İŞLEYEN/ALT İŞLEYEN]] | [[VERİ]] | [[GRUP]] | [[ÜLKE]] | [[DAYANAK]] | [[SÜRE]] | [[RAPOR]] | [[TARİH]] | [[TARİH]] | İNCELEME GEREKLİ |

Değişiklik yönetimi: yeni sağlayıcı eklenmeden önce güvenlik ve hukuk incelemesi; sözleşme/DPA; ülke ve veri akışı doğrulaması; müşteri bildirim/itiraz süreci; çıkışta silme kanıtı.

${sources}`,
    "incident-response-procedure":`${header("Kişisel Veri İhlali Müdahale Prosedürü",profile)}
1. BİLDİRİM KANALI
Şüpheli olay derhal ${contact} ve ${dpo} kanalına bildirilir. Kayıt; zaman, bildiren, etkilenen sistem/tenant, veri grubu ve ilk koruma adımını içerir.

2. İLK MÜDAHALE
Olay kimliği aç; kanıtı koru; etkilenen anahtar/oturum/entegrasyonu sınırla; veri kaybını artıracak silme veya değişiklik yapma; olay komutanı ve hukuk sorumlusu ata.

3. DEĞERLENDİRME
Gizlilik, bütünlük ve erişilebilirlik etkisi; ilgili kişi sayısı; veri hassasiyeti; ülke; devam eden risk; kurtarma imkânı ve bildirim yükümlülüğü değerlendirilir.

4. BİLDİRİM
Yetkili makam ve ilgili kişi bildirimleri ülkeye göre hukukça kararlaştırılır. GDPR kapsamındaki 72 saat ve KVKK kararlarındaki gecikmeksizin bildirim yaklaşımı olay zaman çizelgesinde izlenir; eksik bilgiler aşamalı tamamlanır.

5. KAPANIŞ
Kök neden, etkilenen kayıtlar, yapılan bildirimler, kurtarma, düzeltici faaliyet, sorumlu, hedef tarih ve tekrar test kanıtı olmadan olay kapatılamaz.

${sources}`,
  };
  return documents[key];
}

export type PlatformLegalEnvironment={
  LEGAL_CONTROLLER_NAME?:string;
  LEGAL_CONTROLLER_EMAIL?:string;
  LEGAL_CONTROLLER_ADDRESS?:string;
  LEGAL_TERMS_EFFECTIVE_AT?:string;
  PUBLIC_SIGNUP_ENABLED?:string;
};

const PUBLIC_LEGAL_LABELS:Record<string,string>={
  LEGAL_CONTROLLER_NAME:"Platform işletmecisi yasal unvanı",
  LEGAL_CONTROLLER_EMAIL:"Hukuk / gizlilik iletişim e-postası",
  LEGAL_CONTROLLER_ADDRESS:"Platform işletmecisi açık adresi",
  LEGAL_TERMS_EFFECTIVE_AT:"Kullanım koşulları yürürlük tarihi",
  PUBLIC_SIGNUP_ENABLED:"Hukuk onayı sonrası açık üyelik anahtarı",
};

export function platformLegalStatus(env:PlatformLegalEnvironment){
  const missing=[] as string[];
  if(!env.LEGAL_CONTROLLER_NAME)missing.push("LEGAL_CONTROLLER_NAME");
  if(!env.LEGAL_CONTROLLER_EMAIL||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.LEGAL_CONTROLLER_EMAIL))missing.push("LEGAL_CONTROLLER_EMAIL");
  if(!env.LEGAL_CONTROLLER_ADDRESS)missing.push("LEGAL_CONTROLLER_ADDRESS");
  if(!env.LEGAL_TERMS_EFFECTIVE_AT||!/^\d{4}-\d{2}-\d{2}$/.test(env.LEGAL_TERMS_EFFECTIVE_AT))missing.push("LEGAL_TERMS_EFFECTIVE_AT");
  if(env.PUBLIC_SIGNUP_ENABLED!=="true")missing.push("PUBLIC_SIGNUP_ENABLED");
  return {
    ready:missing.length===0,
    missing,
    missingLabels:missing.map(key=>PUBLIC_LEGAL_LABELS[key]||key),
    version:LEGAL_VERSION,
    signupEnabled:env.PUBLIC_SIGNUP_ENABLED==="true",
  };
}

export function buildPublicLegalDocument(kind:"terms"|"privacy",env:PlatformLegalEnvironment){
  const status=platformLegalStatus(env),name=value(env.LEGAL_CONTROLLER_NAME||"","PLATFORM İŞLETMECİSİ YASAL UNVANI"),email=value(env.LEGAL_CONTROLLER_EMAIL||"","PLATFORM HUKUK/GİZLİLİK E-POSTASI"),address=value(env.LEGAL_CONTROLLER_ADDRESS||"","PLATFORM İŞLETMECİSİ ADRESİ"),effective=value(env.LEGAL_TERMS_EFFECTIVE_AT||"","YÜRÜRLÜK TARİHİ");
  const draft=status.ready?"YAYINLANABİLİR":"TASLAK — YASAL İŞLETMECİ BİLGİLERİ EKSİK; ÜYELİK KABULÜ ALINAMAZ";
  if(kind==="terms")return `FİLO PLATFORM KULLANIM KOŞULLARI\nSürüm: ${LEGAL_VERSION}\nDurum: ${draft}\nYürürlük: ${effective}\nİşletmeci: ${name}\nAdres: ${address}\nİletişim: ${email}\n\n1. Hizmet, filo operasyon kayıtlarının yönetimi için sunulur; kullanıcı yalnız yetkili olduğu verileri işler.\n2. Kullanıcı araç, çalışan, sürücü, konum ve cihaz verileri için geçerli hukuki dayanak ve bilgilendirmeyi sağlamaktan sorumludur.\n3. Ücretsiz paket 1 kullanıcı ve 1 araçla sınırlıdır. Ücretli planlar sağlayıcı onayıyla etkinleşir.\n4. Hesap güvenliği ChatGPT kimlik doğrulaması ve sunucu taraflı rollerle korunur; yetki paylaşımı yasaktır.\n5. Hukuka aykırı izleme, üçüncü kişi verisi, zararlı dosya, güvenlik aşma ve hizmeti kötüye kullanma yasaktır.\n6. Bakım, güvenlik olayı veya yasal zorunlulukta hizmet sınırlandırılabilir.\n7. Sorumluluk, emredici hukuk saklı kalmak üzere doğrudan ve öngörülebilir zararlarla sınırlanır; ülkesel tüketici/iş hukuku hakları ortadan kaldırılmaz.\n8. Sona ermede dışa aktarım, saklama ve silme süreçleri gizlilik bildirimine ve sözleşmeye göre yürütülür.\n9. Maddi değişiklikler yeni sürüm ve yürürlük tarihiyle duyurulur.\n\nBu metin hukukçu onayı olmadan nihai sözleşme değildir.`;
  return `FİLO PLATFORM GİZLİLİK / KVKK-GDPR BİLDİRİMİ\nSürüm: ${LEGAL_VERSION}\nDurum: ${draft}\nYürürlük: ${effective}\nVeri sorumlusu/controller: ${name}\nAdres: ${address}\nBaşvuru: ${email}\n\nİşlenen veriler: hesap kimliği ve e-posta, çalışma alanı/rol, şirket ve filo kayıtları, destek, işlem güvenliği ve kullanıcının hizmete girdiği içerikler.\nAmaçlar: hesabın kurulması, hizmet ve destek, güvenlik, yasal yükümlülük, sözleşme, hakların tesisi ve savunulması. Her amaç için ülkesel hukuki dayanak ayrıca belirlenir; açık rıza varsayılan dayanak değildir.\nAlıcılar: yetkili personel, barındırma ve kimlik altyapısı, seçilen entegrasyon sağlayıcıları ve hukuken yetkili kurumlar. Alt işleyen/ülke ve aktarım güvenceleri yayımlanmadan gerçek kişisel veri işlenmemelidir.\nSaklama: amaç ve yasal yükümlülükle sınırlı süre; sona erdiğinde silme, yok etme veya anonimleştirme. Kesin süre tablosu yayımlanmalıdır.\nHaklar: erişim, düzeltme, silme, itiraz, aktarım bilgisi ve uygulanıyorsa taşınabilirlik talepleri ${email} kanalına iletilir.\nKonum: platform hesabı açılması tek başına konum takibi başlatmaz. Konum için tenant şirketi ayrı çalışan/sürücü ve konum bildirimi yayımlar.\nGüvenlik: SIWC kimliği, tenant/rol denetimi, origin/CSRF kontrolü, oran sınırlama, özel dosya deposu, dosya tarama ve denetim kayıtları uygulanır; bağımsız test ayrıca gerekir.\n\n${sources}`;
}
