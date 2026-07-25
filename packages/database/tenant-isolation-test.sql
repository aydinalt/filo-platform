\set ON_ERROR_STOP on

BEGIN;
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000001', true);
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000001', true);
SELECT count(*) AS tenant_a_visible FROM vehicles;
COMMIT;

BEGIN;
SELECT set_config('app.tenant_id', '10000000-0000-4000-8000-000000000002', true);
SELECT set_config('app.user_id', '20000000-0000-4000-8000-000000000002', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vehicles WHERE tenant_id = '10000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'RLS FAILURE: tenant A vehicle visible to tenant B';
  END IF;
END
$$;
ROLLBACK;
