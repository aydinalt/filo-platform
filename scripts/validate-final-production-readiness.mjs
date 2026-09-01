#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { isAbsolute, resolve, sep } from "node:path";

const root=resolve(import.meta.dirname,".."),strict=process.argv.includes("--strict"),manifestArg=process.argv.find(value=>value.startsWith("--manifest=")),evidenceRootArg=process.argv.find(value=>value.startsWith("--evidence-root=")),config=JSON.parse(await readFile(resolve(root,"config/final-production-gates.json"),"utf8")),opsPolicy=JSON.parse(await readFile(resolve(root,"config/operations-center-policy.json"),"utf8")),blockers=[],warnings=[];
if(config.schemaVersion!=="FILO_FINAL_PRODUCTION_GATES_V3"||config.release!=="1.28.20")blockers.push("Final üretim kapısı sözleşmesi geçersiz.");
if(JSON.stringify(config.gates.map(item=>item.order))!==JSON.stringify([12,13,14,15,16,17,18]))blockers.push("Final kapılar 12–18 arasında sıralı olmalıdır.");
if(JSON.stringify(config.controlledRollout.map(item=>item.trafficPercent))!==JSON.stringify([0,5,25,100]))blockers.push("Kontrollü yayın iç kullanıcı, %5, %25 ve %100 sırasını izlemelidir.");
if(opsPolicy.schemaVersion!=="FILO_OPERATIONS_CENTER_POLICY_V1"||opsPolicy.requiredSignals.length!==9||opsPolicy.sweepIntervalMinutes>15||opsPolicy.evidenceFreshnessMinutes>20)blockers.push("Operasyon merkezi politikası eksik veya gevşek.");
const [store,operations,migration,ui]=await Promise.all([readFile(resolve(root,"lib/platform-store.ts"),"utf8"),readFile(resolve(root,"lib/operations-center.ts"),"utf8"),readFile(resolve(root,"supabase/migrations/20260828030000_v1_28_18_operations_center.sql"),"utf8"),readFile(resolve(root,"app/operations-center/page.tsx"),"utf8")]);
for(const marker of ["recordSecurityTestRun","recordDataAcceptance","recordPilotUat","recordProductionRollout","healthCoveragePassed","LEGAL_REVIEW_REQUIRED"])if(!store.includes(marker))blockers.push(`Sunucu kabul işareti eksik: ${marker}`);
for(const marker of opsPolicy.requiredSignals)if(!operations.includes(marker))blockers.push(`Operasyon sinyali eksik: ${marker}`);
for(const marker of ["FORCE ROW LEVEL SECURITY","REVOKE ALL","monitoring_escalations","operational_health_snapshots"])if(!migration.includes(marker))blockers.push(`Operasyon migration işareti eksik: ${marker}`);
for(const marker of ["Monitoring & Operations Center","GO_FOR_OBSERVABILITY_GATE","acknowledge","resolve"])if(!ui.includes(marker))blockers.push(`Operasyon ekranı işareti eksik: ${marker}`);
for(const script of ["validate-capacity-budget.mjs","validate-release-gates.mjs"]){const run=spawnSync(process.execPath,[resolve(root,"scripts",script)],{cwd:root,encoding:"utf8"});if(run.status!==0)blockers.push(`${script} başarısız.`)}

