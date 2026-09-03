import {
  createDemoSession,
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_MAX_AGE_SECONDS,
  verifyDemoCredentials,
  type DemoAuthEnvironment,
} from "../../../lib/demo-auth";
import { runtimeEnv } from "../../../lib/platform-store";
import { apiErrorResponse } from "../../../lib/api-errors";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";

export const dynamic = "force-dynamic";

type DemoRuntime = DemoAuthEnvironment & { DB: D1Database };

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    assertRequestSize(request, 16 * 1024);
    const env = runtimeEnv() as DemoRuntime;
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action || "login");
    if (action === "logout") {
      return Response.json({ ok: true }, { headers: { "Set-Cookie": expiredCookie(request) } });
    }
    await enforceRateLimit(env.DB, request, "demo-auth", 12, 60, "anonymous");
    const account = await verifyDemoCredentials(env, String(payload.username || ""), String(payload.password || ""));
    if (!account) return Response.json({ error: "Kullanıcı adı veya şifre geçersiz." }, { status: 401 });
    const token = await createDemoSession(env, account);
    if (!token) return Response.json({ error: "Demo giriş üretim ortamında yapılandırılmamış." }, { status: 503 });
    return Response.json(
      { ok: true, account: { username: account.username, name: account.name } },
      { headers: { "Set-Cookie": sessionCookie(request, token) } },
    );
  } catch (error) {
    return apiErrorResponse(error, "Demo girişi tamamlanamadı.");
  }
}

function sessionCookie(request: Request, value: string): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${DEMO_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DEMO_SESSION_MAX_AGE_SECONDS}${secure}`;
}

function expiredCookie(request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${DEMO_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
