export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.FILO_RUNTIME !== "supabase") return;
  const { createSupabaseRuntimeEnv } = await import("./lib/supabase-runtime");
  (globalThis as typeof globalThis & { __FILO_ENV?: ReturnType<typeof createSupabaseRuntimeEnv> }).__FILO_ENV = createSupabaseRuntimeEnv();
}
