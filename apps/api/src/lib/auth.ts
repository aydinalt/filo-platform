import type { FastifyReply, FastifyRequest } from "fastify";
import { readSessionToken } from "./session.js";

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.filo_session;
  if (!token) return reply.code(401).send({ error: "AUTH_REQUIRED" });
  try {
    request.sessionUser = await readSessionToken(token);
  } catch {
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(401).send({ error: "INVALID_SESSION" });
  }
}
