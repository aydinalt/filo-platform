# Filo Platform V1 — Production Runbook

Bu runbook, v0.91 ile API, web paneli ve sürekli bildirim worker'ını kontrollü pilot
ortamında açmak için uygulanacak sırayı tanımlar.

## 1. Zorunlu altyapı

- Vercel üzerinde `apps/web` kök dizinli web paneli.
- Render Blueprint üzerinden `filo-api` web servisi.
- Render Blueprint üzerinden `filo-notification-worker` background worker servisi.
- Transaction-mode pooler davranışı doğrulanmış PostgreSQL.
- Migration sahibi için `DATABASE_ADMIN_URL`, BYPASSRLS olmayan uygulama rolü için
  `DATABASE_URL`.

Background worker sürekli compute gerektirir. Ücretsiz web servisinin uyku davranışı
teslimat ve zamanlayıcı güvenilirliği için kullanılamaz.

## 2. Blueprint secret ve ayarları

`filo-runtime-secrets` environment group, API ve worker'a aynı
`NOTIFICATION_WORKER_KEY` ile `NOTIFICATION_WEBHOOK_SECRET` değerlerini verir. Bu
değerleri servis bazında ikinci kez tanımlamayın.

API servisinde:

- `DATABASE_URL`
- `DATABASE_ADMIN_URL`
- `WEB_ORIGIN`
- `SESSION_SECRET` (Blueprint üretir)

Worker servisinde:

- `WORKER_API_URL`: gerçek API HTTPS origin'i
- `EMAIL_FROM`: Resend'de doğrulanmış gönderen adresi
- `FILO_EMAIL_PROVIDER_KEY`: gerçek Resend API anahtarı

`WORKER_ALLOW_DRY_RUN` üretimde `false` kalmalıdır. Sağlayıcı anahtarını repoya,
provider profil kaydına veya commit içeriğine yazmayın.

## 3. E-posta provider profili

Owner/Admin panelinde aşağıdaki profili oluşturun:

| Alan | Değer |
| --- | --- |
| Kanal | `email` |
| Provider | `resend` |
| Credential env ref | `FILO_EMAIL_PROVIDER_KEY` |
| Durum | `active` |

Profil yalnız ortam değişkeninin adını taşır. Gizli değer yalnız worker servisinde
bulunur. Pilot sırasında desteklenmeyen push kanalını kullanıcı tercihlerinde kapatın.

## 4. Dağıtım kontrolü

1. Migration deploy adımının başarıyla tamamlandığını doğrulayın.
2. `GET /health/live` yanıtının `200` olduğunu doğrulayın.
3. `GET /health/ready` yanıtının veritabanı bağlıyken `200` olduğunu doğrulayın.
4. Worker logunda `notification runtime started` kaydını doğrulayın.
5. Worker'ın tenant scope sayısını hata vermeden okuyabildiğini doğrulayın.
6. Kontrollü test bildirimi üretin ve delivery kaydının `delivered` durumuna geçtiğini
   doğrulayın.
7. Resend panelindeki mesaj kimliğiyle delivery provider message ID'sini eşleştirin.
8. Yanlış API anahtarıyla test ortamında bounded `PROVIDER_REJECTED` veya
   `PROVIDER_CONFIG_MISSING` sonucunun oluştuğunu doğrulayın.

## 5. Onboarding ve erişim kontrolü

1. Boş test veritabanında `Yeni firma` akışıyla bir tenant ve owner oluşturun.
2. Aynı firma adresi ve e-posta ile ikinci kayıt denemelerinin `409` verdiğini doğrulayın.
3. Owner hesabından operator daveti oluşturun; bağlantının yalnız ilk yanıtta göründüğünü
   ve veritabanında yalnız token özetinin bulunduğunu doğrulayın.
4. Daveti ayrı tarayıcı oturumunda kabul edin; ikinci kullanımın ve iptal edilmiş davetin
   `410` verdiğini doğrulayın.
5. Operator erişimini kapatın; açık oturumun sonraki API isteğinde reddedildiğini doğrulayın.
6. Erişimi yeniden açın ve kullanıcının mevcut parolasıyla yeniden giriş yapabildiğini
   doğrulayın.
7. `tenant.onboarded`, `member.invitation_created`, `member.invitation_accepted`,
   `member.access_disabled` ve `member.access_enabled` audit kayıtlarını kontrol edin.

Arayüzdeki `terms-v1` ve `privacy-v1` kabul sürümleri, hukuk/KVKK sahibi tarafından
onaylanmış ve kullanıcıya erişilebilir gerçek metinlerle eşleştirilmeden dış kullanıcı
kaydı açılmamalıdır. v0.91 kabul kanıtını saklar; hukuki metnin kendisini üretmez.

## 6. Hesap kurtarma ve oturum güvenliği

1. Kayıtlı bir kullanıcı için `Parolamı unuttum` isteği oluşturun ve endpoint'in `202`
   döndüğünü doğrulayın.
2. Aynı isteği kayıtlı olmayan bir adresle yapın; yanıt gövdesinin ve durumunun aynı
   kaldığını doğrulayın.
3. Worker'ın kurtarma e-postasını Resend üzerinden teslim ettiğini ve teslimat kaydındaki
   bağlantının gönderim sonrası redakte edildiğini doğrulayın.
4. Bağlantıyla parolayı yenileyin; ikinci kullanımın ve 30 dakikayı aşan bağlantının
   `410` verdiğini doğrulayın.
5. Parola sıfırlama öncesinde açılmış tüm oturumların sonraki istekte reddedildiğini
   doğrulayın.
6. `Hesap Güvenliği` ekranında parola değiştirin; yalnız mevcut oturumun kaldığını ve
   başka bir oturumun tek tek kapatılabildiğini doğrulayın.
7. `account.password_reset_requested`, `account.password_reset_completed`,
   `account.password_changed` ve `account.session_revoked` audit kayıtlarını kontrol edin.

## 7. Pilot açılış kapıları

- PostgreSQL PITR özelliği açık ve sağlayıcı ekran görüntüsü/kanıtı kayıtlı.
- Boş bir veritabanına restore provası tamamlanmış ve süre kaydedilmiş.
- Worker en az 24 saat kesintisiz çalışmış.
- Test bildirimi, retry ve provider rate-limit senaryoları kanıtlanmış.
- Web/API origin, secure cookie ve secret kontrolleri production modunda geçmiş.
- Firma kaydı, davet kabulü, davet iptali ve oturum iptali saha provası tamamlanmış.
- Parola kurtarma e-postası, tek kullanımlılık ve tüm oturumları kapatma provası tamamlanmış.
- KVKK metinleri, telefon sahipliği ve çalışan bilgilendirme akışı onaylanmış.
- Mobil arka plan konum takibi gerçek cihaz pilotu tamamlanmadan kesintisiz takip
  vaadi verilmemiş.

Bu kapılar tamamlanmadan gerçek kullanıcı veya sürekli saha verisi açılmaz.
