import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  acceptMemberInvitationSchema,
  registerTenantSchema,
  type SessionUser,
} from "@filo/contracts";
import { pool } from "@filo/database";
import { config } from "../config.js";
import { hashPassword } from "../lib/password.js";
import { createSessionToken } from "../lib/session.js";
import { hashInvitationToken, parseInvitationToken } from "../lib/invitation-token.js";

const TERMS_VERSION = "terms-v1";
const PRIVACY_VERSION = "privacy-v1";

type OnboardingRow = {
  tenantId: string;
  tenantName: string;
  userId: string;
  email: string;
  fullName: string;
  role: SessionUser["role"];
};

type InvitationPreviewRow = {
  tenantName: string;
  email: string;
  role: "admin" | "operator" | "viewer";
  expiresAt: Date;
};

type DatabaseError = Error & { code?: string; constraint?: string };

function uniqueConflict(error: unknown) {
  const databaseError = error as DatabaseError;
  if (databaseError.code !== "23505") return null;
  if (databaseError.constraint === "tenants_slug_key") return "TENANT_SLUG_TAKEN";
  if (databaseError.constraint === "users_email_key") return "EMAIL_ALREADY_REGISTERED";
  return "ONBOARDING_CONFLICT";
}

async function setSession(reply: FastifyReply, row: OnboardingRow, sessionId: string) {
  const user: SessionUser = {
    id: row.userId,
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
  };
  const token = await createSessionToken(user, sessionId);
  reply.setCookie("filo_session", token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: config.sessionTtlHours * 60 * 60,
  });
  return user;
}

export async function onboardingRoutes(app: FastifyInstance) {
  app.post("/register", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const parsed = registerTenantSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
    try {
      const result = await pool.query<OnboardingRow>(
        `SELECT * FROM bootstrap_tenant_owner($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          parsed.data.tenantName,
          parsed.data.tenantSlug,
          parsed.data.email,
          parsed.data.fullName,
          hashPassword(parsed.data.password),
          TERMS_VERSION,
          PRIVACY_VERSION,
          sessionId,
          expiresAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Tenant bootstrap did not return an owner");
      return reply.code(201).send({ user: await setSession(reply, row, sessionId) });
    } catch (error) {
      const conflict = uniqueConflict(error);
      if (conflict) return reply.code(409).send({ error: conflict });
      throw error;
    }
  });

  app.get("/invitations/:token", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const token = (request.params as { token?: string }).token ?? "";
    const parsed = acceptMemberInvitationSchema.shape.token.safeParse(token);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const tokenParts = parseInvitationToken(parsed.data)!;
    const result = await pool.query<InvitationPreviewRow>(
      `SELECT * FROM inspect_membership_invitation($1,$2)`,
      [tokenParts.tenantId, hashInvitationToken(tokenParts.secret)],
    );
    const invitation = result.rows[0];
    if (!invitation) return reply.code(410).send({ error: "INVITATION_INVALID" });
    return {
      invitation: {
        ...invitation,
        expiresAt: new Date(invitation.expiresAt).toISOString(),
      },
    };
  });

  app.post("/invitations/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const parsed = acceptMemberInvitationSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
    const tokenParts = parseInvitationToken(parsed.data.token)!;
    try {
      const result = await pool.query<OnboardingRow>(
        `SELECT * FROM accept_membership_invitation($1,$2,$3,$4,$5,$6)`,
        [
          tokenParts.tenantId,
          hashInvitationToken(tokenParts.secret),
          parsed.data.fullName,
          hashPassword(parsed.data.password),
          sessionId,
          expiresAt,
        ],
      );
      const row = result.rows[0];
      if (!row) return reply.code(410).send({ error: "INVITATION_INVALID" });
      return { user: await setSession(reply, row, sessionId) };
    } catch (error) {
      const conflict = uniqueConflict(error);
      if (conflict) return reply.code(409).send({ error: conflict });
      throw error;
    }
  });
}
