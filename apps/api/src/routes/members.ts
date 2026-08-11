import type { FastifyInstance } from "fastify";
import {
  createMemberInvitationSchema,
  updateMemberAccessSchema,
  updateMemberRoleSchema,
  type Member,
  type MemberInvitation,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { createInvitationToken, hashInvitationToken } from "../lib/invitation-token.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type InvitationRow = Omit<MemberInvitation, "status" | "expiresAt" | "createdAt"> & {
  status: MemberInvitation["status"];
  expiresAt: Date;
  createdAt: Date;
};

function serializeMember(member: Member): Member {
  return {
    ...member,
    createdAt: new Date(member.createdAt).toISOString(),
    disabledAt: member.disabledAt ? new Date(member.disabledAt).toISOString() : null,
  };
}

function serializeInvitation(invitation: InvitationRow): MemberInvitation {
  return {
    ...invitation,
    expiresAt: new Date(invitation.expiresAt).toISOString(),
    createdAt: new Date(invitation.createdAt).toISOString(),
  };
}

const memberSelect = `SELECT u.id AS "userId", u.full_name AS "fullName",
  u.email, m.role, CASE WHEN u.disabled_at IS NULL THEN 'active' ELSE 'disabled' END AS status,
  u.disabled_at AS "disabledAt", m.created_at AS "createdAt"
  FROM memberships m JOIN users u ON u.id = m.user_id`;

