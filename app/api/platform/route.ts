import {
  archiveRecord,
  createSupportTicket,
  createSubscriptionOrder,
  decodeVehicleVin,
  importVehicleCatalog,
  importTaxProfiles,
  issueDeviceToken,
  processOutbox,
  provisionHardwareDevice,
  recordDataAcceptance,
  recordFieldValidation,
  recordMobileRelease,
  recordPilotUat,
  recordProductionRollout,
  recordE2eAcceptance,
  recordSecurityTestRun,
  recordConsent,
  rescanTenantFiles,
  resolveSecurityFinding,
  requirePrivilegedAccess,
  requireWorkspace,
  runOperationalAutomations,
  runLocalizationSelfCheck,
  runObservabilityDrill,
  runSecuritySelfCheck,
  runSystemHealthCheck,
  runOperationsDisciplineAudit,
  runtimeEnv,
  saveMember,
  saveLegalProfile,
  saveRecord,
  saveSettings,
  saveTeam,
  saveOperationsControl,
  transitionRecord,
  transitionSupportTicket,
  verifyProviderConfiguration,
  workspaceSnapshot,
} from "../../../lib/platform-store";
import { assertRequestSize, assertSameOrigin, enforceRateLimit } from "../../../lib/security";

export const dynamic = "force-dynamic";

