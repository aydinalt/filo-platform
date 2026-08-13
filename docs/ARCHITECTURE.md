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

## V1 dışındaki ürünler

Public firma sayfası, CRM, teklif, özel alan adı ve ödeme bu uygulama diliminde yoktur.
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

## Account recovery and session security

Password recovery returns the same accepted response for known and unknown email addresses
and has a dedicated hourly rate limit plus a minimum response duration. A known account gets
a tenant-bound 256-bit capability whose SHA-256 digest is stored in a forced-RLS table. The
capability is single-use, expires after 30 minutes and is invalidated when a newer request is
created.

Recovery mail uses the existing leased production delivery worker. It is classified as a
transactional account-recovery delivery, so optional notification preferences cannot block
it; provider bounce and complaint suppression still applies. The temporary link is retained
only while dispatch can still succeed and is redacted after delivery, password completion,
operator cancellation, recipient deactivation or expiry.

Reset completion locks the capability, changes the password and revokes every active user
session atomically. Authenticated password change verifies the current password, preserves
the current session and revokes all other sessions. Users can list only their own live
tenant sessions and revoke non-current sessions. Each security transition creates tenant
audit evidence.

## Native mobile background tracking

The driver application is a separate Expo runtime for iOS and Android. A browser session
never becomes a mobile credential. An authenticated operational user creates a random,
15-minute, single-use enrollment capability for one active assignment. The database stores
only its SHA-256 digest. Claiming the capability locks it, rotates any earlier credential
for the assignment, and returns a separate 256-bit credential once.

Mobile authentication crosses RLS only through narrowly granted security-definer functions.
Every accepted credential is assignment-bound, expires after 90 days, can be revoked from
the web panel, and resolves back to a tenant plus the issuing operational actor before a
tenant transaction starts. Raw enrollment and access secrets are never persisted.

The app requires always-location permission before background tracking can start. Location
collection is allowed only while the bound assignment has an active shift and server tracking
state is `tracking`. Offline points remain in a bounded device queue, are sent chronologically
in batches of at most 100, and retain stable UUID event identities so API retries are
idempotent. Geofence and speeding evaluation reuse the same tenant-scoped ingestion path as
foreground web points.

## Mobile pilot reliability and diagnostics

Mobile health is based on explicit heartbeats, never generic authenticated activity. Each
heartbeat is schema-bounded and updates only the active credential inside the resolved
tenant transaction. The latest application/OS version, battery and low-power state,
network type, permission, tracking state, queue depth, oldest queued point and last bounded
error are retained; raw secrets and arbitrary device payloads are not accepted.

The operational panel reads active credentials with an explicit tenant predicate in
addition to forced RLS. Health is classified server-side: no heartbeat is `never_seen`,
signals older than ten minutes are `offline`, permission/runtime failures take precedence,
and queues older than five minutes are `delayed`. Successful location batches record the
last sync and last location time. The mobile runtime sends periodic and event-driven
heartbeats and retries its idempotent queue when connectivity returns. Queue writes are
serialized locally, and successful sync removes only acknowledged event identities so a
location collected during an in-flight request cannot be overwritten by an older snapshot.

## Mobile pilot remote safety controls

Tenant mobile policy and device commands are separate forced-RLS records. Owners and admins
can stop tracking tenant-wide, require an exact three-part minimum application version and
bound the heartbeat interval. Operators can send a device-specific pause or queue-sync
command; a later resume command clears the persistent device pilot lock. Opposing pending
pause/resume commands are cancelled atomically so a device never receives contradictory
control intent.

The mobile runtime fetches policy and pending commands with its assignment-bound credential,
stops the operating-system background task before acknowledging a pause, and returns only a
bounded result code. A command remains visible as pending until the device acknowledges it.
Server-side shift start and location ingestion independently recheck the tenant policy,
minimum version and persistent device pilot lock. The mobile client therefore cannot bypass
an emergency stop by ignoring its local instruction. Every policy, command and acknowledgement
transition creates tenant-scoped audit evidence.

## Physical-device pilot evidence gate

Pilot qualification is a first-class tenant record bound to one active mobile
credential. A partial unique index permits only one running pilot per device. Evidence
is written only inside the already resolved tenant transaction and is deduplicated by
run plus evidence type while retaining first/last observation and a bounded source
summary. The API never accepts an operator-supplied “evidence complete” boolean.

The six mandatory categories are always-location permission, error-free online
heartbeat, authenticated background location ingestion, observed offline queue,
successful queue recovery and acknowledged remote control. Completion re-reads these
records in the same tenant boundary; a pass is rejected until all six exist. Failure
and cancellation do not bypass or alter collected evidence. Start and decision events
are auditable, and the CSV report is generated from the same server-side records shown
in the operational panel.

## Multi-device pilot cohort and production approval

Enrollment records a bounded manufacturer/model label reported by the native device
runtime. A successful pilot decision copies the current application version and device
identity into the pilot run, so later application upgrades or credential changes cannot
rewrite qualification history. Older passed runs without this decision-time snapshot do
not count toward a production cohort.

The release assessor filters passed runs by the exact target version and requires one
iOS result, two Android results and two distinct normalized Android manufacturer/model
fingerprints. The same pure assessment is used by the read view and owner approval
transaction. Approval takes a tenant/version advisory lock, recomputes readiness and
stores the full eligible device matrix as JSON. A database trigger makes the version,
notes, approver, approval time and snapshot immutable; only an explicit owner revocation
can close it. The unique partial index permits one active approval per tenant/version.

## Staged mobile release rollout

A rollout can be created only for an active owner-approved physical pilot release.
One tenant/version pair has one rollout record. Active mobile credentials are ranked by
a SHA-256-derived stable bucket and credential identity; the first stage still selects at
least one device in a small fleet. Expanding from 10 to 25, 50 and 100 percent preserves
the earlier cohort instead of reshuffling devices.

The server assesses only selected devices reporting the exact target version. Healthy and
idle runtimes are operational; offline, delayed, permission and tracking failures count
against the bounded unhealthy percentage. Advancement is sequential and rejected unless
every selected device has a target-version heartbeat and the unhealthy rate is at or below
the rollout threshold. Completion applies the same gate at 100 percent.

Owner transitions lock the rollout row, recheck the active production approval and append
the observed health snapshot to a separate forced-RLS event table. Start, advance, pause,
resume, completion and rollback are tenant-audited. Rollback closes the plan while retaining
its stable-device assignments and full decision history; it never deletes qualification or
production approval evidence.

## Automated rollout guard and release incidents

The always-on worker evaluates each active rollout through an authenticated internal route
using tenant and actor scopes already resolved for scheduled maintenance. A tenant/run key
advisory lock plus a forced-RLS guard-run ledger makes each scheduler bucket idempotent.
Health is recomputed from current active credentials with the same stable cohort assignment
and exact-version rules used by manual advancement.

Guard mode is bounded to manual observation, automatic pause, or automatic rollback. An
unhealthy active rollout is paused on its first automatic breach. In rollback mode the guard
continues evaluating only guard-paused plans and closes the rollout as rolled back after the
configured two-to-five consecutive breaches. Recovery resets the counter and appends evidence
but never silently resumes a paused deployment. Owner control therefore remains explicit.

One active incident per tenant and rollout aggregates repeated violations, promotes severity
to critical at rollback threshold and retains the latest bounded health snapshot. Owners may
acknowledge an open incident or resolve an open/acknowledged incident with mandatory notes.
Incident, rollout and scheduler-run tables use forced RLS; automatic transitions and owner
handling also create tenant audit events.
