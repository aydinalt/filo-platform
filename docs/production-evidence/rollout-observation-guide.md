# Kademeli yayın gözlem rehberi

Bu şablon, `docs/v1.28-production-activation.md` içindeki %5 → %25 → %100 açılımını kanıtlamak içindir. Her dalga başlamadan önce önceki dalganın geri alma kararı, nöbet sahibi ve alarm kanalı doğrulanır.

## Kabul ölçütleri

- CANARY en az 60 dakika, WAVE_25 en az 4 saat, FULL en az 24 saat gözlemlenir.
- Kritik alarm, güvenlik ihlali, veri bütünlüğü hatası veya tekrarlayan sağlayıcı callback hatası varsa dalga ilerlemez.
- Hata oranı, p95 gecikme, zamanlanmış iş başarısızlığı ve müşteri bildirimi satırları boş bırakılamaz.
- Rollback kararı bir kişi tarafından değil, on-call + operasyon sahibi tarafından kaydedilir.
- Her satırın bağlı log/export dosyası SHA-256 özetiyle panele yüklenir.

## Geri alma kanıtı

Rollback yapılırsa neden, saat, etkilenen trafik, geri alınan sürüm ve veri düzeltme adımları aynı satırda açıklanır. Rollback yapılmadıysa `NO_ROLLBACK` yazılır; boş bırakılmaz.

Şablonun doldurulması tek başına üretim onayı değildir. Release Center kapısı, gerçek telemetry, provider callback ve operasyon kanıtlarını ayrıca kontrol eder.
