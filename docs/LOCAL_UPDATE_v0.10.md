# Filo Platform v0.10 — Yakıt ve Gider Takibi

## Kapsam

- Yakıt, geçiş, otopark, yıkama, onarım ve diğer araç giderleri
- Yakıt için litre, tutar ve kilometre kaydı
- Araç ve filo toplamı bazında gider özeti
- Gelecek tarihli kayıt ve geriye giden kilometre engeli
- Tenant/RLS, rol kontrolleri ve audit kaydı

## Kurulum

1. v0.9 proje klasörünün üzerine güncelleme paketini açın.
2. `npm install` çalıştırın.
3. `npm run db:migrate` ile `010_vehicle_expenses.sql` migration'ını uygulayın.
4. `npm run typecheck && npm test && npm run build` ile doğrulayın.

Bu sürüm fatura dosyası yükleme, muhasebe entegrasyonu ve yakıt kartı sağlayıcısı bağlantısı içermez.
