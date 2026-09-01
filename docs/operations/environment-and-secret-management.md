# Ortam ve secret yönetimi

Bu sözleşme development, staging ve production ortamlarının veri, dosya ve sağlayıcı sınırlarını tanımlar. Gerçek sırlar Git'e, ZIP paketlerine, destek kayıtlarına veya kanıt dosyalarına yazılmaz.

## Ortam ayrımı

| Alan | Development | Staging | Production |
| --- | --- | --- | --- |
| Veri | Yalnız sentetik | Sentetik veya maskelenmiş | Gerçek müşteri verisi |
| D1/R2 | Ayrı kaynak | Ayrı kaynak | Ayrı kaynak |
| Sağlayıcı | Kapalı veya sandbox | Sandbox | Canlı hesap |
| Ücretsiz kayıt | Kapalı | Kapalı | Hukuk onayından sonra açık |
| Origin | Yerel olabilir | HTTPS | HTTPS |

Makine-okunur kurallar `config/environments/` içindedir. Her ortam `ENVIRONMENT_ID`, `PUBLIC_APP_ORIGIN` ve sağlayıcı hesaplarını ayrı tutar. Cloudflare hedefi farklı `D1_ENVIRONMENT_ID`/`R2_ENVIRONMENT_ID`; Supabase hedefi farklı proje URL'si, PostgreSQL bağlantısı, özel Storage ve Auth yapılandırması kullanır. Staging ile production aynı veri kaynağını, callback sırrını veya ödeme hesabını paylaşamaz.

## Secret sınıfları

| Sınıf | Örnekler | Saklama | Rotasyon |
| --- | --- | --- | --- |
| Callback sırları | `PAYMENT_WEBHOOK_SECRET`, `EINVOICE_WEBHOOK_SECRET`, `ESIGN_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET` | Hosting secret store | En fazla 90 gün veya olay sonrası |
| API anahtarları | Ödeme, e-belge, e-imza, Resend, Expo, Cloudmersive, VIN | Hosting secret store | Sağlayıcı desteğine göre; en fazla 90 gün |
| Operasyon sırrı | `OPERATIONS_CRON_SECRET` | Zamanlayıcı + hosting secret store | En fazla 90 gün |
| Nöbetçi rotası | `OPERATIONS_ALERT_EMAILS` | Hosting environment store | Vardiya/sahip değişiminde |
| Cihaz anahtarı | Mobil/Teltonika/Queclink cihaz tokenı | D1'de yalnız hash | En fazla 30 gün; cihaz iptalinde hemen |

`SECRETS_ROTATED_AT`, `SECRET_ROTATION_OWNER` ve `SECRET_MAX_AGE_DAYS` secret değerlerini değil, son rotasyonun denetim bilgisini taşır. Üretimde `BROWSER_TELEMETRY_ENABLED=false`; Supabase hedefinde `PRIVILEGED_MFA_REQUIRED=true` zorunludur.

## Rotasyon prosedürü

1. Yeni anahtar sağlayıcıda oluşturulur; eski anahtar henüz iptal edilmez.
2. Yeni değer doğru ortamın secret store'una girilir ve ortam revizyonu kaydedilir.
3. Aynı kaynak sürümü yeni ortam revizyonuyla dağıtılır.
4. Sandbox/canary çağrısı, imzalı callback ve idempotency sonucu doğrulanır.
5. Eski anahtar sağlayıcıdan iptal edilir.
6. `SECRETS_ROTATED_AT` ve sahip bilgisi güncellenir; kanıta yalnız tarih, sağlayıcı referansı ve SHA-256 özeti yazılır.

Anahtar sızıntısı, ekip ayrılığı veya imza doğrulama hatasında planlı süre beklenmez; ilgili sır hemen döndürülür, aktif oturum/cihaz tokenları iptal edilir ve olay kaydı açılır.

## Kontrol

```bash
npm run preflight:production
npm run preflight:production:strict
```

Development ve staging sözleşmeleri sırasıyla `--environment=development` ve `--environment=staging` ile kontrol edilir. Preflight yalnız anahtarın mevcut, biçimsel olarak geçerli ve rotasyon süresi içinde olup olmadığını raporlar; hiçbir sır değerini çıktıya yazmaz ve gerçek sağlayıcı kanıtının yerine geçmez.
