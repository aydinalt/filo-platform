export type DemoAuthEnvironment = {
  APP_ENV?: string;
  FILO_DEMO_AUTH_ENABLED?: string;
  FILO_DEMO_SESSION_SECRET?: string;
};

export type DemoAccount = {
  username: "demo1" | "demo2";
  email: string;
  name: string;
};

export const DEMO_SESSION_COOKIE = "filo_demo_session";
export const DEMO_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const LOCAL_DEMO_SECRET = "filo-local-demo-session-key-only-for-development-v1";
const DEMO_ACCOUNTS: Record<DemoAccount["username"], DemoAccount & { passwordHash: string }> = {
  demo1: {
    username: "demo1",
    email: "demo1@demo.filo.local",
    name: "DEMO YETKİLİ KULLANICI",
    passwordHash: "75fc3e526758bb67c14cb377782c09ee6c535b08f094b9e58e14d71c66ec5934",
  },
  demo2: {
    username: "demo2",
    email: "demo2@demo.filo.local",
    name: "DEMO YETKİSİZ KULLANICI",
    passwordHash: "0f7eb68f09a7790ee1536efefdd196b53bb64e7b1aebdc1dd330f253378980d4",
  },
};

export function demoAuthEnabled(env: DemoAuthEnvironment): boolean {
  if (String(env.FILO_DEMO_AUTH_ENABLED || "").toLowerCase() === "true") return true;
  return String(env.APP_ENV || "development").toLowerCase() !== "production";
}

export function demoAccount(username: string): DemoAccount | null {
  const account = DEMO_ACCOUNTS[username.trim().toLowerCase() as DemoAccount["username"]];
  return account ? { username: account.username, email: account.email, name: account.name } : null;
}

export async function verifyDemoCredentials(
  env: DemoAuthEnvironment,
  username: string,
  password: string,
): Promise<DemoAccount | null> {
  if (!demoAuthEnabled(env)) return null;
  const normalized = username.trim().toLowerCase() as DemoAccount["username"];
  const account = DEMO_ACCOUNTS[normalized];
  if (!account) return null;
  const actual = await sha256(`${normalized}:${password}`);
  return secureEqual(actual, account.passwordHash)
    ? { username: account.username, email: account.email, name: account.name }
    : null;
}

export async function createDemoSession(
  env: DemoAuthEnvironment,
  account: DemoAccount,
  now = Date.now(),
): Promise<string | null> {
  const secret = sessionSecret(env);
  if (!secret) return null;
  const expires = Math.floor(now / 1000) + DEMO_SESSION_MAX_AGE_SECONDS;
  const body = `${account.username}.${expires}`;
  return `${body}.${await hmac(secret, body)}`;
}

export async function readDemoSession(
  env: DemoAuthEnvironment,
  token: string | undefined,
  now = Date.now(),
): Promise<DemoAccount | null> {
  if (!token || !demoAuthEnabled(env)) return null;
  const secret = sessionSecret(env);
  if (!secret) return null;
  const [username, expiresText, signature, extra] = token.split(".");
  if (extra || !username || !expiresText || !signature) return null;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(now / 1000)) return null;
  const body = `${username}.${expiresText}`;
  if (!secureEqual(await hmac(secret, body), signature)) return null;
  return demoAccount(username);
}

function sessionSecret(env: DemoAuthEnvironment): string | null {
  const configured = String(env.FILO_DEMO_SESSION_SECRET || "");
  if (configured.length >= 32) return configured;
  return String(env.APP_ENV || "development").toLowerCase() === "production"
    ? null
    : LOCAL_DEMO_SECRET;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
