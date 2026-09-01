# Üretim kanıt paketi

Bu klasör, v1.28 üretim kapılarını tek seferde kapatmak için kullanılacak doldurulabilir kanıt şablonlarını içerir. Şablon indirmek veya doldurmak kapıyı başarılı yapmaz; gerçek sağlayıcı, hukukçu, cihaz, bağımsız denetçi ve müşteri kanıtı panele yüklenmelidir.

## Toplu uygulama sırası

1. `legal-approval-template.md` hukuk/KVKK/GDPR ve alt işleyen incelemesi için doldurulur.
2. `device-field-matrix.csv` iPhone, Android OEM ve Teltonika/Queclink saha testleriyle doldurulur.
   Telefon ölçümleri `mobile-field-evidence-template.json`, fiziksel GPS/SIM ve
   TCP/MQTT ölçümleri `hardware-gateway-evidence-template.json` biçiminde ayrıca
   doğrulanır.
3. `security-load-report-template.md` bağımsız OWASP/ASVS ve en az 100 eşzamanlı kullanıcı testiyle doldurulur.
4. `pilot-uat-template.csv` en az iki firma ve üç araçla gerçek CRM → talep → teklif → operasyon → takip → bakım → zimmet akışıyla doldurulur.
5. `store-release-template.csv` iOS ve Android mağaza kimlikleri, imza, gizlilik ve geri alma bilgileriyle doldurulur.
6. `operations-runbook-template.md` ON_CALL, ALERT, BACKUP ve INCIDENT sahipleriyle doldurulur.
7. `rollout-observation-template.csv` ve `rollout-observation-guide.md` ile %5 → %25 → %100 gözlemi kaydedilir.
8. Tamamlanan belgeler SHA-256 özetiyle panele kanıt dosyası olarak yüklenir.

Kapı 4–15 için tekil kabul ölçütleri `docs/release-gates-04-15.md` dosyasındadır. Sağlayıcı yaşam döngüsü, gerçek veri geçişi, gölge geri yükleme ve TR/EN kabulü için ayrı CSV şablonları da bu klasöre eklenmiştir.

Panelden indirilen `FILO_READINESS_EVIDENCE_MANIFEST_V2` dosyası yalnız temiz taramadan geçmiş, 64 karakter SHA-256 özetli ve süresi geçmemiş kanıtları içerir. Canlı kapı denetimi:

```bash
npm run gates:4-15:go-live -- --manifest=filo-v1.28.4-kanit-manifestosu.json
```

## Güvenlik sınırı

Bu klasöre API anahtarı, özel anahtar, parola, müşteri verisi veya kişisel veri yazılmaz. Sağlayıcı sırları yalnız üretim secret store'a girilir. Hukuk şablonu nihai sözleşme veya hukuki görüş yerine geçmez.
