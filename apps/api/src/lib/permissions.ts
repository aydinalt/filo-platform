import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "@filo/contracts";

export function allow(...roles: SessionUser["role"][]) {
  return async function permissionGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!roles.includes(request.sessionUser.role)) {
      return reply.code(403).send({ error: "FORBIDDEN" });
    }
  };
}
