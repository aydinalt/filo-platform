# Vercel + Supabase deployment

This repository supports two explicit runtime targets without mixing tenant data:

- Sites/Cloudflare uses the existing D1 and R2 bindings.
- Vercel uses Next.js Node functions, Supabase PostgreSQL/PostGIS, Supabase Auth and a private Storage bucket.

## Provisioning order

1. Create a Supabase project in the legally approved data region.
2. Run `npm run supabase:migration`, set `SUPABASE_DATABASE_URL`, then run `npm run supabase:apply`. This applies pending migrations transactionally and verifies RLS, grants, the private bucket and scheduler without printing secrets.
3. Run `supabase test db`. The pgTAP suite uses two tenant identities and verifies RLS, anonymous denial, tenant visibility and server-only business-table writes.
4. Configure the private `filo-private` bucket. Never make evidence, custody, invoice or identity documents public.
5. Create a Vercel project from the repository and configure the variables listed in `.env.example`.
6. Set `FILO_RUNTIME=supabase` and `SUPABASE_CRON_MODE=PG_CRON` only on Vercel. Keep both unset on Sites/Cloudflare.
7. Set the production Auth site URL and allow only the production `/auth/callback` redirect. Require e-mail confirmation, custom SMTP, Turnstile CAPTCHA, a minimum 10-character password, reviewed Auth e-mail rate limits and TOTP MFA. Set `PRIVILEGED_MFA_REQUIRED=true`; privileged mutations require Supabase AAL2. Mirror these controls in the `SUPABASE_AUTH_*` evidence variables so production preflight can fail closed.
8. In the Supabase SQL editor, run the following once as project owner. The helper stores the endpoint and bearer in Vault and schedules the signed job every 15 minutes:

   ```sql
   select public.configure_operations_tick(
     'https://YOUR-PRODUCTION-DOMAIN/api/system/operations-tick',
     'THE-SAME-32-PLUS-CHARACTER-OPERATIONS_CRON_SECRET'
   );
   ```

   Confirm `filo-operations-quarter-hour` in Supabase Cron and inspect `net._http_response` after the first run. Use `select public.disable_operations_tick();` before changing providers or secrets.
   Configure `OPERATIONS_ALERT_EMAILS` with one or more real on-call recipients and keep `BROWSER_TELEMETRY_ENABLED=false` in production.
9. Run `npm run build:vercel`, `npm test`, `supabase test db`, `npm run supabase:verify` and the strict production preflight before assigning a customer.

## Runtime boundaries

- Next.js Route Handlers own normal CRM, fleet, billing and administration requests.
- Supabase PostgreSQL is the durable source of truth. Business tables and private Storage are server-only; browser roles have no direct CRUD grants and tenant RLS remains enabled as defense in depth. The browser talks directly to Supabase only for Auth.
- Server-side database access uses the Supabase transaction pooler. The service-role and database credentials are server-only.
- Supabase Storage stores private evidence and document bytes; the database stores their tenant ownership and integrity metadata.
- Phone telemetry may use HTTPS during the controlled pilot. Raw TCP/MQTT hardware devices and sustained high-frequency ingestion remain in the dedicated gateway/ingestion service.
- Supabase pg_cron + pg_net invokes the authenticated operations tick every 15 minutes and keeps its URL and bearer in Vault. It does not replace a durable queue or high-frequency telemetry worker.

## Go-live blockers

No deployment is production-ready merely because Vercel and Supabase are connected. Legal publisher identity, approved location notices, independent security testing, restore evidence, real phone/OEM field tests, provider callbacks and the controlled rollout gates remain mandatory.
