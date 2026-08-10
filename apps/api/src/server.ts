import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDatabasePool } from "@filo/database";
import { createShutdownHandler } from "./shutdown.js";

const app = await buildApp();
await app.listen({ host: "0.0.0.0", port: config.port });

const shutdown = createShutdownHandler({
  closeApp: () => app.close(),
  closeDatabase: closeDatabasePool,
  log: {
    info: (details, message) => app.log.info(details, message),
    error: (details, message) => app.log.error(details, message),
  },
  setExitCode: (code) => {
    process.exitCode = code;
  },
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    const forcedExit = setTimeout(() => process.exit(1), 10_000);
    forcedExit.unref();
    void shutdown(signal).finally(() => clearTimeout(forcedExit));
  });
}
