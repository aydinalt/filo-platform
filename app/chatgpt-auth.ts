import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
  authSource: "SITES_SIWC" | "SUPABASE";
  assuranceLevel: "aal1" | "aal2" | "workspace";
  signupAcceptance?: {contract:string;termsVersion:string;privacyVersion:string;acceptedAt:string};
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return getSupabaseUser();

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    displayName: fullName ?? email,
    email,
    fullName,
    authSource: "SITES_SIWC",
    assuranceLevel: "workspace",
  };
}

async function getSupabaseUser(): Promise<ChatGPTUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => {
        try { values.forEach(value => cookieStore.set(value.name, value.value, value.options)); }
        catch { /* Server Components may read but cannot always rotate cookies. */ }
      },
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const fullName = String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || "").trim() || null;
  const metadata=data.user.user_metadata||{},signupAcceptance={contract:String(metadata.filo_signup_contract||""),termsVersion:String(metadata.filo_terms_version||""),privacyVersion:String(metadata.filo_privacy_version||""),acceptedAt:String(metadata.filo_accepted_at||"")};
  return {
    email: data.user.email,
    displayName: fullName || data.user.email,
    fullName,
    authSource: "SUPABASE",
    assuranceLevel: assurance.data?.currentLevel === "aal2" ? "aal2" : "aal1",
    signupAcceptance,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
