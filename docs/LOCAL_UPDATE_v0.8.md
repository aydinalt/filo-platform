# Filo Platform v0.8 — Operasyon Uyarıları

## Kapsam

- Hız eşiği ve bölge giriş/çıkış uyarı kuralları
- Konum kabulü sırasında sunucu tarafında uyarı üretimi
- Aynı konum olayı/kural çifti için yinelenen uyarı engeli
- Uyarıyı görüldü ve çözüldü olarak işaretleme
- Tenant/RLS, rol kontrolleri ve audit kaydı

## Kurulum

1. v0.7 proje klasörünün üzerine güncelleme paketini açın.
2. `npm install` çalıştırın.
3. `npm run db:migrate` ile `008_operational_alerts.sql` migration'ını uygulayın.
4. `npm run typecheck && npm test && npm run build` ile doğrulayın.

Bu sürüm SMS, e-posta veya push sağlayıcısına bildirim göndermez; uygulama içi güvenli uyarı çekirdeğini kurar.
