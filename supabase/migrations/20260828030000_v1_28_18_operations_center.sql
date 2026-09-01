BEGIN;

ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS assigned_owner text NOT NULL DEFAULT '';
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS fingerprint text NOT NULL DEFAULT '';
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0);
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS first_detected_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS last_detected_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS acknowledge_due_at timestamptz;
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS escalation_due_at timestamptz;
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3);
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS runbook_url text NOT NULL DEFAULT '';
ALTER TABLE public.monitoring_events ADD COLUMN IF NOT EXISTS resolution_note text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_events_open_fingerprint_uq ON public.monitoring_events(tenant_id,fingerprint) WHERE status <> 'RESOLVED' AND fingerprint <> '';

CREATE TABLE IF NOT EXISTS public.operational_health_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('HEALTHY','DEGRADED')),
  application_error_count integer NOT NULL DEFAULT 0,
  stale_telemetry_count integer NOT NULL DEFAULT 0,
  failed_webhook_count integer NOT NULL DEFAULT 0,
  failed_cron_count integer NOT NULL DEFAULT 0,
  database_capacity_percent integer NOT NULL DEFAULT -1 CHECK (database_capacity_percent BETWEEN -1 AND 100),
  storage_capacity_percent integer NOT NULL DEFAULT -1 CHECK (storage_capacity_percent BETWEEN -1 AND 100),
  unavailable_provider_count integer NOT NULL DEFAULT 0,
  open_critical_count integer NOT NULL DEFAULT 0,
  metrics_source text NOT NULL DEFAULT 'INTERNAL',
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operational_health_tenant_time_idx ON public.operational_health_snapshots(tenant_id,checked_at DESC);

CREATE TABLE IF NOT EXISTS public.monitoring_escalations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  monitoring_event_id text NOT NULL REFERENCES public.monitoring_events(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 3),
  from_team text NOT NULL,
  to_team text NOT NULL,
  reason text NOT NULL,
  channel text NOT NULL DEFAULT 'IN_APP',
  delivery_status text NOT NULL DEFAULT 'RECORDED',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS monitoring_escalation_event_idx ON public.monitoring_escalations(tenant_id,monitoring_event_id,created_at DESC);

REVOKE ALL ON public.monitoring_events, public.operational_health_snapshots, public.monitoring_escalations FROM anon, authenticated;
GRANT SELECT ON public.monitoring_events, public.operational_health_snapshots, public.monitoring_escalations TO authenticated;

ALTER TABLE public.monitoring_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_insert_monitoring_events ON public.monitoring_events;
DROP POLICY IF EXISTS tenant_update_monitoring_events ON public.monitoring_events;
DROP POLICY IF EXISTS tenant_delete_monitoring_events ON public.monitoring_events;

ALTER TABLE public.operational_health_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_health_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select_operational_health_snapshots ON public.operational_health_snapshots;
CREATE POLICY tenant_select_operational_health_snapshots ON public.operational_health_snapshots FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.monitoring_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_escalations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select_monitoring_escalations ON public.monitoring_escalations;
CREATE POLICY tenant_select_monitoring_escalations ON public.monitoring_escalations FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

COMMENT ON TABLE public.operational_health_snapshots IS 'Append-only operations-center evidence written by the trusted server runtime.';
COMMENT ON TABLE public.monitoring_escalations IS 'Immutable alert escalation history; tenant browsers have read-only access.';

COMMIT;
