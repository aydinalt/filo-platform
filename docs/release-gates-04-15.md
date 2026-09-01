# Filo Platform · 4–15 üretim kapıları

Bu belge yazılımın neyi doğruladığını ve hangi gerçek dünya kanıtının ayrıca gerektiğini tanımlar. Bir şablonun bulunması, formun doldurulması veya ortam değişkeninin girilmesi tek başına kapıyı başarılı yapmaz.

| No | Kapı | Yazılım kabulü | Gerçek kanıt |
|---:|---|---|---|
| 4 | Tenant izolasyonu | Owner/Admin/Operator/Viewer pozitif-negatif yetki matrisi ve tenant kapsamı | Son 30 gün içinde bağımsız negatif erişim sonucu |
| 5 | Ödeme | İmzalı ve tekrar korumalı callback; tamamlandı, başarısız, iptal, iade | Sağlayıcının dört gerçek yaşam döngüsü olayı |
| 6 | E-belge | Sunucu vergi profili; kabul, ret ve iptal sonuçları | Yetkili e-belge sağlayıcı olay kimlikleri |
| 7 | Bildirim | E-posta teslim/hata, push receipt ve aynı kimlikle retry | Resend/Expo gerçek teslimat sonuçları |
| 8 | Hukuk ve zimmet | Onaylı hukuk profili, politika sürümü, temiz belgeye bağlı doğrulanmış imza | Hukukçu görüşü ve gerçek imza/tebliğ kaydı |
| 9 | Veri geçişi | Sayım mutabakatı, örneklem, mükerrer kontrol ve geri alma | Müşteri onayı ile gerçek veri kabul tutanağı |
| 10 | İzleme | D1/R2/outbox/telemetri sağlık kontrolü ve alarm aç-atama-kapatma provası | Nöbet sahibi ve son 7 günlük alarm kanıtı |
| 11 | Yedek | SHA-256 bütünlüğü ve üretimden ayrı gölge geri yükleme | Son 30 günlük RPO/RTO sonucu |
| 12 | Global kullanım | TR/EN katalog, tarih, sayı, para, vergi ve saat dilimi denetimi | İki bölgesel profilde kabul kaydı |
| 13 | Güvenlik ve yük | OWASP/ASVS, en az 100 eşzamanlı kullanıcı, p95 ≤ 500 ms, p99 ≤ 1000 ms, hata ≤ %1 | Bağımsız denetçi raporu; açık kritik/yüksek bulgu yok |
| 14 | Pilot UAT | En az 2 firma, 3 araç ve üç uçtan uca senaryo; kritik destek engeli yok | Farklı müşteri ve platform onaylayanları |
| 15 | Mobil mağaza | iOS/Android imza, arka plan konumu, Data Safety, gizlilik/destek/silme URL’leri | Apple ve Google gerçek inceleme kimliği ve APPROVED sonucu |

## Otomatik doğrulama

- `npm run gates:4-15` yazılım sözleşmesini ve tüm şablonları doğrular.
- Panelden indirilen V2 manifestosu `npm run gates:4-15:go-live -- --manifest=<dosya>` ile doğrulanır.
- Yalnız `READY_FOR_CONTROLLED_ROLLOUT` sonucu %5 → %25 → %100 kontrollü yayına geçişe izin verir.
- API anahtarı, parola, özel anahtar veya kişisel veri kanıt manifestosuna yazılmaz.
