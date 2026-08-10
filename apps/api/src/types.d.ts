import type { SessionUser } from "@filo/contracts";

declare module "fastify" {
  interface FastifyRequest {
    sessionUser: SessionUser;
    sessionId: string;
  }
}
