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

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "INTERNAL_ERROR" });
  });
  return app;
}
