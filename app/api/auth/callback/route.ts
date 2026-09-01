import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const candidate = requestUrl.searchParams.get("next") || "/";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN;
  const trustedOrigin = (() => {
    try { const value = new URL(configuredOrigin || requestUrl.origin); return value.protocol === "https:" || process.env.NODE_ENV !== "production" ? value.origin : requestUrl.origin; }
    catch { return requestUrl.origin; }
  })();
  const response = NextResponse.redirect(new URL(next, trustedOrigin));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!code || !url || !key) return NextResponse.redirect(new URL("/?auth=configuration", trustedOrigin));
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.headers.get("cookie")?.split(";").map(item => {
        const [name, ...rest] = item.trim().split("=");
        return { name, value: rest.join("=") };
      }) || [],
      setAll: cookies => cookies.forEach(cookie => response.cookies.set(cookie.name, cookie.value, cookie.options)),
    },
  });
  const { error } = await client.auth.exchangeCodeForSession(code);
  return error ? NextResponse.redirect(new URL("/?auth=failed", trustedOrigin)) : response;
}
