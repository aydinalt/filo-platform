import type { FastifyInstance } from "fastify";
import { runMobileReleaseGuardSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { runMobileReleaseGuard } from "../lib/mobile-release-guard.js";
import { requireNotificationWorker } from "../lib/worker-auth.js";

export async function mobileReleaseGuardRoutes(app: FastifyInstance) {
  app.post("/run", { preHandler: requireNotificationWorker }, async (request, reply) => {
    const parsed = runMobileReleaseGuardSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_GUARD_REQUEST" });
    const input = parsed.data;
    const result = await withTenantTransaction(input.tenantId, input.actorUserId, (client) =>
      runMobileReleaseGuard(client, input.tenantId, input.actorUserId, input.runKey));
    return reply.code(result.skipped ? 200 : 202).send(result);
  });
}
