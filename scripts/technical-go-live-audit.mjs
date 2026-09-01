import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const strict=process.argv.includes("--strict");
const manifestArg=process.argv.find(arg=>arg.startsWith("--manifest="));
const manifestPath=manifestArg?.slice("--manifest=".length);
const plan=JSON.parse(await readFile(resolve("config/technical-go-live-plan.json"),"utf8"));
const blockers=[];
const expected=Array.from({length:14},(_,i)=>i+2);
if(plan.schemaVersion!=="FILO_TECHNICAL_GO_LIVE_V1")blockers.push("Teknik plan şeması geçersiz.");
if(JSON.stringify(plan.steps.map(step=>step.order))!==JSON.stringify(expected))blockers.push("Teknik plan 2-15 adımlarını sıralı içermeli.");
if(plan.legalGateDeferred!==true||plan.generalReleaseBlockedUntilLegalApproval!==true)blockers.push("Ertelenen hukuk kapısı genel yayını engellemeli.");
for(const step of plan.steps){if(!existsSync(resolve("docs/production-evidence",step.evidence)))blockers.push(`${step.id} kanıt şablonu eksik.`)}
for(const script of ["validate-capacity-budget.mjs","validate-release-gates.mjs"]){
  const run=spawnSync(process.execPath,[resolve("scripts",script)],{encoding:"utf8"});
  if(run.status!==0)blockers.push(`${script} doğrulaması başarısız.`);
}
let manifest=null;
if(manifestPath){try{manifest=JSON.parse(await readFile(resolve(manifestPath),"utf8"))}catch{blockers.push("Gerçek kanıt manifestosu okunamadı.")}}
const stepStatus=new Map((manifest?.steps||[]).map(step=>[step.id,step.status]));
const steps=plan.steps.map(step=>({...step,status:stepStatus.get(step.id)==="PASSED"?"PASSED":"REAL_EVIDENCE_REQUIRED"}));
if(strict&&steps.some(step=>step.status!=="PASSED"))blockers.push("2-15 için gerçek üretim/saha kanıtları tamamlanmadı.");
const softwareStatus=blockers.filter(x=>!x.includes("gerçek üretim/saha")).length?"BLOCKED":"PASSED";
const technicalStatus=blockers.length?"BLOCKED":steps.every(step=>step.status==="PASSED")?"PASSED":"EXTERNAL_ACTION_REQUIRED";
const result={format:"FILO_TECHNICAL_GO_LIVE_AUDIT_V1",scope:"2-15",legalGate:"DEFERRED_BLOCKING_GENERAL_RELEASE",technicalStatus,status:technicalStatus,softwareStatus,steps,blockers,secretValuesIncluded:false};
console.log(JSON.stringify(result,null,2));
if(blockers.length)process.exitCode=1;
