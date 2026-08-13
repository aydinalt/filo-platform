# Filo Platform V1 — Production Runbook

Bu runbook, v0.93 ile API, web paneli, yerel sürücü uygulaması ve sürekli bildirim worker'ını kontrollü pilot
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
kaydı açılmamalıdır. v0.93 kabul kanıtını saklar; hukuki metnin kendisini üretmez.

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

## 7. Yerel sürücü uygulaması ve arka plan konumu

1. Mobil build ortamında `EXPO_PUBLIC_API_URL` değerini production API HTTPS origin'ine ayarlayın.
2. Web panelinde aktif atama için kayıt kodu üretin; kodu 15 dakika içinde fiziksel telefonda bir kez kullanın.
3. Aynı kodun ikinci kullanımının ve iptal edilmiş kodun `410` verdiğini doğrulayın.
4. Aynı atamaya ikinci telefon kaydedin; ilk telefon erişiminin sonraki istekte `401` aldığını doğrulayın.
5. iOS'ta `Always`, Android'de arka plan konum iznini verin; aktif vardiya olmadan takibin başlayamadığını doğrulayın.
6. Telefon ekranını kapatıp uygulamayı arka plana alın; en az 60 dakikalık rota boyunca konumların devam ettiğini doğrulayın.
7. Uçak modunda en az 20 nokta biriktirin; bağlantı geldiğinde noktaların kronolojik ve tekrarsız aktarıldığını doğrulayın.
8. Web panelinden kaydı iptal edin; telefonun yeni konum gönderemediğini doğrulayın.
9. Android OEM pil optimizasyonu ve iOS uygulama sonlandırma davranışını pilot cihaz modelinde ayrıca kaydedin.
10. `Telefon Takibi > Saha cihaz sağlığı` tablosunda heartbeat, izin, pil, ağ ve kuyruk değerlerini doğrulayın.
11. Uygulamayı 10 dakikadan uzun süre ağsız bırakıp cihazın `Çevrimdışı`; en eski kuyruk noktası 5 dakikayı aşınca `Kuyruk gecikiyor` durumuna geçtiğini doğrulayın.
12. Bağlantıyı geri açın; otomatik eşitleme sonrası kuyruk sayısının sıfıra ve cihazın sağlıklı duruma döndüğünü doğrulayın.
13. Firma politikasında minimum sürümü mevcut uygulamanın üstüne çıkarın; yeni vardiya ve konum paketinin `423` ile reddedildiğini doğrulayın.
14. Minimum sürümü yeniden uygun değere alın; cihazın yeni politika kontrolünden sonra vardiya başlatabildiğini doğrulayın.
15. Cihaza `Şimdi eşitle` komutu gönderin; komutun panelde `acknowledged` ve `QUEUE_FLUSHED` ya da `QUEUE_REMAINS` kanıtıyla kapandığını doğrulayın.
16. Cihaza `Takibi durdur` komutu gönderin; işletim sistemi arka plan görevinin kapanmasını, cihaz pilot kilidinin kalıcı olmasını ve yeni konumun reddedilmesini doğrulayın.
17. `Takibi yeniden aç` komutunu gönderin; önceki bekleyen durdurma komutunun `SUPERSEDED` olarak kapanmasını ve sürücünün takibi yeniden başlatabildiğini doğrulayın.
18. Firma genelinde acil durdurmayı etkinleştirin; tüm pilot cihazların belirlenen heartbeat aralığında durduğunu ve API'nin istemci davranışından bağımsız olarak veri kabul etmediğini doğrulayın.
19. Saha cihaz sağlığı tablosundan cihaz için yeni pilot başlatın; aynı cihazda ikinci aktif pilotun `409` ile engellendiğini doğrulayın.
20. Arka plan izni verip vardiyayı başlatın; `Arka plan izni`, `Çevrimiçi heartbeat` ve `Arka plan konumu` kanıtlarının otomatik oluştuğunu doğrulayın.
21. Uçak modunda konum biriktirip heartbeat gönderebilecek bağlantıya dönün; `Çevrimdışı kuyruk` kanıtının oluştuğunu doğrulayın.
22. Kuyruğu tamamen eşitleyin; `Bağlantı sonrası eşitleme` kanıtı ve sıfır bekleyen konum durumunu doğrulayın.
23. `Şimdi eşitle` veya güvenli durdurma komutunu cihazda uygulayın; `Uzaktan komut kanıtı` tamamlandıktan sonra sayacın 6/6 olduğunu doğrulayın.
24. Eksik kanıtlı pilotta `Geçti` kararının engellendiğini, 6/6 pilotta owner/admin kararının audit kaydı ve indirilen CSV ile eşleştiğini doğrulayın.
25. v0.96 uygulamasını bir iPhone ve iki farklı Android/OEM modeline kaydedin; üretici/model alanlarının otomatik ve doğru geldiğini doğrulayın.
26. Üç cihazda da yeni v0.96 pilotu açıp 6/6 kanıtla `Geçti` kararı verin; eski sürüm veya aynı Android modelinin matrisi tamamlamadığını doğrulayın.
27. Owner hesabında üretim onayının yalnız `1/1 iPhone`, `2/2 Android` ve `2/2 farklı Android/OEM` ile açıldığını doğrulayın.
28. Onay CSV’sini indirin; sürüm, cihaz matrisi ve pilot kimliklerinin ekrandaki snapshot ile eşleştiğini doğrulayın.
29. Onayı gerekçeyle geri çekin; durumun audit kaydına geçtiğini ve aynı sürüm için yeni owner onayı gerektiğini doğrulayın.
30. v0.97 üretim onayından sonra owner hesabıyla rollout planı oluşturun; onaysız veya aynı sürüm için ikinci planın `409` aldığını doğrulayın.
31. Taslak planı başlatın; küçük filoda en az bir cihazın, daha büyük filoda kararlı hash sırasının ilk %10'unun seçildiğini doğrulayın.
32. Seçili cihazlardan hedef sürüm heartbeat’i gelmeden %25 aşamasına ilerlemenin engellendiğini doğrulayın.
33. Seçili cihazda izin/takip hatası oluşturup sağlıksız oranını eşik üstüne çıkarın; ilerlemenin sağlık snapshot'ıyla reddedildiğini doğrulayın.
34. Sağlık kapısını düzelttikten sonra sırasıyla %25, %50 ve %100'e ilerleyin; aşama atlamanın engellendiğini doğrulayın.
35. Rollout'u duraklatıp devam ettirin; her owner kararının gerekçesi, yüzdesi ve anlık sağlık ölçümünün olay/audit kayıtlarında eşleştiğini doğrulayın.
36. Geri alma işlemini uygulayın; planın `rolled_back` kapandığını, önceki kararlı sürümün kayıtlı kaldığını ve pilot/onay kanıtlarının silinmediğini doğrulayın.
37. v0.98 rollout'unu `auto_rollback` ve üç ardışık ihlal eşiğiyle oluşturup worker zamanlayıcısının guard çalışmasını doğrulayın.
38. Seçili cihazda hedef sürüm heartbeat'ini kesin veya takip hatası üretin; ilk guard çalışmasında rollout'un otomatik `paused` olduğunu doğrulayın.
39. Aynı scheduler anahtarını tekrar gönderin; ikinci bir değerlendirme/olay oluşmadığını ve idempotent yanıt döndüğünü doğrulayın.
40. İhlali üç ardışık benzersiz guard çalışmasına taşıyın; olayın `critical`, rollout'un `rolled_back` olduğunu ve otomatik karar audit kaydını doğrulayın.
41. Açık yayın olayını owner olarak kabul edin; kök nedeni giderip çözüm notuyla kapatın ve zaman/aktör kanıtlarını doğrulayın.
42. Sağlık eşik içine döndüğünde sayaç sıfırlansa da otomatik devam edilmediğini; yeniden başlatmanın owner kararı gerektirdiğini doğrulayın.

