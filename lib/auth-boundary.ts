export function isSupabaseRuntime(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "supabase";
}

export function shouldAcceptSitesIdentityHeaders(value: unknown): boolean {
  return !isSupabaseRuntime(value);
}
