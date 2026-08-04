import type { FastifyInstance } from "fastify";
import { runNotificationProviderIncidentScanSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { runNotificationProviderIncidentScan } from "../lib/notification-provider-incident-scan.js";
import { requireNotificationWorker } from "../lib/worker-auth.js";

export async function notificationHealthScanRoutes(app: FastifyInstance) {
  app.post("/run", { preHandler: requireNotificationWorker }, async (request, reply) => {
    const parsed = runNotificationProviderIncidentScanSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_SCAN_REQUEST" });
    const input = parsed.data;
    const result = await withTenantTransaction(input.tenantId, input.actorUserId, client =>
      runNotificationProviderIncidentScan(client, input.tenantId, input.actorUserId, input.scanKey, "scheduler")
    );
    return reply.code(result.skipped ? 200 : 202).send(result);
  });
}
