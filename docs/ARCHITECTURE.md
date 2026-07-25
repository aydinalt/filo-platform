# İlk güvenli dikey dilim

Bu sürüm bilinçli olarak beş parçayla sınırlıdır:

1. Tenant ve ilk yönetici üyeliği
2. HttpOnly cookie tabanlı imzalı oturum
3. Araç listeleme ve araç oluşturma API'si
4. PostgreSQL Row-Level Security
5. Değiştirilemez audit olayı

## Güvenlik sınırı

İstemci `tenantId` göndermez. API, tenant ve kullanıcı kimliğini doğrulanmış
oturumdan alır. Her tenant sorgusu açık transaction içinde `set_config(...,
true)` kullanır; üçüncü parametrenin `true` olması PostgreSQL'de `SET LOCAL`
anlamına gelir. Bağlam commit/rollback sonrasında pool bağlantısında kalmaz.

Uygulama bağlantısı `filo_app` rolüyle kurulur. Migration ve seed bağlantısı
ayrı `DATABASE_ADMIN_URL` üzerinden yürür. Üretimde bu iki URL aynı kullanıcıyı
kullanmamalıdır.

## v0.4 operasyon durumu

Atama, vardiya ve takip durumu ayrı tablolardır. Konum koordinatı henüz
toplanmaz; bu dilim yalnız izin ve takip yaşam döngüsünü güvenli biçimde kurar.
İzin reddedildiğinde veya geri çekildiğinde veritabanı ve API takibin aktif
kalmasına izin vermez.

## Henüz kapsamda olmayanlar

Gerçek konum noktası toplama, sürücü mobil uygulaması, public firma sayfası,
CRM, teklif, özel alan adı ve ödeme yoktur. Bunlar ayrı dikey dilimlerdir.
