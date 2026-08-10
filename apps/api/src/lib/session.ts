import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@filo/contracts";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.sessionSecret);
const sessionIssuer = "filo-api";
const sessionAudience = "filo-web";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type SessionTokenClaims = {
  user: SessionUser;
  sessionId: string;
};

export async function createSessionToken(user: SessionUser, sessionId: string): Promise<string> {
  if (!uuidPattern.test(sessionId)) throw new Error("Invalid session identifier");
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setJti(sessionId)
    .setIssuer(sessionIssuer)
    .setAudience(sessionAudience)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionTtlHours}h`)
    .sign(secret);
}

export async function readSessionToken(token: string): Promise<SessionTokenClaims> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
    issuer: sessionIssuer,
    audience: sessionAudience,
  });
  if (
    typeof payload.id !== "string" ||
    typeof payload.tenantId !== "string" ||
    typeof payload.tenantName !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.fullName !== "string" ||
    typeof payload.jti !== "string" ||
    !uuidPattern.test(payload.jti) ||
    !["owner", "admin", "operator", "viewer"].includes(String(payload.role))
  ) {
    throw new Error("Invalid session");
  }
  return {
    user: payload as unknown as SessionUser,
    sessionId: payload.jti,
  };
}