## 8. Pilot açılış kapıları

- PostgreSQL PITR özelliği açık ve sağlayıcı ekran görüntüsü/kanıtı kayıtlı.
- Boş bir veritabanına restore provası tamamlanmış ve süre kaydedilmiş.
- Worker en az 24 saat kesintisiz çalışmış.
- Test bildirimi, retry ve provider rate-limit senaryoları kanıtlanmış.
- Web/API origin, secure cookie ve secret kontrolleri production modunda geçmiş.
- Firma kaydı, davet kabulü, davet iptali ve oturum iptali saha provası tamamlanmış.
- Parola kurtarma e-postası, tek kullanımlılık ve tüm oturumları kapatma provası tamamlanmış.
- KVKK metinleri, telefon sahipliği ve çalışan bilgilendirme akışı onaylanmış.
- iOS ve en az iki Android/OEM cihazda 60 dakikalık arka plan rota pilotu tamamlanmış.
- Uçak modu kuyruğu, yeniden bağlantı eşitlemesi, credential rotasyonu ve uzaktan iptal kanıtlanmış.
- Heartbeat, çevrimdışı cihaz, izin kaybı, düşük güç modu ve geciken kuyruk sinyalleri panelde kanıtlanmış.
- Firma acil durdurma, minimum sürüm kapısı, cihaz durdurma/yeniden açma ve komut onayı fiziksel cihazlarda kanıtlanmış.
- Her pilot cihaz için 6/6 sunucu kanıtlı pilot kaydı, owner/admin kararı ve CSV özeti arşivlenmiş.
- Aynı sürümde 1 iPhone + 2 farklı Android/OEM pilot matrisi tamamlanmış ve owner üretim onayı arşivlenmiş.
- Owner kontrollü %10→%25→%50→%100 rollout, sağlık eşiği, duraklatma ve geri alma provası tamamlanmış.
- Worker otomatik duraklatma/geri alma, idempotent guard ve owner olay çözüm provası tamamlanmış.

Bu kapılar tamamlanmadan gerçek kullanıcı veya sürekli saha verisi açılmaz.
