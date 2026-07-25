import type { FastifyInstance } from "fastify";
import { createDriverSchema, type Driver } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

type Row = Omit<Driver, "createdAt"> & { createdAt: Date };
const serialize = (row: Row): Driver => ({ ...row, createdAt: row.createdAt.toISOString() });

export async function driverRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireSession }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const result = await client.query<Row>(`SELECT id, tenant_id AS "tenantId", full_name AS "fullName",
        phone, license_number AS "licenseNumber", status, created_at AS "createdAt"
        FROM drivers ORDER BY created_at DESC`);
      return { drivers: result.rows.map(serialize) };
    }));

  app.post("/", { preHandler: [requireSession, allow("owner", "admin")] }, async (request, reply) => {
    const parsed = createDriverSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const user = request.sessionUser;
    try {
      const driver = await withTenantTransaction(user.tenantId, user.id, async (client) => {
        const result = await client.query<Row>(`INSERT INTO drivers
          (tenant_id, full_name, phone, license_number, status, created_by)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, tenant_id AS "tenantId",
          full_name AS "fullName", phone, license_number AS "licenseNumber", status,
          created_at AS "createdAt"`, [user.tenantId, parsed.data.fullName, parsed.data.phone,
          parsed.data.licenseNumber ?? null, parsed.data.status, user.id]);
        const created = result.rows[0]!;
        await client.query(`INSERT INTO audit_events
          (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
          VALUES ($1,$2,'driver.created','driver',$3,jsonb_build_object('name',$4))`,
          [user.tenantId,user.id,created.id,created.fullName]);
        return serialize(created);
      });
      return reply.code(201).send({ driver });
    } catch (error) {
      if ((error as {code?:string}).code === "23505") return reply.code(409).send({error:"PHONE_ALREADY_EXISTS"});
      throw error;
    }
  });
}
