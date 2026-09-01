BEGIN;
SELECT plan(13);

INSERT INTO public.tenants (id, name) VALUES
  ('rls-alpha', 'RLS ALPHA'),
  ('rls-beta', 'RLS BETA');
INSERT INTO public.tenant_members (tenant_id, email, name, role, active) VALUES
  ('rls-alpha', 'alpha@example.com', 'ALPHA USER', 'Owner', 1),
  ('rls-beta', 'beta@example.com', 'BETA USER', 'Owner', 1);
INSERT INTO public.module_records (id, tenant_id, module, status, data, created_by) VALUES
  ('RLS-ALPHA-RECORD', 'rls-alpha', 'fleet', 'ACTIVE', '{}', 'alpha@example.com'),
  ('RLS-BETA-RECORD', 'rls-beta', 'fleet', 'ACTIVE', '{}', 'beta@example.com');

SELECT is(
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND EXISTS (SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=c.relname AND x.column_name='tenant_id') AND NOT c.relrowsecurity),
  0,
  'every tenant table has RLS enabled'
);
SELECT has_function('public', 'is_tenant_member', ARRAY['text'], 'tenant membership helper exists');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='storage' AND policyname IN ('tenant_read_private_files','tenant_write_private_files')), 0, 'browser roles have no direct private-file policy');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"alpha@example.com","sub":"00000000-0000-0000-0000-000000000001"}';
SELECT ok(public.is_tenant_member('rls-alpha'), 'alpha is recognized in its own tenant');
SELECT is(public.is_tenant_member('rls-beta'), false, 'alpha is not recognized in beta tenant');
SELECT results_eq($$SELECT id FROM public.tenants ORDER BY id$$, $$VALUES ('rls-alpha'::text)$$, 'alpha can only see its tenant identity');
SELECT throws_ok($$SELECT * FROM public.module_records$$, '42501', NULL, 'direct business-table reads are denied');
SELECT throws_ok($$INSERT INTO public.module_records (id,tenant_id,module,status,data,created_by) VALUES ('RLS-WRITE','rls-alpha','fleet','ACTIVE','{}','alpha@example.com')$$, '42501', NULL, 'direct inserts are denied');
SELECT throws_ok($$UPDATE public.module_records SET status='CHANGED' WHERE tenant_id='rls-alpha'$$, '42501', NULL, 'direct updates are denied');
SELECT throws_ok($$DELETE FROM public.module_records WHERE tenant_id='rls-alpha'$$, '42501', NULL, 'direct deletes are denied');

SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"beta@example.com","sub":"00000000-0000-0000-0000-000000000002"}';
SELECT results_eq($$SELECT id FROM public.tenants ORDER BY id$$, $$VALUES ('rls-beta'::text)$$, 'beta can only see its tenant identity');
SELECT is(public.is_tenant_member('rls-alpha'), false, 'beta cannot assume alpha membership');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.tenants$$, '42501', NULL, 'anonymous users cannot read tenant identities');

SELECT * FROM finish();
ROLLBACK;
