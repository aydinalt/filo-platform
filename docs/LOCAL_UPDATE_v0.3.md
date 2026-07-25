# Yerel Güncelleme — v0.2 → v0.3

1. Uygulamayı ve açık terminalleri kapatın.
2. Güncelleme ZIP'indeki dosyaları mevcut `filo-platform-v1` klasörünün üzerine açın.
3. Aynı adlı dosyaların değiştirilmesini onaylayın. `.env` dosyanız pakette yoktur ve korunur.
4. PowerShell açın:

```powershell
cd C:\Projeler\FiloPlatform\filo-platform-v1
npm install
npm run db:migrate
npm run typecheck
npm test
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Migration sistemi daha önce çalıştırılan `001` ve `002` dosyalarını tekrar uygulamaz; yalnız `003_drivers_devices_rbac.sql` çalışır.

## Yetki matrisi

| İşlem | Owner | Admin | Operator | Viewer |
|---|---:|---:|---:|---:|
| Araç görme | ✓ | ✓ | ✓ | ✓ |
| Araç ekleme/durum | ✓ | ✓ | ✓ | — |
| Sürücü/cihaz görme | ✓ | ✓ | ✓ | ✓ |
| Sürücü/cihaz ekleme | ✓ | ✓ | — | — |
| Üye listesini görme | ✓ | ✓ | — | — |
| Rol değiştirme | ✓ | — | — | — |