export async function memberRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireSession, allow("owner", "admin")] }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const result = await client.query<Member>(
        `${memberSelect} WHERE m.tenant_id = $1 ORDER BY m.created_at`,
        [request.sessionUser.tenantId],
      );
      return { members: result.rows.map(serializeMember) };
    }));

  app.get("/invitations", { preHandler: [requireSession, allow("owner", "admin")] }, async (request) =>
    withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async (client) => {
      const result = await client.query<InvitationRow>(
        `SELECT id, email, role,
          CASE
            WHEN accepted_at IS NOT NULL THEN 'accepted'
            WHEN revoked_at IS NOT NULL THEN 'revoked'
            WHEN expires_at <= now() THEN 'expired'
            ELSE 'pending'
          END AS status,
          expires_at AS "expiresAt", created_at AS "createdAt"
         FROM membership_invitations
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 100`,
        [request.sessionUser.tenantId],
      );
      return { invitations: result.rows.map(serializeInvitation) };
    }));

  app.post("/invitations", { preHandler: [requireSession, allow("owner", "admin")] }, async (request, reply) => {
    const parsed = createMemberInvitationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    if (request.sessionUser.role === "admin" && parsed.data.role === "admin") {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }

    const tokenSecret = createInvitationToken();
    const tokenHash = hashInvitationToken(tokenSecret);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const result = await withTenantTransaction(
      request.sessionUser.tenantId,
      request.sessionUser.id,
      async (client) => {
        const existingUser = await client.query(
          `SELECT 1 FROM users WHERE email = $1 LIMIT 1`,
          [parsed.data.email],
        );
        if (existingUser.rows[0]) return { conflict: "EMAIL_ALREADY_REGISTERED" as const };

        await client.query(
          `UPDATE membership_invitations
           SET revoked_at = now()
           WHERE tenant_id = $1 AND email = $2
             AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now()`,
          [request.sessionUser.tenantId, parsed.data.email],
        );
        const existingInvite = await client.query(
          `SELECT 1 FROM membership_invitations
           WHERE tenant_id = $1 AND email = $2
             AND accepted_at IS NULL AND revoked_at IS NULL
           LIMIT 1`,
          [request.sessionUser.tenantId, parsed.data.email],
        );
        if (existingInvite.rows[0]) return { conflict: "INVITATION_ALREADY_PENDING" as const };

        const inserted = await client.query<InvitationRow>(
          `INSERT INTO membership_invitations
            (tenant_id, email, role, token_hash, invited_by, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, email, role, 'pending'::text AS status,
                     expires_at AS "expiresAt", created_at AS "createdAt"`,
          [
            request.sessionUser.tenantId,
            parsed.data.email,
            parsed.data.role,
            tokenHash,
            request.sessionUser.id,
            expiresAt,
          ],
        );
        const invitation = inserted.rows[0]!;
        await client.query(
          `INSERT INTO audit_events
            (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
           VALUES ($1,$2,'member.invitation_created','membership_invitation',$3,
             jsonb_build_object('email',$4,'role',$5,'expiresAt',$6))`,
          [
            request.sessionUser.tenantId,
            request.sessionUser.id,
            invitation.id,
            invitation.email,
            invitation.role,
            invitation.expiresAt,
          ],
        );
        return { invitation };
      },
    );
    if ("conflict" in result) return reply.code(409).send({ error: result.conflict });
    return reply.code(201).send({
      invitation: serializeInvitation(result.invitation),
      token: `${request.sessionUser.tenantId}.${tokenSecret}`,
    });
  });

  app.post("/invitations/:invitationId/revoke", { preHandler: [requireSession, allow("owner", "admin")] }, async (request, reply) => {
    const invitationId = (request.params as { invitationId?: string }).invitationId ?? "";
    if (!UUID_PATTERN.test(invitationId)) return reply.code(400).send({ error: "INVALID_INPUT" });
    const revoked = await withTenantTransaction(
      request.sessionUser.tenantId,
      request.sessionUser.id,
      async (client) => {
        const result = await client.query(
          `UPDATE membership_invitations SET revoked_at = now()
           WHERE id = $1 AND tenant_id = $2
             AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
           RETURNING id`,
          [invitationId, request.sessionUser.tenantId],
        );
        if (!result.rows[0]) return false;
        await client.query(
          `INSERT INTO audit_events
            (tenant_id,actor_user_id,action,entity_type,entity_id)
           VALUES ($1,$2,'member.invitation_revoked','membership_invitation',$3)`,
          [request.sessionUser.tenantId, request.sessionUser.id, invitationId],
        );
        return true;
      },
    );
    if (!revoked) return reply.code(404).send({ error: "INVITATION_NOT_FOUND" });
    return reply.code(204).send();
  });

  app.patch("/:userId/role", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed = updateMemberRoleSchema.safeParse(request.body);
    const target = (request.params as { userId?: string }).userId ?? "";
    if (!parsed.success || !UUID_PATTERN.test(target) || target === request.sessionUser.id) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const user = request.sessionUser;
    const member = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<Member>(
        `UPDATE memberships SET role = $1
         WHERE tenant_id = $2 AND user_id = $3 AND role <> 'owner'
         RETURNING user_id AS "userId", role`,
        [parsed.data.role, user.tenantId, target],
      );
      if (!result.rows[0]) return null;
      const full = await client.query<Member>(
        `${memberSelect} WHERE m.tenant_id = $1 AND m.user_id = $2`,
        [user.tenantId, target],
      );
      await client.query(
        `INSERT INTO audit_events
          (tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES ($1,$2,'member.role_changed','membership',$3,jsonb_build_object('role',$4))`,
        [user.tenantId, user.id, target, parsed.data.role],
      );
      return full.rows[0]!;
    });
    if (!member) return reply.code(404).send({ error: "MEMBER_NOT_FOUND" });
    return { member: serializeMember(member) };
  });

  app.patch("/:userId/access", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed = updateMemberAccessSchema.safeParse(request.body);
    const target = (request.params as { userId?: string }).userId ?? "";
    if (!parsed.success || !UUID_PATTERN.test(target) || target === request.sessionUser.id) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const member = await withTenantTransaction(
      request.sessionUser.tenantId,
      request.sessionUser.id,
      async (client) => {
        const changed = await client.query<{ updated: boolean }>(
          `SELECT set_member_access($1,$2,$3,$4) AS updated`,
          [
            request.sessionUser.tenantId,
            request.sessionUser.id,
            target,
            parsed.data.enabled,
          ],
        );
        if (!changed.rows[0]?.updated) return null;
        const full = await client.query<Member>(
          `${memberSelect} WHERE m.tenant_id = $1 AND m.user_id = $2`,
          [request.sessionUser.tenantId, target],
        );
        return full.rows[0] ?? null;
      },
    );
    if (!member) return reply.code(404).send({ error: "MEMBER_NOT_FOUND" });
    return { member: serializeMember(member) };
  });
}
