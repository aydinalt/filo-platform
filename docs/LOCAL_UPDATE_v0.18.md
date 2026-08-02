# Filo Platform v0.18 — Yerel Güncelleme

Bu sürüm tenant güvenli uygulama içi bildirim kutusu ve bildirim kurallarını ekler.

## Uygulama

1. Güncelleme paketini proje köküne kopyalayın.
2. `npm install` çalıştırın.
3. `npm run db:migrate` ile `018_in_app_notifications.sql` migration'ını uygulayın.
4. `npm run typecheck && npm test && npm run build` çalıştırın.

E-posta, SMS ve push sağlayıcı entegrasyonu v0.18 kapsamına dahil değildir.
