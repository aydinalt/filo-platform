import type {
  LaunchReadinessAssessment,
  LaunchReadinessEvidenceType,
} from "@filo/contracts";

export const launchReadinessEvidenceTypes: LaunchReadinessEvidenceType[] = [
  "privacy_legal",
  "backup_restore",
  "worker_continuity",
  "monitoring_alerts",
  "support_oncall",
  "rollback_drill",
];

export type LaunchReadinessFacts = {
  pilotApproval: boolean;
  completedRollout: boolean;
  activeIncidentCount: number;
};

export function assessLaunchReadiness(
  targetVersion: string,
  facts: LaunchReadinessFacts,
): LaunchReadinessAssessment {
  const checks: LaunchReadinessAssessment["checks"] = [
    {
      key: "pilot_approval",
      passed: facts.pilotApproval,
      detail: facts.pilotApproval
        ? "Hedef sürüm için aktif fiziksel pilot üretim onayı var."
        : "Hedef sürüm için aktif fiziksel pilot üretim onayı yok.",
    },
    {
      key: "completed_rollout",
      passed: facts.completedRollout,
      detail: facts.completedRollout
        ? "%100 kademeli dağıtım sağlık kapılarıyla tamamlandı."
        : "%100 kademeli dağıtım henüz tamamlanmadı.",
    },
    {
      key: "no_active_incidents",
      passed: facts.activeIncidentCount === 0,
      detail: facts.activeIncidentCount === 0
        ? "Hedef sürümde açık veya incelenen yayın olayı yok."
        : `${facts.activeIncidentCount} aktif yayın olayı kapatılmayı bekliyor.`,
    },
  ];
  return { targetVersion, ready: checks.every((check) => check.passed), checks };
}
