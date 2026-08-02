import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
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

export async function buildApp() {
  const app = Fastify({ logger: true, trustProxy: true });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, { origin: config.webOrigin, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.get("/health", async () => ({ status: "ok" }));
  await app.register(authRoutes, { prefix: "/api/auth" });
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

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "INTERNAL_ERROR" });
  });
  return app;
}
