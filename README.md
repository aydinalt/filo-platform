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

Release kapısı, kilit dosyasındaki üretim bağımlılıklarını da doğrular. Bilinen
yüksek riskli `fast-uri` ve `nanoid` sürümlerine geri dönüş çevrimdışı regresyon
testiyle engellenir; üretim bağımlılık denetimi yayın öncesinde temiz olmalıdır.

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
olarak Vercel adresini, `DATABASE_URL` olarak uygulama rolü bağlantısını ve
`DATABASE_ADMIN_URL` olarak migration sahibi bağlantısını girin. Render API'yi
başlatmadan önce bekleyen migration'ları kilit altında uygular; migration
başarısızsa yeni sürüm başlamaz.
`SESSION_SECRET`, `NOTIFICATION_WORKER_KEY` ve `NOTIFICATION_WEBHOOK_SECRET`
birbirinden farklı, en az 32 rastgele karakter olmalıdır. Üretimde `WEB_ORIGIN`
HTTPS olmalı ve `COOKIE_SECURE=true` kalmalıdır. API; eksik, yer tutucu veya
güvensiz üretim ayarlarında başlamayı reddeder.

Render için `TRUST_PROXY_HOPS=1` bırakılmalıdır; böylece yalnız platformun son
proxy katmanı güvenilir kabul edilir. `REQUEST_BODY_LIMIT_BYTES=1048576` ve
`REQUEST_TIMEOUT_MS=15000` API giriş kaynaklarını sınırlar. Altyapı zinciri
değişmeden proxy hop sayısı artırılmamalıdır.

API her yanıtla sunucu üretimli bir `x-request-id` döndürür. Destek ve olay
incelemesinde bu kimlik kullanılmalı; istemciden gelen istek kimliklerine
güvenilmemelidir. Üretim log seviyesi varsayılan olarak `LOG_LEVEL=info` kalır;
oturum, yetkilendirme ve webhook imza başlıkları merkezi olarak maskelenir.

Giriş endpoint'i istemci IP'si başına varsayılan olarak dakikada 5 denemeyle
sınırlıdır. `AUTH_LOGIN_RATE_LIMIT_MAX` ve `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS`
değerleri yalnız güvenli yapılandırma aralıklarında kabul edilir. Bilinmeyen
hesaplar da parola doğrulama maliyetini taşır ve hesap varlığına ilişkin ayrıntı
döndürülmez. Aynı sınır PostgreSQL'de IP ve normalize hesap için ayrı, anahtarlı
özet sayaçlarla da uygulanır; böylece API örnekleri veya süreç yeniden başlatmaları
arasında parola deneme bütçesi sıfırlanmaz. Ham IP ve e-posta değerleri saklanmaz.
Doğrulanmış bir giriş yalnız ilgili hesap sayacını aynı veritabanı işlemi içinde
sıfırlar; kaynak IP sayacı korunarak başarılı bir hesabın IP deneme bütçesini
yenilemesi engellenir. Hesap sayacı yalnız doğrulama sırasında görülen sürüm
değişmeden kaldıysa temizlenir; eşzamanlı yeni denemeler kaybolmaz.
Sayaç güncelleme sorgusunun karşılaştırmalı sıfırlama için gereken deneme sayısı
ve tam hassasiyetli pencere başlangıcını gerçekten döndürmesi regresyon testiyle
korunur. `Retry-After` yalnız gerçekten girişe engel olan sayaçların kalan
süresinden hesaplanır; engellememiş bir IP veya hesap penceresi kullanıcıya
gereksiz ek bekleme süresi yüklemez. Kaynak IP zaten engelliyse hesap sayacı
artırılmaz; yalnız daha uzun bir mevcut hesap kilidini bildirmek için salt okunur
kontrol edilir. Böylece engellenmiş tek bir IP farklı hesapların bütçesini tüketemez.

`/api` sınırındaki başarılı ve hatalı tüm yanıtlar `Cache-Control: no-store`
ile döner. Böylece oturum ve tenant verisi tarayıcıda, paylaşımlı önbellekte veya
ara proxy katmanında kalıcı olarak saklanmaz. Sağlık endpoint'leri bu API veri
sınırının dışında tutulur.

Korumalı her API isteğinde imzalı oturumdaki kullanıcı ve tenant kimliği mevcut
veritabanı üyeliğiyle yeniden doğrulanır. Devre dışı bırakılan kullanıcı veya
kaldırılan üyelik bir sonraki istekte reddedilir; rol değişikliği de yeni oturum
açılması beklenmeden güncel yetkilendirmeye yansır.

Tarayıcıdan gelen tüm durum değiştiren API istekleri özel CSRF başlığı ve, mevcutsa,
tam `WEB_ORIGIN` eşleşmesiyle doğrulanır. Provider webhook'ları ve anahtarla korunan
iç işçi endpoint'leri bu tarayıcı sınırından ayrı tutulur.

