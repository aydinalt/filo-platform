import type { CreateLocationEventInput } from "@filo/contracts";
import type { PoolClient } from "@filo/database";

function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export type LocationIngestionResult = "created" | "duplicate" | "inactive";

export async function ingestLocationEvent(
  client: PoolClient,
  tenantId: string,
  event: CreateLocationEventInput,
): Promise<LocationIngestionResult> {
  const eligible = await client.query(
    `SELECT 1 FROM vehicle_driver_assignments assignment
     JOIN work_shifts shift ON shift.assignment_id = assignment.id AND shift.status = 'active'
     JOIN tracking_statuses tracking ON tracking.assignment_id = assignment.id AND tracking.state = 'tracking'
     WHERE assignment.id = $1 AND assignment.tenant_id = $2 AND assignment.ended_at IS NULL`,
    [event.assignmentId, tenantId],
  );
  if (!eligible.rowCount) return "inactive";

  const recordedAt = new Date(event.recordedAt);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO location_events(
       tenant_id, assignment_id, event_id, recorded_at, latitude, longitude,
       accuracy_meters, speed_mps, heading_degrees
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tenant_id,event_id) DO NOTHING
     RETURNING id::text`,
    [
      tenantId, event.assignmentId, event.eventId, recordedAt, event.latitude,
      event.longitude, event.accuracyMeters, event.speedMps ?? null,
      event.headingDegrees ?? null,
    ],
  );
  if (!inserted.rowCount) return "duplicate";
  const locationEventId = inserted.rows[0]!.id;

  const fences = (await client.query<{
    id: string; latitude: number; longitude: number; radiusMeters: number;
  }>(
    `SELECT id, latitude, longitude, radius_meters AS "radiusMeters"
     FROM geofences WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId],
  )).rows;

  for (const fence of fences) {
    const inside = distanceMeters(event, fence) <= fence.radiusMeters;
    const previous = await client.query<{ isInside: boolean }>(
      `SELECT is_inside AS "isInside"
       FROM geofence_assignment_states
       WHERE tenant_id = $1 AND geofence_id = $2 AND assignment_id = $3
       FOR UPDATE`,
      [tenantId, fence.id, event.assignmentId],
    );
    if (!previous.rowCount) {
      await client.query(
        `INSERT INTO geofence_assignment_states(
           tenant_id, geofence_id, assignment_id, is_inside, last_location_event_id, observed_at
         ) VALUES($1,$2,$3,$4,$5,$6)`,
        [tenantId, fence.id, event.assignmentId, inside, locationEventId, recordedAt],
      );
      if (!inside) continue;
    } else {
      if (previous.rows[0]!.isInside === inside) {
        await client.query(
          `UPDATE geofence_assignment_states
           SET last_location_event_id = $4, observed_at = $5
           WHERE tenant_id = $1 AND geofence_id = $2 AND assignment_id = $3`,
          [tenantId, fence.id, event.assignmentId, locationEventId, recordedAt],
        );
        continue;
      }
      await client.query(
        `UPDATE geofence_assignment_states
         SET is_inside = $4, last_location_event_id = $5, observed_at = $6
         WHERE tenant_id = $1 AND geofence_id = $2 AND assignment_id = $3`,
        [tenantId, fence.id, event.assignmentId, inside, locationEventId, recordedAt],
      );
    }

    const transition = inside ? "entered" : "exited";
    const geofenceEvent = (await client.query<{ id: string }>(
      `INSERT INTO geofence_events(
         tenant_id, geofence_id, assignment_id, location_event_id, event_type, occurred_at
       ) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text`,
      [tenantId, fence.id, event.assignmentId, locationEventId, transition, recordedAt],
    )).rows[0]!;
    await client.query(
      `INSERT INTO operational_alerts(
         tenant_id, rule_id, assignment_id, location_event_id, geofence_event_id,
         type, occurred_at, metadata
       )
       SELECT $1, rule.id, $2, $3, $4, rule.type, $5,
              jsonb_build_object('geofenceId',$6)
       FROM alert_rules rule
       WHERE rule.tenant_id = $1 AND rule.status = 'active'
         AND rule.type = $7 AND rule.geofence_id = $6
       ON CONFLICT DO NOTHING`,
      [tenantId, event.assignmentId, locationEventId, geofenceEvent.id, recordedAt, fence.id, `geofence_${transition}`],
    );
  }

  if (event.speedMps !== null && event.speedMps !== undefined) {
    await client.query(
      `INSERT INTO operational_alerts(
         tenant_id, rule_id, assignment_id, location_event_id, type, occurred_at, metadata
       )
       SELECT $1, rule.id, $2, $3, 'speeding', $4,
              jsonb_build_object(
                'speedKph', round(($5::numeric * 3.6), 1),
                'thresholdKph', rule.threshold_kph
              )
       FROM alert_rules rule
       WHERE rule.tenant_id = $1 AND rule.status = 'active'
         AND rule.type = 'speeding' AND ($5 * 3.6) >= rule.threshold_kph
       ON CONFLICT DO NOTHING`,
      [tenantId, event.assignmentId, locationEventId, recordedAt, event.speedMps],
    );
  }
  return "created";
}
