# v0.5 yerel güncelleme

v0.4 klasörünün üzerine güncelleme paketini açın. Ardından:

```powershell
npm install
npm run db:migrate
npm run typecheck
npm test
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

`005_location_events.sql` mevcut veriyi silmez. Gerçek `.env` dosyası pakete
dahil değildir ve güncelleme sırasında değiştirilmez.
