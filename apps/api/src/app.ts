import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { vehicleRoutes } from "./routes/vehicles.js";
import { auditRoutes } from "./routes/audit.js";

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

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "INTERNAL_ERROR" });
  });
  return app;
}