const metricChecks={
  OBSERVABILITY:m=>m.monitoringHours>=24&&m.openCritical===0&&m.deliveryTestPassed===true&&m.maximumSnapshotGapMinutes<=20,
  INDEPENDENT_SECURITY:m=>m.critical===0&&m.high===0&&m.tenantIsolationPassed===true&&m.privilegeEscalationPassed===true&&m.rlsBypassPassed===true&&m.uploadAttackPassed===true&&m.owaspAsvsPassed===true&&m.externalAuditor===true,
  PERFORMANCE_CAPACITY:m=>m.concurrentUsers>=100&&m.p95Ms<=500&&m.p99Ms<=1000&&m.errorRatePercent<=1&&m.telemetryLoadMeasured===true&&m.monthlyCostMeasured===true,
  LEGAL_KVKK:m=>m.officialLegalApproval===true&&m.locationNoticeApproved===true&&m.retentionDeletionApproved===true&&m.subprocessorsApproved===true,
  DATA_MIGRATION:m=>m.modules>=4&&m.rollbackPassed===true&&m.reconciliationMismatchCount===0,
  PILOT_UAT:m=>m.companies>=2&&m.vehicles>=3&&m.criticalDefects===0&&m.writtenApprovals>=2,
  CONTROLLED_ROLLOUT:m=>JSON.stringify(m.phases)===JSON.stringify([0,5,25,100])&&m.rollbackPlansVerified===true&&m.healthCoveragePassed===true&&m.ownerGo===true,
};
const softwareBlockers=[...blockers];let evidenceStatus="EXTERNAL_EVIDENCE_REQUIRED";
if(manifestArg){
  let manifest;try{manifest=JSON.parse(await readFile(resolve(process.cwd(),manifestArg.slice(11)),"utf8"))}catch{blockers.push("Final kanıt manifestosu okunamadı.")}
  const evidenceRoot=evidenceRootArg?resolve(process.cwd(),evidenceRootArg.slice(16)):null,usedEvidence=new Set(),approvers=new Map();
  if(!evidenceRoot)blockers.push("Kanıt dosyalarını yeniden doğrulamak için --evidence-root=<dizin> zorunludur.");
  let canonicalEvidenceRoot=null;if(evidenceRoot){try{canonicalEvidenceRoot=await realpath(evidenceRoot)}catch{blockers.push("Kanıt kök dizini okunamadı.")}}
  if(manifest){
    if(manifest.format!=="FILO_FINAL_PRODUCTION_EVIDENCE_V3"||manifest.release!==config.release||manifest.environment!=="production")blockers.push("Final kanıt manifestosu kimliği geçersiz.");
    const rows=Array.isArray(manifest.gates)?manifest.gates:[];
    for(const gate of config.gates){
      const row=rows.find(item=>item.id===gate.id);if(!row){blockers.push(`${gate.id}: eksik.`);continue}
      if(row.status!=="PASSED")blockers.push(`${gate.id}: PASSED değil.`);
      const executed=Date.parse(String(row.executedAt||"")),age=(Date.now()-executed)/86400000;if(!Number.isFinite(executed)||executed>Date.now()+300000||age>gate.freshnessDays)blockers.push(`${gate.id}: kanıt tarihi geçersiz/bayat.`);
      const approver=String(row.approver||"").trim();if(approver.length<5)blockers.push(`${gate.id}: onaylayan eksik.`);else approvers.set(gate.id,approver.toLocaleLowerCase("tr-TR"));
      const metrics=row.metrics&&typeof row.metrics==="object"?row.metrics:{};if(!metricChecks[gate.id]?.(metrics))blockers.push(`${gate.id}: zorunlu eşik metrikleri geçmedi.`);
      const evidence=Array.isArray(row.evidence)?row.evidence:[];if(evidence.length<(gate.minimumEvidenceFiles||1))blockers.push(`${gate.id}: kanıt dosyası eksik.`);
      for(const file of evidence){
        const relativePath=String(file.relativePath||""),declaredHash=String(file.sha256||"").toLowerCase();
        if(!relativePath||isAbsolute(relativePath)||relativePath.split(/[\\/]/u).includes("..")||file.scanStatus!=="CLEAN"||!/^[a-f0-9]{64}$/u.test(declaredHash)){blockers.push(`${gate.id}: kanıt tanımı güvensiz/geçersiz.`);continue}
        if(usedEvidence.has(relativePath))blockers.push(`${gate.id}: kanıt yolu başka kapıda tekrar kullanılmış.`);usedEvidence.add(relativePath);
        if(!evidenceRoot||!canonicalEvidenceRoot)continue;const path=resolve(evidenceRoot,relativePath);if(path!==evidenceRoot&&!path.startsWith(`${evidenceRoot}${sep}`)){blockers.push(`${gate.id}: kanıt yolu kök dışına çıkıyor.`);continue}
        try{const linkInfo=await lstat(path),canonicalPath=await realpath(path);if(linkInfo.isSymbolicLink()||(canonicalPath!==canonicalEvidenceRoot&&!canonicalPath.startsWith(`${canonicalEvidenceRoot}${sep}`))){blockers.push(`${gate.id}: sembolik bağlantı veya kök dışı kanıt reddedildi.`);continue}const [bytes,info]=await Promise.all([readFile(canonicalPath),stat(canonicalPath)]),actualHash=createHash("sha256").update(bytes).digest("hex");if(!info.isFile()||info.size<=0||actualHash!==declaredHash||Number(file.sizeBytes)!==info.size)blockers.push(`${gate.id}: kanıt dosyası/hash/boyut eşleşmedi.`)}catch{blockers.push(`${gate.id}: kanıt dosyası okunamadı.`)}
      }
    }
    const distinctApprovers=new Set(approvers.values());if(approvers.size===config.gates.length&&distinctApprovers.size<4)blockers.push("Görevler ayrılığı için en az dört farklı final kapı onaylayanı zorunludur.");
    const independent=["INDEPENDENT_SECURITY","LEGAL_KVKK","CONTROLLED_ROLLOUT"].map(id=>approvers.get(id)).filter(Boolean);if(independent.length===3&&new Set(independent).size!==3)blockers.push("Güvenlik, hukuk ve owner rollout onaylayanları birbirinden farklı olmalıdır.");
    if(!blockers.length)evidenceStatus="READY_FOR_OWNER_GO";
  }
}else warnings.push("Gerçek bağımsız test, hukuk, pilot, kapasite ve rollout kanıt manifestosu verilmedi.");
if(strict&&!manifestArg)blockers.push("--strict için --manifest=<dosya> zorunludur.");
const result={format:"FILO_FINAL_PRODUCTION_READINESS_RESULT_V3",release:config.release,softwareStatus:softwareBlockers.length?"BLOCKED":"PASSED",evidenceStatus,status:blockers.length?"NO_GO":evidenceStatus==="READY_FOR_OWNER_GO"?"READY_FOR_OWNER_GO":"SOFTWARE_COMPLETE_EXTERNAL_EVIDENCE_REQUIRED",checkedGates:config.gates.map(({order,id,owner})=>({order,id,owner})),controlledRollout:config.controlledRollout,blockers,warnings,secretValuesIncluded:false};
console.log(JSON.stringify(result,null,2));if(blockers.length)process.exitCode=1;
