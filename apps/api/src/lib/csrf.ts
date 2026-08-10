import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const NON_BROWSER_PREFIXES = ["/api/internal/", "/api/provider-webhooks/"];

export const csrfHeaderName = "x-filo-csrf";
export const csrfHeaderValue = "1";

export async function requireTrustedMutation(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (
    SAFE_METHODS.has(request.method) ||
    !request.url.startsWith("/api/") ||
    NON_BROWSER_PREFIXES.some((prefix) => request.url.startsWith(prefix))
  ) {
    return;
  }

  const csrfHeader = request.headers[csrfHeaderName];
  const origin = request.headers.origin;
  if (
    csrfHeader !== csrfHeaderValue ||
    (typeof origin === "string" && origin !== config.webOrigin)
  ) {
    return reply.code(403).send({ error: "CSRF_REJECTED" });
  }
}
