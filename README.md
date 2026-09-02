# Filo Platform v1.28.20

> Filo Platform now has a dual deployment contract: the existing Sites/Cloudflare runtime remains supported, and `vercel.json` plus `supabase/` provide the Vercel + Supabase target. See [Vercel + Supabase deployment](docs/VERCEL_SUPABASE_DEPLOYMENT.md).

For the Supabase target, `npm run supabase:apply` transactionally applies and verifies migrations, `supabase test db` exercises two-tenant RLS boundaries, and Supabase Cron/Vault owns the signed 15-minute operations schedule so Vercel Hobby does not require an unsupported frequent cron.

v1.28.20 closes remaining bypass and scale risks after v1.28.19: environment
flags are case-safe, provider mutations require AAL2/MFA, signup consent is
verified server-side, operations scheduling rotates fairly across tenants, and
final evidence rejects symlink escapes while enforcing separation of duties. See
[`docs/v1.28.20-critical-completion.md`](docs/v1.28.20-critical-completion.md).

The production source includes the web application, Supabase/PostgreSQL
migrations, a locked Expo mobile-driver application, and a locked telematics
gateway service. Cloudflare Sites/Vinext and Vercel/Supabase remain separately
verified deployment targets.

## Prerequisites

- Node.js `>=22.13.0`
- Windows, Linux or macOS; the maintained lifecycle helpers run with Node.js and do not require Bash/WSL
- PowerShell 7 or Windows PowerShell 5.1 only when creating Windows release ZIPs

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, bounded `npm ci`. It refuses a concurrent install for the same project, uses the lockfile integrity contract and project-local npm cache, limits npm to one socket, and terminates a stalled install. `build` applies a bounded timeout and validates the Sites artifact. Both helpers are maintained as platform-independent Node scripts.

Scripts that need writable project-scoped npm, XDG and temporary paths use `scripts/run-tool.mjs`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler state inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git. The `.sh` files under `scripts/` remain compatibility entrypoints for external Linux automation and delegate to the maintained Node/npm commands.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Workspace identity headers are accepted only in the Sites/Cloudflare runtime.
When `FILO_RUNTIME=supabase`, the application ignores all `oai-authenticated-*`
headers and resolves identity exclusively from the verified Supabase session.

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build and validate the deployable Sites artifact
- `npm run start`: start the built Vinext application; Sites D1/R2 bindings are supplied by hosting, while local binding-aware checks use `npm run dev`
- `npm test`: build, validate, and verify the rendered development-preview metadata
- `npm run validate:artifact`: recheck an existing artifact's manifest and ESM `default.fetch` export
- `npm run build:vercel`: verify the Vercel/Supabase Next.js target
- `npm run supabase:runtime:test`: exercise the real PostgreSQL compatibility adapter (requires `PG*` connection variables)
- `npm run typecheck --prefix mobile-driver` and `npm run doctor --prefix mobile-driver`: verify the locked Expo application
- `npm test --prefix services/telematics-gateway`: verify the locked gateway service
- `npm run sbom`: generate CycloneDX SBOMs for all three shipped components
- `npm run release:package`: create full-source and update ZIPs from a clean, manifested commit
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build and validation commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
