# Yerel güncelleme — v0.4

Bu paket v0.3 üzerine araç–sürücü ataması, vardiya/çalışma oturumu ve konum
izni/takip durum modelini ekler. Mevcut kayıtları silmez.

## Windows güncelleme

Güncelleme ZIP'ini mevcut `filo-platform-v1` klasörünün üzerine açın ve aynı
adlı dosyaların değiştirilmesini onaylayın. Gerçek `.env` dosyası pakette yoktur.

```powershell
cd C:\Projeler\FiloPlatform\filo-platform-v1
npm install
npm run db:migrate
npm run typecheck
npm test
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Yeni migration: `004_assignments_shifts_tracking.sql`

## Güvenlik kuralları

- Aynı araç veya sürücü eşzamanlı iki aktif atamada bulunamaz.
- Tenant dışı, pasif veya uyumsuz kayıtlarla atama açılamaz.
- Aktif vardiya kapanmadan atama kapatılamaz.
- Konum izni yokken `tracking` durumuna geçilemez.
- İzin `denied` veya `restricted` olursa takip `permission_revoked` olur.
- Viewer salt okunurdur; yazma işlemleri Owner/Admin/Operator ile sınırlıdır.
- Atama, vardiya ve takip geçişleri değiştirilemez audit olayına dönüşür.
