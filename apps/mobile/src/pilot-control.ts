import type { MobilePilotConfiguration } from "@filo/contracts";

export type PilotControlDecision = {
  stopTracking: boolean;
  syncNow: boolean;
  message: string | null;
};

export function decidePilotControl(configuration: MobilePilotConfiguration): PilotControlDecision {
  const pauseCommand = configuration.commands.some((command) => command.type === "pause_tracking");
  const syncCommand = configuration.commands.some((command) => command.type === "sync_now");
  if (configuration.requiredAction === "upgrade") {
    return {
      stopTracking: true,
      syncNow: false,
      message: `Uygulama güncellemesi gerekli. En düşük sürüm: ${configuration.policy.minimumAppVersion ?? "belirlenmedi"}.`,
    };
  }
  if (configuration.requiredAction === "pause" || pauseCommand) {
    return {
      stopTracking: true,
      syncNow: false,
      message: pauseCommand
        ? "Filo yöneticisi konum takibini uzaktan durdurdu."
        : "Firma genelinde mobil konum takibi geçici olarak durduruldu.",
    };
  }
  return {
    stopTracking: false,
    syncNow: syncCommand,
    message: syncCommand ? "Filo yöneticisinin eşitleme isteği uygulanıyor." : null,
  };
}
