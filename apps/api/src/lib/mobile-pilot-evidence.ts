import type { PoolClient } from "pg";
import type { MobilePilotEvidenceType } from "@filo/contracts";

export const REQUIRED_MOBILE_PILOT_EVIDENCE: readonly MobilePilotEvidenceType[] = [
  "permission_always",
  "heartbeat_online",
  "background_location",
  "offline_queue",
  "queue_recovered",
  "remote_control",
];

export function assessMobilePilotEvidence(types: Iterable<MobilePilotEvidenceType>) {
  const observed = new Set(types);
  const missing = REQUIRED_MOBILE_PILOT_EVIDENCE.filter((type) => !observed.has(type));
  return {
    passedCount: REQUIRED_MOBILE_PILOT_EVIDENCE.length - missing.length,
    requiredCount: REQUIRED_MOBILE_PILOT_EVIDENCE.length,
    missing,
    ready: missing.length === 0,
  };
}

export async function recordMobilePilotEvidence(
  client: PoolClient,
  tenantId: string,
  credentialId: string,
  type: MobilePilotEvidenceType,
  details: Record<string, unknown> = {},
) {
  await client.query(
    `INSERT INTO mobile_pilot_evidence(tenant_id, run_id, evidence_type, details)
     SELECT $1, run.id, $3, $4::jsonb
     FROM mobile_pilot_runs run
     WHERE run.tenant_id = $1 AND run.credential_id = $2 AND run.status = 'running'
     ON CONFLICT (run_id, evidence_type) DO UPDATE SET
       last_observed_at = now(),
       observation_count = mobile_pilot_evidence.observation_count + 1,
       details = EXCLUDED.details`,
    [tenantId, credentialId, type, JSON.stringify(details)],
  );
}
