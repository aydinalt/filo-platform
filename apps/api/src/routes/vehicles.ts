import type { FastifyInstance } from "fastify";
import { createVehicleSchema, updateVehicleStatusSchema, type Vehicle } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";

type VehicleRow = {
  id: string; tenantId: string; plate: string; make: string; model: string;
  year: number; status: Vehicle["status"]; createdAt: Date;
};

const serialize = (row: VehicleRow): Vehicle => ({ ...row, createdAt: row.createdAt.toISOString() });

export async function vehicleRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireSession }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<VehicleRow>(
        `SELECT id, tenant_id AS "tenantId", plate, make, model, year, status,
                created_at AS "createdAt"
         FROM vehicles ORDER BY created_at DESC`
      );
      return { vehicles: result.rows.map(serialize) };
    });
  });

  app.post("/", { preHandler: requireSession }, async (request, reply) => {
    const user = request.sessionUser;
    if (!["owner", "admin", "operator"].includes(user.role)) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const parsed = createVehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    try {
      const vehicle = await withTenantTransaction(user.tenantId, user.id, async (client) => {
        const result = await client.query<VehicleRow>(
          `INSERT INTO vehicles (tenant_id, plate, make, model, year, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, tenant_id AS "tenantId", plate, make, model, year, status,
                     created_at AS "createdAt"`,
          [user.tenantId, parsed.data.plate, parsed.data.make, parsed.data.model,
           parsed.data.year, parsed.data.status, user.id]
        );
        const created = result.rows[0]!;
        await client.query(
          `INSERT INTO audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'vehicle.created', 'vehicle', $3, jsonb_build_object('plate', $4))`,
          [user.tenantId, user.id, created.id, created.plate]
        );
        return serialize(created);
      });
      return reply.code(201).send({ vehicle });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "PLATE_ALREADY_EXISTS" });
      }
      throw error;
    }
  });

  app.patch("/:vehicleId/status", { preHandler: requireSession }, async (request, reply) => {
    const user = request.sessionUser;
    if (!["owner", "admin", "operator"].includes(user.role)) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
    const parsed = updateVehicleStatusSchema.safeParse(request.body);
    const vehicleId = (request.params as { vehicleId?: string }).vehicleId;
    if (!parsed.success || !vehicleId) return reply.code(400).send({ error: "INVALID_INPUT" });

    const vehicle = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const before = await client.query<{ status: Vehicle["status"] }>(
        "SELECT status FROM vehicles WHERE id = $1",
        [vehicleId]
      );
      if (!before.rows[0]) return null;
      const result = await client.query<VehicleRow>(
        `UPDATE vehicles SET status = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, tenant_id AS "tenantId", plate, make, model, year, status,
                   created_at AS "createdAt"`,
        [parsed.data.status, vehicleId]
      );
      const updated = result.rows[0]!;
      if (before.rows[0].status !== updated.status) {
        await client.query(
          `INSERT INTO audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'vehicle.status_changed', 'vehicle', $3,
                   jsonb_build_object('from', $4::text, 'to', $5::text, 'plate', $6::text))`,
          [user.tenantId, user.id, updated.id, before.rows[0].status, updated.status, updated.plate]
        );
      }
      return serialize(updated);
    });
    if (!vehicle) return reply.code(404).send({ error: "VEHICLE_NOT_FOUND" });
    return { vehicle };
  });
}
