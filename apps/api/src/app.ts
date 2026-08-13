import Fastify, { LogController } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { checkDatabaseConnection } from "@filo/database";
import { config } from "./config.js";
import { requireTrustedMutation } from "./lib/csrf.js";
import {
  createLoggerOptions,
  createRequestId,
  safeErrorLogDetails,
} from "./observability.js";
import { authRoutes } from "./routes/auth.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { auditRoutes } from "./routes/audit.js";
import { driverRoutes } from "./routes/drivers.js";
import { deviceRoutes } from "./routes/devices.js";
import { memberRoutes } from "./routes/members.js";
import { operationRoutes } from "./routes/operations.js";
import { maintenanceRoutes } from "./routes/maintenance.js";
import { expenseRoutes } from "./routes/expenses.js";
import { documentRoutes } from "./routes/documents.js";
import { safetyRoutes } from "./routes/safety.js";
import { inspectionRoutes } from "./routes/inspections.js";
import { tireRoutes } from "./routes/tires.js";
import { incidentRoutes } from "./routes/incidents.js";
import { reportRoutes } from "./routes/reports.js";
import { actionRoutes } from "./routes/actions.js";
import { notificationRoutes } from "./routes/notifications.js";
import { deliveryRoutes } from "./routes/deliveries.js";
import { deliveryWorkerRoutes } from "./routes/delivery-worker.js";
import { notificationTemplateRoutes } from "./routes/notification-templates.js";
import { notificationProviderRoutes } from "./routes/notification-providers.js";
import { providerWebhookRoutes } from "./routes/provider-webhooks.js";
import { notificationSuppressionRoutes } from "./routes/notification-suppressions.js";
import { notificationAnalyticsRoutes } from "./routes/notification-analytics.js";
import { notificationProviderHealthRoutes } from "./routes/notification-provider-health.js";
import { notificationProviderIncidentRoutes } from "./routes/notification-provider-incidents.js";
import { notificationHealthScanRoutes } from "./routes/notification-health-scans.js";
import { notificationRetentionWorkerRoutes } from "./routes/notification-retention-worker.js";
import { notificationWorkerScopeRoutes } from "./routes/notification-worker-scopes.js";
import { onboardingRoutes } from "./routes/onboarding.js";
import { mobileRoutes } from "./routes/mobile.js";
import { mobilePilotRunRoutes } from "./routes/mobile-pilot-runs.js";
import { mobilePilotReleaseRoutes } from "./routes/mobile-pilot-release.js";
import { mobileReleaseRolloutRoutes } from "./routes/mobile-release-rollouts.js";

type BuildAppOptions = {
  readinessCheck?: () => Promise<void>;
};

export async function buildApp({ readinessCheck = checkDatabaseConnection }: BuildAppOptions = {}) {
  const app = Fastify({
    logger: createLoggerOptions(config.logLevel),
    genReqId: createRequestId,
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    trustProxy: config.trustProxyHops === 0 ? false : config.trustProxyHops,
    bodyLimit: config.requestBodyLimitBytes,
    requestTimeout: config.requestTimeoutMs,
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, { origin: config.webOrigin, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    return requireTrustedMutation(request, reply);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url === "/api" || request.url.startsWith("/api/")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = Number((error as { statusCode?: number }).statusCode);
    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
      const errorCode =
        statusCode === 400
          ? "INVALID_REQUEST"
          : statusCode === 401
            ? "AUTH_REQUIRED"
            : statusCode === 403
              ? "FORBIDDEN"
              : statusCode === 404
                ? "NOT_FOUND"
                : statusCode === 413
                  ? "PAYLOAD_TOO_LARGE"
                  : statusCode === 429
                    ? "RATE_LIMITED"
                    : "REQUEST_REJECTED";
      request.log.warn({ ...safeErrorLogDetails(error), statusCode }, "request rejected");
      return reply.code(statusCode).send({ error: errorCode });
    }
    request.log.error(safeErrorLogDetails(error), "request failed");
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (request, reply) => {
    try {
      await readinessCheck();
      return { status: "ready" };
    } catch (error) {
      request.log.warn(
        { errorType: error instanceof Error ? error.name : "UnknownError" },
        "readiness check failed",
      );
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(onboardingRoutes, { prefix: "/api/onboarding" });
  await app.register(mobileRoutes, { prefix: "/api/mobile" });
  await app.register(mobilePilotRunRoutes, { prefix: "/api/mobile" });
  await app.register(mobilePilotReleaseRoutes, { prefix: "/api/mobile" });
  await app.register(mobileReleaseRolloutRoutes, { prefix: "/api/mobile" });
  await app.register(vehicleRoutes, { prefix: "/api/vehicles" });
  await app.register(auditRoutes, { prefix: "/api/audit" });
  await app.register(driverRoutes, { prefix: "/api/drivers" });
  await app.register(deviceRoutes, { prefix: "/api/devices" });
  await app.register(memberRoutes, { prefix: "/api/members" });
  await app.register(operationRoutes, { prefix: "/api/operations" });
  await app.register(maintenanceRoutes, { prefix: "/api/maintenance" });
  await app.register(expenseRoutes, { prefix: "/api/expenses" });
  await app.register(documentRoutes, { prefix: "/api/documents" });
  await app.register(safetyRoutes, { prefix: "/api/safety-events" });
  await app.register(inspectionRoutes, { prefix: "/api/inspections" });
  await app.register(tireRoutes, { prefix: "/api/tires" });
  await app.register(incidentRoutes, { prefix: "/api/incidents" });
  await app.register(reportRoutes, { prefix: "/api/reports" });
  await app.register(actionRoutes, { prefix: "/api/actions" });
  await app.register(notificationRoutes, { prefix: "/api/notifications" });
  await app.register(deliveryRoutes, { prefix: "/api/notification-deliveries" });
  await app.register(deliveryWorkerRoutes, { prefix: "/api/internal/notification-worker" });
  await app.register(notificationTemplateRoutes, { prefix: "/api/notification-templates" });
  await app.register(notificationProviderRoutes, { prefix: "/api/notification-providers" });
  await app.register(providerWebhookRoutes, { prefix: "/api/provider-webhooks" });
  await app.register(notificationSuppressionRoutes, { prefix: "/api/notification-suppressions" });
  await app.register(notificationAnalyticsRoutes, { prefix: "/api/notification-analytics" });
  await app.register(notificationProviderHealthRoutes, { prefix: "/api/notification-provider-health" });
  await app.register(notificationProviderIncidentRoutes, { prefix: "/api/notification-provider-incidents" });
  await app.register(notificationHealthScanRoutes, { prefix: "/api/internal/notification-health-scans" });
  await app.register(notificationRetentionWorkerRoutes, { prefix: "/api/internal/notification-retention" });
  await app.register(notificationWorkerScopeRoutes, { prefix: "/api/internal/notification-worker-scopes" });

  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ method: request.method, url: request.url }, "route not found");
    reply.code(404).send({ error: "NOT_FOUND" });
  });
  return app;
}
