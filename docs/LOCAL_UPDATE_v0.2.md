# Yerel güncelleme — v0.1 → v0.2

## En güvenli yöntem

Tam v0.2 paketini ayrı bir klasöre açın:

```text
C:\Projeler\FiloPlatform\filo-platform-v1-v0.2
```

Eski projenizdeki gerçek `.env` dosyasını yeni klasörün köküne kopyalayın.
`node_modules` ve `dist` klasörlerini kopyalamayın. Ardından:

```powershell
cd C:\Projeler\FiloPlatform\filo-platform-v1-v0.2
npm install
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
```

## Mevcut klasörün üzerine güncelleme

Yalnız `Filo_Platform_v0.2_Guncellenen_Dosyalar.zip` paketini kullanın. ZIP'i
mevcut `filo-platform-v1` klasörünün içine açın ve aynı adlı dosyaların
değiştirilmesini onaylayın.

Bu güncelleme veritabanı tablosu silmez ve mevcut `.env` dosyasını içermez.

## Güncellenen işlevler

- Oturumda gerçek tenant adı
- Araç durum değiştirme API'si
- Durum değişikliğinde audit olayı
- Tenant izole işlem geçmişi API'si ve ekranı
- Windows kurulum, başlatma ve doğrulama betikleri
