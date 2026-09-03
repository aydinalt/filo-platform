import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
// This file is an immutable baseline. Later PostgreSQL-specific migrations are
// maintained separately and must never be folded back into the initial schema.
const INITIAL_BASELINE_MAX_INDEX = 12;
const files = readdirSync(join(root, "drizzle"))
  .filter(name => /^\d+.*\.sql$/.test(name))
  .filter(name => Number(name.slice(0, 4)) <= INITIAL_BASELINE_MAX_INDEX)
  .sort();
const tenantTables = new Set();
let sql = files.map(name => readFileSync(join(root, "drizzle", name), "utf8")).join("\n");
sql = sql.replaceAll("--> statement-breakpoint", "");
sql = sql.replace(/`([^`]+)`/g, '"$1"');
sql = sql.replace(/\binteger\s+DEFAULT\s+false\b/gi, "integer DEFAULT 0");
sql = sql.replace(/\binteger\s+DEFAULT\s+true\b/gi, "integer DEFAULT 1");
sql = sql.replace(/\bblob\b/gi, "bytea");
sql = sql.replace(/\breal\b/gi, "double precision");
sql = sql.replace(/("[^"]+_at")\s+text(?!\s+DEFAULT\s+'')/gi, "$1 timestamptz");
sql = sql.replace(
  /CREATE TRIGGER "audit_events_block_update"[\s\S]*?\nEND;\s*CREATE TRIGGER "audit_events_block_delete"[\s\S]*?\nEND;/,
  () => `CREATE OR REPLACE FUNCTION public.block_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
\tRAISE EXCEPTION 'audit_events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_block_update" BEFORE UPDATE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION public.block_audit_event_mutation();

CREATE TRIGGER "audit_events_block_delete" BEFORE DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION public.block_audit_event_mutation();`,
);

for (const match of sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
  if (/"tenant_id"\s+text[^\r\n,]*\bNOT NULL/i.test(match[2])) tenantTables.add(match[1]);
}

const policies = [...tenantTables].sort().map(table => `
REVOKE ALL ON public."${table}" FROM anon, authenticated;
ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_${table}" ON public."${table}";
CREATE POLICY "tenant_select_${table}" ON public."${table}" FOR SELECT TO authenticated
USING (public.is_tenant_member("${table}".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_${table}" ON public."${table}";
CREATE POLICY "tenant_insert_${table}" ON public."${table}" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("${table}".tenant_id));
DROP POLICY IF EXISTS "tenant_update_${table}" ON public."${table}";
CREATE POLICY "tenant_update_${table}" ON public."${table}" FOR UPDATE TO authenticated
USING (public.is_tenant_member("${table}".tenant_id))
WITH CHECK (public.is_tenant_member("${table}".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_${table}" ON public."${table}";
CREATE POLICY "tenant_delete_${table}" ON public."${table}" FOR DELETE TO authenticated
USING (public.is_tenant_member("${table}".tenant_id));`).join("\n");

const header = `-- Generated from immutable D1 migrations. Do not hand-edit.\n-- Target: Supabase PostgreSQL + PostGIS + tenant RLS\nBEGIN;\nCREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;\n`;
const membershipFunction = `
CREATE OR REPLACE FUNCTION public.is_tenant_member(target_tenant text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = target_tenant
      AND lower(tm.email) = lower(auth.jwt()->>'email')
      AND tm.active = 1
  );
$$;
REVOKE ALL ON FUNCTION public.is_tenant_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(text) TO authenticated;
`;

const tenantPolicy = `
REVOKE ALL ON public.tenants FROM anon, authenticated;
GRANT SELECT ON public.tenants TO authenticated;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member_select_tenant" ON public.tenants;
CREATE POLICY "member_select_tenant" ON public.tenants FOR SELECT TO authenticated
USING (public.is_tenant_member(tenants.id));

INSERT INTO storage.buckets (id, name, public) VALUES ('filo-private', 'filo-private', false)
ON CONFLICT (id) DO UPDATE SET public = false;
DROP POLICY IF EXISTS "tenant_read_private_files" ON storage.objects;
DROP POLICY IF EXISTS "tenant_write_private_files" ON storage.objects;
COMMIT;
`;

const outputDirectory = join(root, "supabase", "migrations");
mkdirSync(outputDirectory, { recursive: true });
const output = join(outputDirectory, "20260826000100_filo_initial.sql");
writeFileSync(output, `${header}${sql}\n${membershipFunction}\n${policies}\n${tenantPolicy}`);
console.log(`Generated ${output} from ${files.length} D1 migrations with ${tenantTables.size} tenant policy sets.`);
