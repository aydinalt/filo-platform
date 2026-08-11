import { loadWorkerConfig } from "./config.js";
import { WorkerApiClient } from "./api-client.js";
import { runWorker } from "./runtime.js";

const config = loadWorkerConfig();
const controller = new AbortController();
const write = (level: "info" | "warn", details: Record<string, unknown>, message: string) => {
  process.stdout.write(`${JSON.stringify({ level, time: new Date().toISOString(), ...details, message })}\n`);
};
const logger = {
  info: (details: Record<string, unknown>, message: string) => write("info", details, message),
  warn: (details: Record<string, unknown>, message: string) => write("warn", details, message),
};

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => controller.abort());
}

logger.info({ workerId: config.workerId }, "notification runtime started");
await runWorker(new WorkerApiClient(config), config, logger, controller.signal);
logger.info({ workerId: config.workerId }, "notification runtime stopped");
