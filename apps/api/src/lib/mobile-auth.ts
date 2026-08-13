import type { FastifyReply, FastifyRequest } from "fastify";
import type { MobilePrincipal } from "@filo/contracts";
import { pool } from "@filo/database";
import { hashMobileSecret, parseMobileToken } from "./mobile-token.js";

type PrincipalRow = Omit<MobilePrincipal, "expiresAt"> & { expiresAt: Date };

export async function requireMobileCredential(request: FastifyRequest, reply: FastifyReply) {
  const authorization = request.headers.authorization ?? "";
  const parsed = parseMobileToken(authorization.startsWith("Bearer ") ? authorization.slice(7) : "");
  if (!parsed) return reply.code(401).send({ error: "MOBILE_AUTH_REQUIRED" });

  const result = await pool.query<PrincipalRow>(
    `SELECT credential_id AS "credentialId", tenant_id AS "tenantId",
         actor_user_id AS "actorUserId", assignment_id AS "assignmentId",
         vehicle_plate AS "vehiclePlate", driver_name AS "driverName",
         device_name AS "deviceName", device_manufacturer AS "deviceManufacturer",
         device_model AS "deviceModel", platform, expires_at AS "expiresAt"
     FROM authenticate_mobile_credential($1,$2)`,
    [parsed.id, hashMobileSecret(parsed.secret)],
  );
  const principal = result.rows[0];
  if (!principal) return reply.code(401).send({ error: "MOBILE_CREDENTIAL_INVALID" });
  request.mobilePrincipal = { ...principal, expiresAt: principal.expiresAt.toISOString() };
}
