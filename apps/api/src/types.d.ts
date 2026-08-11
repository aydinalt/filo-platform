import type { MobilePrincipal, SessionUser } from "@filo/contracts";

declare module "fastify" {
  interface FastifyRequest {
    sessionUser: SessionUser;
    sessionId: string;
    mobilePrincipal: MobilePrincipal;
  }
}
