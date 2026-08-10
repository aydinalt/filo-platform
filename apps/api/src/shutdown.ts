type ShutdownSignal = "SIGTERM" | "SIGINT";

type ShutdownLogger = {
  info: (details: Record<string, unknown>, message: string) => void;
  error: (details: Record<string, unknown>, message: string) => void;
};

type ShutdownOptions = {
  closeApp: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  log: ShutdownLogger;
  setExitCode: (code: number) => void;
};

export function createShutdownHandler({
  closeApp,
  closeDatabase,
  log,
  setExitCode,
}: ShutdownOptions) {
  let shutdownPromise: Promise<void> | null = null;

  return (signal: ShutdownSignal) => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      log.info({ signal }, "graceful shutdown started");
      let failureCount = 0;

      try {
        await closeApp();
      } catch {
        failureCount += 1;
      }

      try {
        await closeDatabase();
      } catch {
        failureCount += 1;
      }

      if (failureCount > 0) {
        setExitCode(1);
        log.error(
          { signal, failureCount },
          "graceful shutdown completed with errors",
        );
        return;
      }

      log.info({ signal }, "graceful shutdown completed");
    })();

    return shutdownPromise;
  };
}