Provider webhook imzaları, JSON ayrıştırılıp yeniden oluşturulmadan önce alınan
değişmemiş istek gövdesi üzerinden doğrulanır. Böylece geçerli boşluk ve JSON
biçimlendirme farklılıkları imzayı bozmaz; ayrıştırılmış veri yine aynı şema ve
API gövde boyutu sınırından geçer. Callback'teki teslimat kimliği, teslimatın
kaydedilmiş provider profiline bağlanır; aynı provider'ın birden fazla kanalda
kullanılması veya profil rotasyonu yanlış secret seçimine yol açmaz. Daha önce
gönderilmiş bir teslimatın geçerli callback'i profil sonradan pasif olsa da
doğru kayıtlı profil üzerinden işlenir.
Callback'ler imza doğrulamasından sonra teslimat satırını kilitler ve terminal
durumu yalnız ileri taşır: `complained`, `bounced` ve `delivered` sırasıyla
azalan önceliktedir. Böylece gecikmiş veya eşzamanlı provider olayları şikâyet
ya da bounce durumunu yeniden delivered durumuna düşüremez. Olayların tamamı
idempotent denetim kaydında korunur; geçerli teslim zamanı en erken provider
zaman damgasıyla saklanır.
Aynı provider olay kimliği yalnız teslimat, olay türü, provider mesaj kimliği ve
olay zamanı da eşleşiyorsa güvenli tekrar kabul edilir. Aynı kimliğin farklı bir
çekirdek olay için yeniden kullanılması sessizce yutulmaz; veri bütünlüğü
çatışması olarak reddedilir ve mevcut teslimat kaydı değiştirilmez.
Provider olay zamanı teslimatın yaşam döngüsüyle sınırlandırılır: teslimatın
oluşturulmasından önceki veya kabul anının geleceğindeki zamanlara yalnız beş
dakikalık saat farkı toleransı verilir. Bu pencerenin dışındaki imzalı callback
teslimat durumunu, teslim zamanını veya analitik kayıtlarını değiştiremez.
Webhook route parametreleri veritabanı işlemi açılmadan önce doğrulanır. Tenant
kimliği zorunlu UUID, provider adı kayıt sözleşmesiyle aynı sınırlı slug olmalıdır;
geçersiz callback parametreleri tenant/RLS katmanına ulaşmadan güvenli biçimde
reddedilir.
Webhook zaman damgası ve imza biçimi de tenant veritabanı işlemi açılmadan önce
denetlenir. Eksik, biçimsiz veya beş dakikalık kabul penceresinin dışındaki imza
zarfları provider profili sorgulanmadan reddedilir; gerçek HMAC doğrulaması kayıtlı
provider secret'ıyla işlem içinde tamamlanır.
Webhook üretim sınırı ayrıca zaman damgasını kanonik Unix-saniye biçimiyle sınırlar
ve istek kabul anını imza ile olay zamanı kontrollerinde tek referans olarak kullanır.
Provider profili ve teslimat sorguları RLS'ye ek olarak açık tenant koşulları taşır.
Bir teslimata kaydedilmiş provider mesaj kimliği sonraki callback'lerle değiştirilemez.
Provider'a özel secret ortamda eksik veya zayıfsa callback imza hatası gibi kalıcı
biçimde reddedilmez; hiçbir olay yazılmadan `503` ve sınırlı `Retry-After` yanıtıyla
güvenli yeniden denemeye bırakılır.

Bildirim teslimat worker'ı her claim ve completion çağrısında etkin owner, admin
veya operator üyeliğini doğrular; iş kimlikleri ve sorgular RLS'ye ek olarak açık
tenant koşullarıyla bağlanır. Worker kesintisinden sonra süresi dolan lease başarısız
deneme olarak kaydedilir, üstel gecikmeyle yeniden kuyruğa alınır ve onuncu denemeyi
tüketmiş teslimat tekrar gönderilmeden iptal edilir. Completion yalnız geçerli,
tenant kapsamlı lease'i kapatabilir. Başarılı provider mesaj kimliği ilk completion'da
teslimata yazılır ve sonraki bir completion ile değiştirilemez.

Her giriş tenant kapsamlı benzersiz bir aktif oturum kaydı oluşturur. Korumalı
istekler imzalı belirtecin yanında bu kaydın süresini ve iptal durumunu da doğrular.
Logout yalnız mevcut oturumu sunucu tarafında iptal eder; kopyalanmış çerez yeniden
kullanılamaz ve kullanıcının diğer cihazlardaki aktif oturumları etkilenmez.
Süresi dolmuş veya iptal edilmiş oturum kayıtları varsayılan olarak 30 gün daha
saklanır ve başarılı girişlerde tenant kapsamlı, en fazla 200 kayıtlık batch'lerle
temizlenir. Aktif oturumlar hiçbir zaman bu temizlik kapsamına girmez.

> Gerçek kullanıcı verisi açılmadan önce seçilen PostgreSQL planında PITR ve
> restore provası ayrıca tamamlanmalıdır.
