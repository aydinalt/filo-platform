export const READINESS_GATES = [
  { order: 1, id: "RDY-MOBILE-IOS-KILLED", category: "MOBİL", name: "iOS kapalı uygulama konum sürekliliği", detail: "Fiziksel iPhone, ekran kapalı ve uygulama sonlandırılmış saha kanıtı", freshnessDays: 30 },
  { order: 2, id: "RDY-MOBILE-ANDROID-OEM", category: "MOBİL", name: "Android pil ve OEM matrisi", detail: "Samsung, Xiaomi, Oppo ve Pixel arka plan/yeniden başlatma testi", freshnessDays: 30 },
  { order: 3, id: "RDY-TRACKER-LIVE", category: "CİHAZ", name: "Gerçek takip cihazı bağlantısı", detail: "Teltonika/Queclink fiziksel paketi, HMAC, tekrar koruması ve kalıcı telemetri kanıtı", freshnessDays: 30 },
  { order: 4, id: "RDY-TENANT-ISOLATION", category: "GÜVENLİK", name: "Tenant izolasyonu ve rol matrisi", detail: "İç öz denetim, negatif yetki senaryoları ve bağımsız test kanıtı", freshnessDays: 30 },
  { order: 5, id: "RDY-PAYMENT", category: "ÖDEME", name: "Ödeme ve abonelik yaşam döngüsü", detail: "Başarılı, başarısız, iptal, iade ve imzalı callback", freshnessDays: 30 },
  { order: 6, id: "RDY-EINVOICE", category: "E-BELGE", name: "E-fatura/e-arşiv sağlayıcısı", detail: "Yetkili sağlayıcı kabul, ret ve iptal geri bildirimi", freshnessDays: 30 },
  { order: 7, id: "RDY-NOTIFICATION", category: "BİLDİRİM", name: "E-posta ve push teslimatı", detail: "Teslim, bounce, hata, push receipt ve aynı kimlikle yeniden deneme", freshnessDays: 30 },
  { order: 8, id: "RDY-LEGAL-CUSTODY", category: "HUKUK", name: "Zimmet, konum bildirimi ve hukuk profili", detail: "Hukukçu onaylı metin, doğrulanmış imza yöntemi ve saklama politikası", freshnessDays: 365 },
  { order: 9, id: "RDY-DATA-MIGRATION", category: "VERİ", name: "Gerçek veri geçiş provası", detail: "CSV doğrulama, mutabakat, örneklem, mükerrer kontrol ve geri alma tutanağı", freshnessDays: 30 },
  { order: 10, id: "RDY-OBSERVABILITY", category: "İZLEME", name: "Sistem sağlığı ve alarm operasyonu", detail: "D1, R2, outbox ve telemetri sağlık denetimi ile alarm yaşam döngüsü", freshnessDays: 7 },
  { order: 11, id: "RDY-BACKUP-RESTORE", category: "YEDEK", name: "Yedek ve geri yükleme provası", detail: "Bütünlük doğrulaması, ayrı ortam geri yükleme ve RPO/RTO", freshnessDays: 30 },
  { order: 12, id: "RDY-I18N", category: "GLOBAL", name: "Türkçe/İngilizce ve bölgesel biçimler", detail: "Ekran, hata, tarih, para, vergi ve saat dilimi kabul testi", freshnessDays: 30 },
  { order: 13, id: "RDY-SECURITY-LOAD", category: "TEST", name: "Güvenlik ve performans testi", detail: "Bağımsız OWASP/ASVS, dosya güvenliği ve en az 100 eşzamanlı kullanıcı yük raporu", freshnessDays: 30 },
  { order: 14, id: "RDY-PILOT-UAT", category: "PİLOT", name: "Gerçek firma uçtan uca UAT", detail: "En az 2 firma ve 3 araçla CRM’den zimmet iadesine kabul", freshnessDays: 30 },
  { order: 15, id: "RDY-MOBILE-STORE", category: "YAYIN", name: "Yerel mobil uygulama ve mağaza hazırlığı", detail: "iOS/Android imza, izin, gizlilik, Data Safety ve gerçek mağaza onayı", freshnessDays: 30 },
] as const;

export type ReadinessGateId = (typeof READINESS_GATES)[number]["id"];

export const READINESS_ORDER = READINESS_GATES.map(gate => gate.id) as ReadonlyArray<ReadinessGateId>;

export const RELEASE_GATES_4_TO_15 = READINESS_GATES.filter(gate => gate.order >= 4);