const PRIVILEGED_ACTIONS=new Set([
  "save-member","save-settings","save-legal-profile","rescan-files","verify-providers",
  "security-self-check","system-health-check","observability-drill","record-security-test",
  "resolve-security-finding","record-pilot-uat","record-mobile-release","record-production-rollout",
  "record-e2e-acceptance","import-vehicle-catalog","import-tax-profiles","save-operations-control",
  "run-operations-audit","record-field-validation","record-data-acceptance","provision-hardware-device",
  "issue-device-token",
]);

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  const message = error instanceof Error ? error.message : "Beklenmeyen sunucu hatası.";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const workspace = await requireWorkspace(false);
    return Response.json(await workspaceSnapshot(workspace), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);assertRequestSize(request,1024*1024);
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action || "");
    const workspace = await requireWorkspace(false);
    if(PRIVILEGED_ACTIONS.has(action))await requirePrivilegedAccess(workspace,action);
    await enforceRateLimit(runtimeEnv().DB,request,`platform:${action||"unknown"}`,new Set(["save-member","save-settings","save-legal-profile","rescan-files","security-self-check"]).has(action)?20:180,60,workspace.email);
    if (action === "save-record") return Response.json({ record: await saveRecord(workspace, { module: String(payload.module || ""), id: payload.id ? String(payload.id) : undefined, expectedVersion:payload.expectedVersion?Number(payload.expectedVersion):undefined, data: (payload.data || {}) as Record<string, unknown> }) });
    if (action === "transition-record") {
      const moduleName = String(payload.module || "");
      const id = String(payload.id || "");
      const transition = String(payload.transition || "");
      if (transition === "archive") { await archiveRecord(workspace, moduleName, id); return Response.json({ record: { id, module:moduleName, status: "ARŞİVLENDİ", data: {} } }); }
      return Response.json({ record: await transitionRecord(workspace, { module:moduleName, id, action: transition, status: payload.status ? String(payload.status) : undefined }) });
    }
    if (action === "archive-record") { await archiveRecord(workspace, String(payload.module || ""), String(payload.id || "")); return Response.json({ ok: true }); }
    if (action === "save-team") return Response.json({ team: await saveTeam(workspace, (payload.team || {}) as Record<string, unknown>) });
    if (action === "save-member") return Response.json({ member: await saveMember(workspace, (payload.member || {}) as Record<string, unknown>) });
    if (action === "save-settings") return Response.json({ settings: await saveSettings(workspace, (payload.settings || {}) as Record<string, unknown>) });
    if (action === "save-legal-profile") return Response.json({ legalProfile: await saveLegalProfile(workspace, (payload.legalProfile || {}) as Record<string, unknown>) });
    if (action === "rescan-files") return Response.json({ result: await rescanTenantFiles(workspace) });
    if (action === "support") return Response.json({ ticket: await createSupportTicket(workspace, (payload.ticket || {}) as Record<string, unknown>) });
    if (action === "consent") return Response.json({ consent: await recordConsent(workspace, (payload.consent || {}) as Record<string, unknown>) });
    if (action === "create-subscription-order") return Response.json({ order: await createSubscriptionOrder(workspace, (payload.order || {}) as Record<string, unknown>) });
    if (action === "process-outbox") return Response.json({ result: await processOutbox(workspace) });
    if (action === "verify-providers") return Response.json({ result: await verifyProviderConfiguration(workspace) });
    if (action === "run-automations") return Response.json({ result: await runOperationalAutomations(workspace) });
    if (action === "security-self-check") return Response.json({ result: await runSecuritySelfCheck(workspace) });
    if (action === "system-health-check") return Response.json({ result: await runSystemHealthCheck(workspace) });
    if (action === "observability-drill") return Response.json({ result: await runObservabilityDrill(workspace) });
    if (action === "localization-self-check") return Response.json({ result: await runLocalizationSelfCheck(workspace) });
    if (action === "record-security-test") return Response.json({ result: await recordSecurityTestRun(workspace,(payload.test||{}) as Record<string,unknown>) });
    if (action === "resolve-security-finding") return Response.json({ result: await resolveSecurityFinding(workspace,(payload.finding||{}) as Record<string,unknown>) });
    if (action === "record-pilot-uat") return Response.json({ result: await recordPilotUat(workspace,(payload.pilot||{}) as Record<string,unknown>) });
    if (action === "record-mobile-release") return Response.json({ result: await recordMobileRelease(workspace,(payload.release||{}) as Record<string,unknown>) });
    if (action === "record-production-rollout") return Response.json({ result: await recordProductionRollout(workspace,(payload.rollout||{}) as Record<string,unknown>) });
    if (action === "record-e2e-acceptance") return Response.json({ result: await recordE2eAcceptance(workspace,(payload.acceptance||{}) as Record<string,unknown>) });
    if (action === "import-vehicle-catalog") return Response.json({ result: await importVehicleCatalog(workspace,(payload.catalog||{}) as Record<string,unknown>) });
    if (action === "import-tax-profiles") return Response.json({ result: await importTaxProfiles(workspace,(payload.taxProfiles||{}) as Record<string,unknown>) });
    if (action === "decode-vehicle-vin") return Response.json({ result: await decodeVehicleVin(workspace,(payload.vehicle||{}) as Record<string,unknown>) });
    if (action === "save-operations-control") return Response.json({ result: await saveOperationsControl(workspace,(payload.control||{}) as Record<string,unknown>) });
    if (action === "run-operations-audit") return Response.json({ result: await runOperationsDisciplineAudit(workspace,(payload.audit||{}) as Record<string,unknown>) });
    if (action === "record-field-validation") return Response.json({ result: await recordFieldValidation(workspace,(payload.validation||{}) as Record<string,unknown>) });
    if (action === "record-data-acceptance") return Response.json({ result: await recordDataAcceptance(workspace,(payload.acceptance||{}) as Record<string,unknown>) });
    if (action === "provision-hardware-device") return Response.json({ assignment: await provisionHardwareDevice(workspace,(payload.device||{}) as Record<string,unknown>) });
    if (action === "transition-support") return Response.json({ ticket: await transitionSupportTicket(workspace, String(payload.id || ""), String(payload.status || "")) });
    if (action === "issue-device-token") return Response.json({ credential: await issueDeviceToken(workspace, {deviceId:String(payload.deviceId||""),provider:String(payload.provider||"MOBILE"),protocol:String(payload.protocol||"HTTPS_JSON_V1")}) });
    return Response.json({ error: "Geçersiz işlem." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
