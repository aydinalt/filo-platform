import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const config=JSON.parse(await readFile(resolve(root,"config/release-gates-04-15.json"),"utf8"));
const manifestArg=process.argv.find(arg=>arg.startsWith("--manifest="));
const manifestPath=manifestArg?resolve(process.cwd(),manifestArg.slice("--manifest=".length)):null;
const goLive=process.argv.includes("--go-live");
const blockers=[];
const warnings=[];
const requiredOrders=Array.from({length:12},(_,index)=>index+4);
const gates=Array.isArray(config.gates)?config.gates:[];
if(config.schemaVersion!=="FILO_RELEASE_GATES_04_15_V1")blockers.push("Kapı sözleşmesi sürümü geçersiz.");
if(JSON.stringify(gates.map(gate=>gate.order))!==JSON.stringify(requiredOrders))blockers.push("Kapılar 4–15 arasında eksiksiz ve sıralı olmalıdır.");
if(new Set(gates.map(gate=>gate.id)).size!==12)blockers.push("Kapı kimlikleri benzersiz olmalıdır.");

const [contractSource,serverSource,uiSource]=await Promise.all([
  readFile(resolve(root,"lib/readiness-contract.ts"),"utf8"),
  readFile(resolve(root,"lib/platform-store.ts"),"utf8"),
  readFile(resolve(root,"app/page.tsx"),"utf8"),
]);
for(const gate of gates){
  if(!contractSource.includes(gate.id))blockers.push(`${gate.id}: ortak sözleşmede eksik.`);
  if(!serverSource.includes(`key===\"${gate.id}\"`)&&!serverSource.includes(`\"${gate.id}\":[`))blockers.push(`${gate.id}: sunucu kabul kontrolü eksik.`);
  const template=resolve(root,"docs/production-evidence",String(gate.template||""));
  try{if((await stat(template)).size<20)blockers.push(`${gate.id}: kanıt şablonu boş.`)}catch{blockers.push(`${gate.id}: ${gate.template} eksik.`)}
}
if(!uiSource.includes("READINESS_GATES"))blockers.push("Yayın Merkezi ortak kapı sözleşmesini kullanmıyor.");
if(!serverSource.includes("scan_status='CLEAN' AND length(sha256)=64"))blockers.push("Temiz ve SHA-256 özetli kanıt zorunluluğu eksik.");
const softwareBlockerCount=blockers.length;

let evidenceStatus="EXTERNAL_EVIDENCE_REQUIRED";
if(manifestPath){
  let manifest;
  try{manifest=JSON.parse(await readFile(manifestPath,"utf8"))}catch{blockers.push("Kanıt manifestosu okunamadı veya geçerli JSON değil.");}
  if(manifest){
    if(manifest.format!=="FILO_READINESS_EVIDENCE_MANIFEST_V2")blockers.push("Kanıt manifestosu V2 formatında olmalıdır.");
    const rows=Array.isArray(manifest.gates)?manifest.gates:[];
    for(const gate of gates){
      const row=rows.find(item=>item.id===gate.id);
      if(!row){blockers.push(`${gate.id}: manifestoda eksik.`);continue}
      if(row.status!=="BAŞARILI")blockers.push(`${gate.id}: BAŞARILI değil.`);
      const executed=Date.parse(String(row.executedAt||"")),ageDays=(Date.now()-executed)/86400000;
      if(!Number.isFinite(executed)||executed>Date.now()+300000)blockers.push(`${gate.id}: test tarihi geçersiz.`);
      else if(ageDays>gate.freshnessDays)blockers.push(`${gate.id}: kanıt ${gate.freshnessDays} günlük sınırı aşıyor.`);
      const evidence=Array.isArray(row.evidence)?row.evidence:[];
      if(!evidence.length)blockers.push(`${gate.id}: kanıt dosyası yok.`);
      for(const file of evidence){
        if(file.scanStatus!=="CLEAN")blockers.push(`${gate.id}: temiz taramadan geçmeyen kanıt var.`);
        if(!/^[a-f0-9]{64}$/iu.test(String(file.sha256||"")))blockers.push(`${gate.id}: SHA-256 özeti geçersiz.`);
      }
    }
    if(!blockers.length)evidenceStatus="READY_FOR_CONTROLLED_ROLLOUT";
  }
}else warnings.push("Gerçek panel kanıt manifestosu verilmedi; yazılım hazır olsa da canlı kapılar kapanmış sayılmaz.");

if(goLive&&!manifestPath)blockers.push("--go-live için --manifest=<dosya> zorunludur.");
const result={format:"FILO_RELEASE_GATES_AUDIT_V1",scope:"4-15",softwareStatus:softwareBlockerCount?"BLOCKED":"PASSED",evidenceStatus,status:blockers.length?"BLOCKED":evidenceStatus,checkedGates:gates.map(({order,id,owner,freshnessDays})=>({order,id,owner,freshnessDays})),blockers,warnings,secretValuesIncluded:false};
console.log(JSON.stringify(result,null,2));
if(blockers.length)process.exitCode=1;
