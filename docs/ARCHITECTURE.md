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

Provider administration validates profile route identifiers as UUIDs before opening a
tenant database transaction. Malformed identifiers therefore remain bounded client errors
instead of reaching PostgreSQL casts. Provider list reads include an explicit tenant
predicate in addition to forced RLS, preserving defense in depth for administrative views.

Provider incident administration applies the same boundary to incident route identifiers.
Incident lists, joined provider profiles, incident-event history, lifecycle updates and
related notification updates all carry explicit tenant predicates in addition to forced
RLS, preventing administrative incident operations from depending on implicit connection
context alone.

## Production notification runtime

The notification runtime is a separate always-on process, not an in-process API timer.
It authenticates only with the shared notification worker key and discovers a bounded set
of tenant scopes through an internal endpoint. Scope discovery chooses one active owner,
admin or operator actor per tenant; every claim, completion and maintenance operation then
revalidates that actor in its tenant transaction.

Provider credentials remain in the worker environment. A claimed delivery exposes only
the validated environment-variable reference recorded on its pinned provider profile.
The worker resolves that reference locally, dispatches supported provider requests and
completes the existing tenant/worker/lease-bound lifecycle. Identical completion calls are
retried after transient API response loss; the API's receipt boundary rejects conflicting
replays.

Delivery polling and scheduled maintenance share a process but not a failure boundary.
A failed tenant claim does not stop later tenants. Provider health, archive, reconciliation,
overdue reminder and interrupted-run maintenance jobs use stable minute-bucketed keys and
are attempted independently. The runtime carries no database credential and cannot bypass
the API's actor, tenant, RLS or audit controls.

## Tenant onboarding and account access

Public tenant registration and invitation acceptance are capability-bound database
operations. They do not grant the application role general insert or update access to
tenant, user, membership or session tables. Each operation runs through a narrowly
granted security-definer function, establishes transaction-local tenant/user context
before touching forced-RLS tables, and creates the initial session atomically with the
account change.

Invitation links contain a tenant UUID plus 256 bits of random secret material. The
database stores only the SHA-256 digest. Preview and acceptance set the tenant context
from the link before reading the forced-RLS invitation row, then require the digest,
pending state and expiry to match. Acceptance locks the invitation and marks it used in
the same transaction that creates the user, membership, audit event and session.

Member deactivation is owner-only, cannot target the owner or acting user, and revokes
all active sessions for the target tenant in the same transaction. Reactivation restores
access without manufacturing a session; the user must authenticate again. Invitation
creation, cancellation, acceptance and access transitions produce tenant audit evidence.
