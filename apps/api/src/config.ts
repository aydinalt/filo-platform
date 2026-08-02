export const config = {
  port: Number(process.env.PORT ?? 3001),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 12),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  notificationWorkerKey: process.env.NOTIFICATION_WORKER_KEY ?? ""
};

if (config.sessionSecret.length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}
