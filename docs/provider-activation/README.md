# Sağlayıcı aktivasyon kontrolü

Bu klasör, üretim secret store ve callback aktivasyonunu güvenli biçimde yürütmek için kullanılır. Şablonlar hiçbir gerçek anahtar içermez. Bir değişkenin dolu olması sağlayıcıyı `CONNECTED` yapmaz; gerçek uçtan uca çağrı ve imzalı callback kanıtı gerekir.

## Sıra

1. Sağlayıcı hesabı ve sözleşmesi hukuk tarafından onaylanır.
2. Secret store'a yalnız gerçek sırlar girilir; Git, ZIP, ekran görüntüsü ve destek talebine sır yazılmaz.
3. `node scripts/production-preflight.mjs --json` çalıştırılır.
4. Sağlayıcı sandbox çağrısı, callback imzası, idempotency ve hata/yeniden deneme senaryosu kanıtlanır.
5. Üretim canlı çağrısı düşük tutarlı veya test hesabıyla yapılır; kanıt SHA-256 ile yüklenir.
6. Release Center kapısı, gerçek provider bağlantısı ve kanıt dosyasıyla yeniden çalıştırılır.

## Callback sözleşmesi

- Ödeme, e-belge, e-posta ve push callbackleri sağlayıcı adı, olay kimliği, zaman damgası ve HMAC imzası taşır.
- Aynı sağlayıcı + olay kimliği ikinci kez işlendiğinde yan etki üretmemelidir.
- İmzalanamayan, zaman penceresi dışında kalan veya sözleşme dışı durumlar reddedilir.
- Callback URL'leri yalnız HTTPS olmalıdır.

## Değişken grupları

Tam liste ve örnek isimler `integrations/provider.env.example` ile `.env.example` içindedir. Gerçek değerler yalnız barındırma sağlayıcısının secret yönetimine girilir.

| Grup | Anahtarlar | Başarı kanıtı |
| --- | --- | --- |
| Zamanlayıcı | `OPERATIONS_CRON_SECRET` | 15 dakikalık slotun idempotent koşu kaydı |
| Güvenlik | `MALWARE_SCAN_PROVIDER`, `CLOUDMERSIVE_API_KEY` | Temiz ve karantina örneği |
| E-belge | `EINVOICE_*` | Kabul edilmiş provider referansı ve callback |
| Ödeme | `PAYMENT_*` | Tamamlanmış checkout ve callback |
| E-posta | `RESEND_*` | Teslim ve bounce webhook kanıtı |
| Push | `EXPO_*` | Receipt teslimi ve geçersiz token akışı |
| VIN/katalog | `VEHICLE_CATALOG_*` | Pazar bazlı decode ve kaynak özeti |

