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
## Notification provider rotation

Provider activation is serialized per tenant and channel with a transaction-scoped
PostgreSQL advisory lock. A rotation first verifies and locks the target profile in
the same tenant/channel, deactivates the displaced active profile, activates the
target, and writes one audit event in the same transaction. Delivery rows retain
their selected `provider_profile_id`; retries therefore use the originally selected
credential reference while unassigned deliveries resolve the currently active profile.

All provider status transitions reread and row-lock the target after acquiring the
tenant/channel advisory lock. Replayed requests for the current status are no-ops, and
audit events are emitted only for transitions based on the locked current state.

Provider creation uses the same tenant/channel lock. Creating an active profile captures
the displaced active profile identifiers and records both creation and rotation evidence
inside the transaction; creating an inactive profile records creation only. Known provider
name and single-active uniqueness conflicts are returned as bounded conflicts, while
unrelated database failures remain server errors. The created profile response is loaded
with an explicit tenant predicate in addition to RLS.
