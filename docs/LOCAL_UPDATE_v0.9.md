# Filo Platform v0.9 — Bakım Planlama

## Kapsam

- Tarih veya kilometre hedefli araç bakım planları
- Yaklaşan ve geciken bakım durumlarının sunucu tarafında hesaplanması
- Yetkili roller için bakım tamamlama ve kilometre kaydı
- Yinelenen aktif bakım planı engeli
- Tenant/RLS, rol kontrolleri ve audit kaydı

## Kurulum

1. v0.8 proje klasörünün üzerine güncelleme paketini açın.
2. `npm install` çalıştırın.
3. `npm run db:migrate` ile `009_vehicle_maintenance.sql` migration'ını uygulayın.
4. `npm run typecheck && npm test && npm run build` ile doğrulayın.

Bu sürüm servis sağlayıcı entegrasyonu, maliyet/fatura yönetimi ve parça stok takibi içermez.
