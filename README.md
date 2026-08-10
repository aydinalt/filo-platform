# Filo Platform V1 — güvenli canlı konum dilimi v0.5

Çalışan monorepo: React web paneli, Fastify API, PostgreSQL RLS şeması, güvenli
oturum, tenant'a izole araç ana kaydı ve değiştirilemez işlem geçmişi.

v0.3 ayrıca tenant izolasyonlu sürücü yönetimi, şirket/kişisel cihaz envanteri,
cihaz–sürücü ataması ve Owner/Admin/Operator/Viewer rol politikasını içerir.

v0.4 araç–sürücü atama geçmişi, çakışma koruması, vardiya/çalışma oturumları,
telefon konum izni ve güvenli takip durum makinesini ekler.

v0.5 yalnız aktif vardiya ve açık takip sırasında konum kabul eden güvenli konum
olaylarını, tekrar gönderim korumasını ve son konum operasyon görünümünü ekler.

## v0.2 ile çalışan akış

1. Demo yöneticisi güvenli cookie oturumuyla giriş yapar.
2. Tenant adı doğrulanmış oturumdan alınır.
3. Yalnız aktif tenant'ın araçları listelenir.
4. Yönetici yeni araç ekler veya aracın durumunu değiştirir.
5. Her değişiklik tenant'a izole audit kaydına dönüşür.
6. İşlem Geçmişi ekranı son 20 olayı gösterir.

## Klasörler

```text
apps/web                 React + Vite panel
apps/api                 Fastify REST API
packages/contracts       Ortak Zod şemaları ve tipler
packages/database        PostgreSQL bağlantısı, migration ve seed
infra                    Yerel PostgreSQL rol kurulumu
docs                     Mimari ve güvenlik kararları
```

## Yerelde çalıştırma

Gerekenler: Node.js 22+, Docker Desktop.

Windows kullanıyorsanız PowerShell'de proje klasörünü açıp:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Manuel kurulum:

```bash
cp .env.example .env
docker compose up -d
npm install
set -a && source .env && set +a
npm run db:migrate
npm run db:seed
npm run dev
```

Web: `http://localhost:5173`  
API süreç kontrolü: `http://localhost:3001/health/live`

API veritabanı hazırlık kontrolü: `http://localhost:3001/health/ready`

Demo giriş:

- E-posta: `admin@demo.filo`
- Parola: `FiloDemo123!`

## Doğrulama

```bash
npm run typecheck
npm run test
npm run build
psql "$DATABASE_URL" -f packages/database/tenant-isolation-test.sql
```

Windows'ta tenant izolasyonu doğrulaması:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-local.ps1
```

## Hosting

Önerilen düşük maliyetli başlangıç:

- Web: Vercel (Root Directory: `apps/web`)
- API: Render (`render.yaml` hazır)
- PostgreSQL: Neon veya Supabase, transaction-mode pooler destekli bağlantı

Üretim PostgreSQL'de iki kullanıcı tanımlayın: migration sahibi ve `BYPASSRLS`
olmayan uygulama rolü. API için yalnız uygulama rolünün URL'sini
`DATABASE_URL` olarak girin. Migration sırasında `DATABASE_ADMIN_URL` kullanın.

Vercel'e `VITE_API_URL=https://api-adresiniz` ekleyin. Render'a `WEB_ORIGIN`
olarak Vercel adresini, `DATABASE_URL` olarak uygulama rolü bağlantısını girin.
`SESSION_SECRET`, `NOTIFICATION_WORKER_KEY` ve `NOTIFICATION_WEBHOOK_SECRET`
birbirinden farklı, en az 32 rastgele karakter olmalıdır. Üretimde `WEB_ORIGIN`
HTTPS olmalı ve `COOKIE_SECURE=true` kalmalıdır. API; eksik, yer tutucu veya
güvensiz üretim ayarlarında başlamayı reddeder.

> Gerçek kullanıcı verisi açılmadan önce seçilen PostgreSQL planında PITR ve
> restore provası ayrıca tamamlanmalıdır.
