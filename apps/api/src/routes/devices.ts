import type { FastifyInstance } from "fastify";
import { createDeviceSchema, type Device } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

type Row = Omit<Device, "createdAt"> & { createdAt: Date };
const serialize = (row: Row): Device => ({ ...row, createdAt: row.createdAt.toISOString() });
const select = `SELECT d.id,d.tenant_id AS "tenantId",d.ownership,d.platform,d.model,
 d.identifier,d.driver_id AS "driverId",r.full_name AS "driverName",d.status,
 d.created_at AS "createdAt" FROM devices d LEFT JOIN drivers r ON r.id=d.driver_id`;

export async function deviceRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireSession }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const result = await client.query<Row>(`${select} ORDER BY d.created_at DESC`);
      return { devices: result.rows.map(serialize) };
    }));

  app.post("/", { preHandler: [requireSession, allow("owner", "admin")] }, async (request, reply) => {
    const parsed = createDeviceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const user = request.sessionUser;
    const device = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      if (parsed.data.driverId) {
        const found = await client.query("SELECT 1 FROM drivers WHERE id=$1",[parsed.data.driverId]);
        if (!found.rowCount) return null;
      }
      const result = await client.query<{id:string}>(`INSERT INTO devices
        (tenant_id,ownership,platform,model,identifier,driver_id,status,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [user.tenantId,parsed.data.ownership,parsed.data.platform,parsed.data.model,
        parsed.data.ownership==="company" ? parsed.data.identifier ?? null : null,
        parsed.data.driverId,parsed.data.status,user.id]);
      await client.query(`INSERT INTO audit_events
        (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES ($1,$2,'device.created','device',$3,jsonb_build_object('model',$4,'ownership',$5))`,
        [user.tenantId,user.id,result.rows[0]!.id,parsed.data.model,parsed.data.ownership]);
      return (await client.query<Row>(`${select} WHERE d.id=$1`,[result.rows[0]!.id])).rows[0]!;
    });
    if (!device) return reply.code(400).send({error:"DRIVER_NOT_FOUND"});
    return reply.code(201).send({device:serialize(device)});
  });
}
