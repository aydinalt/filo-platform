BEGIN;

ALTER TABLE public.field_validation_runs ADD COLUMN IF NOT EXISTS runtime_event_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.field_validation_runs ADD COLUMN IF NOT EXISTS offline_queue_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.field_validation_runs ADD COLUMN IF NOT EXISTS flushed_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.field_validation_runs ADD COLUMN IF NOT EXISTS late_telemetry_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.field_validation_runs ADD COLUMN IF NOT EXISTS battery_sample_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.mobile_runtime_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  session_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('APP_STATE','NETWORK_STATE','LOCATION_BATCH','QUEUE_ENQUEUED','QUEUE_FLUSH_STARTED','QUEUE_FLUSH_COMPLETED','BATTERY_SAMPLE','SHIFT_STARTED','SHIFT_STOPPED','RUNTIME_RECOVERED','TERMINATION_LIMIT_ACKNOWLEDGED','QUEUE_OVERFLOW')),
  sequence bigint NOT NULL CHECK (sequence > 0),
  battery_percent integer NOT NULL DEFAULT -1 CHECK (battery_percent BETWEEN -1 AND 100),
  queue_depth integer NOT NULL DEFAULT 0 CHECK (queue_depth BETWEEN 0 AND 10000),
  network_type text NOT NULL DEFAULT 'UNKNOWN',
  app_state text NOT NULL DEFAULT 'UNKNOWN',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, device_id, id)
);
CREATE INDEX IF NOT EXISTS mobile_runtime_session_time_idx ON public.mobile_runtime_events(tenant_id, session_id, occurred_at);
CREATE INDEX IF NOT EXISTS mobile_runtime_type_time_idx ON public.mobile_runtime_events(tenant_id, event_type, occurred_at);

CREATE TABLE IF NOT EXISTS public.hardware_sim_cards (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  iccid text NOT NULL CHECK (iccid ~ '^[0-9]{18,22}$'),
  msisdn text NOT NULL DEFAULT '',
  operator text NOT NULL DEFAULT '',
  apn text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'STOCK' CHECK (status IN ('STOCK','ACTIVE','SUSPENDED','RETIRED')),
  activated_at timestamptz,
  suspended_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, iccid)
);
CREATE INDEX IF NOT EXISTS hardware_sim_tenant_status_idx ON public.hardware_sim_cards(tenant_id, status);

CREATE TABLE IF NOT EXISTS public.hardware_device_assignments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  vehicle_id text NOT NULL,
  imei text NOT NULL CHECK (imei ~ '^[0-9]{15}$'),
  iccid text NOT NULL CHECK (iccid ~ '^[0-9]{18,22}$'),
  provider text NOT NULL CHECK (provider IN ('TELTONIKA','QUECLINK')),
  model_code text NOT NULL CHECK (model_code IN ('FMC920','GV57MG_PLUS')),
  protocol text NOT NULL CHECK (protocol IN ('CODEC8E','ATRACK_PROFILE_V1')),
  transport text NOT NULL DEFAULT 'TCP_MQTT_HTTPS',
  status text NOT NULL DEFAULT 'PROVISIONED' CHECK (status IN ('PROVISIONED','ACTIVE','SUSPENDED','REVOKED')),
  firmware_version text NOT NULL DEFAULT '',
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_gateway_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, imei),
  UNIQUE (tenant_id, device_id)
);
CREATE INDEX IF NOT EXISTS hardware_assignment_tenant_vehicle_status_idx ON public.hardware_device_assignments(tenant_id, vehicle_id, status);
CREATE INDEX IF NOT EXISTS hardware_assignment_tenant_status_idx ON public.hardware_device_assignments(tenant_id, status, updated_at);

REVOKE ALL ON public.mobile_runtime_events, public.hardware_sim_cards, public.hardware_device_assignments FROM anon, authenticated;
GRANT SELECT ON public.mobile_runtime_events, public.hardware_sim_cards, public.hardware_device_assignments TO authenticated;

ALTER TABLE public.mobile_runtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_runtime_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select_mobile_runtime_events ON public.mobile_runtime_events;
CREATE POLICY tenant_select_mobile_runtime_events ON public.mobile_runtime_events FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.hardware_sim_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_sim_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select_hardware_sim_cards ON public.hardware_sim_cards;
CREATE POLICY tenant_select_hardware_sim_cards ON public.hardware_sim_cards FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

ALTER TABLE public.hardware_device_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hardware_device_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_select_hardware_device_assignments ON public.hardware_device_assignments;
CREATE POLICY tenant_select_hardware_device_assignments ON public.hardware_device_assignments FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));

COMMENT ON TABLE public.mobile_runtime_events IS 'Append-only phone runtime evidence written only by the server runtime.';
COMMENT ON TABLE public.hardware_device_assignments IS 'Tenant-bound IMEI, SIM, vehicle and protocol assignment; MQTT topics never determine tenant identity.';

COMMIT;
