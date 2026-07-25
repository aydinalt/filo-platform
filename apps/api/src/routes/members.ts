import type { FastifyInstance } from "fastify";
import { updateMemberRoleSchema, type Member } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

export async function memberRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireSession, allow("owner", "admin")] }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const result = await client.query<Member>(`SELECT u.id AS "userId",u.full_name AS "fullName",
        u.email,m.role,m.created_at AS "createdAt" FROM memberships m
        JOIN users u ON u.id=m.user_id WHERE m.tenant_id=$1 ORDER BY m.created_at`,
        [request.sessionUser.tenantId]);
      return { members: result.rows.map(r=>({...r,createdAt:new Date(r.createdAt).toISOString()})) };
    }));

  app.patch("/:userId/role", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed=updateMemberRoleSchema.safeParse(request.body);
    const target=(request.params as {userId?:string}).userId;
    if(!parsed.success||!target||target===request.sessionUser.id) return reply.code(400).send({error:"INVALID_INPUT"});
    const user=request.sessionUser;
    const member=await withTenantTransaction(user.tenantId,user.id,async(client)=>{
      const result=await client.query<Member>(`UPDATE memberships SET role=$1
        WHERE tenant_id=$2 AND user_id=$3 AND role<>'owner' RETURNING user_id AS "userId",role`,
        [parsed.data.role,user.tenantId,target]);
      if(!result.rows[0]) return null;
      const full=await client.query<Member>(`SELECT u.id AS "userId",u.full_name AS "fullName",
        u.email,m.role,m.created_at AS "createdAt" FROM memberships m JOIN users u ON u.id=m.user_id
        WHERE m.tenant_id=$1 AND m.user_id=$2`,[user.tenantId,target]);
      await client.query(`INSERT INTO audit_events
        (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
        VALUES ($1,$2,'member.role_changed','membership',$3,jsonb_build_object('role',$4))`,
        [user.tenantId,user.id,target,parsed.data.role]);
      return full.rows[0]!;
    });
    if(!member) return reply.code(404).send({error:"MEMBER_NOT_FOUND"});
    return {member:{...member,createdAt:new Date(member.createdAt).toISOString()}};
  });
}
