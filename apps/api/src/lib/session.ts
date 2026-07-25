import { SignJWT, jwtVerify } from "jose";
import type { SessionUser } from "@filo/contracts";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.sessionSecret);

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.sessionTtlHours}h`)
    .sign(secret);
}

export async function readSessionToken(token: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
  if (
    typeof payload.id !== "string" ||
    typeof payload.tenantId !== "string" ||
    typeof payload.tenantName !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.fullName !== "string" ||
    !["owner", "admin", "operator", "viewer"].includes(String(payload.role))
  ) {
    throw new Error("Invalid session");
  }
  return payload as unknown as SessionUser;
}
