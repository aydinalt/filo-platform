BEGIN;
SELECT plan(8);

INSERT INTO public.tenants (id,name) VALUES ('hw-alpha','HW ALPHA'),('hw-beta','HW BETA');
INSERT INTO public.tenant_members (tenant_id,email,name,role,active) VALUES ('hw-alpha','hw-alpha@example.com','HW ALPHA','Owner',1),('hw-beta','hw-beta@example.com','HW BETA','Owner',1);
INSERT INTO public.hardware_sim_cards (id,tenant_id,iccid,operator,apn,status,created_by) VALUES ('SIM-A','hw-alpha','8944500101234567891','MNO','iot','ACTIVE','system'),('SIM-B','hw-beta','8990012345678901231','MNO','iot','ACTIVE','system');
INSERT INTO public.hardware_device_assignments (id,tenant_id,device_id,vehicle_id,imei,iccid,provider,model_code,protocol,status,firmware_version,assigned_by) VALUES ('HWA-A','hw-alpha','GPS-A','CAR-A','490154203237518','8944500101234567891','TELTONIKA','FMC920','CODEC8E','ACTIVE','03.29.00','system'),('HWA-B','hw-beta','GPS-B','CAR-B','356938035643809','8990012345678901231','QUECLINK','GV57MG_PLUS','ATRACK_PROFILE_V1','ACTIVE','1.0','system');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"hw-alpha@example.com","sub":"00000000-0000-0000-0000-000000000011"}';
SELECT results_eq($$SELECT id FROM public.hardware_device_assignments ORDER BY id$$,$$VALUES ('HWA-A'::text)$$,'alpha sees only its device assignment');
SELECT results_eq($$SELECT id FROM public.hardware_sim_cards ORDER BY id$$,$$VALUES ('SIM-A'::text)$$,'alpha sees only its SIM');
SELECT throws_ok($$INSERT INTO public.hardware_sim_cards (id,tenant_id,iccid,created_by) VALUES ('SIM-X','hw-alpha','8944500101234567891','alpha')$$,'42501',NULL,'browser cannot insert SIM');
SELECT throws_ok($$UPDATE public.hardware_device_assignments SET vehicle_id='CAR-X' WHERE id='HWA-A'$$,'42501',NULL,'browser cannot rewrite assignment');
SELECT throws_ok($$DELETE FROM public.hardware_device_assignments WHERE id='HWA-A'$$,'42501',NULL,'browser cannot delete assignment');

SET LOCAL request.jwt.claims = '{"role":"authenticated","email":"hw-beta@example.com","sub":"00000000-0000-0000-0000-000000000012"}';
SELECT results_eq($$SELECT id FROM public.hardware_device_assignments ORDER BY id$$,$$VALUES ('HWA-B'::text)$$,'beta sees only its device assignment');
SELECT is(public.is_tenant_member('hw-alpha'),false,'beta cannot assume alpha membership');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.hardware_device_assignments$$,'42501',NULL,'anonymous users cannot read assignments');

SELECT * FROM finish();
ROLLBACK;
