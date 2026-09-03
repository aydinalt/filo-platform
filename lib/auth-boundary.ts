export function isSupabaseRuntime(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "supabase";
}

export function shouldAcceptSitesIdentityHeaders(runtime: unknown, deploymentTier?: unknown): boolean {
  return !isSupabaseRuntime(runtime) && String(deploymentTier || "prototype").trim().toLowerCase() !== "production";
}
