#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,"..");
const files=(await readdir(resolve(root,"drizzle"))).filter(name=>name.endsWith(".sql")).sort();
const journal=JSON.parse(await readFile(resolve(root,"drizzle/meta/_journal.json"),"utf8"));
const errors=[];
const prefixes=new Set();
for(const [index,file] of files.entries()){
  const match=file.match(/^(\d{4})_[a-z0-9_]+\.sql$/u);
  if(!match){errors.push(`${file}: dosya adı 0000_name.sql biçiminde değil`);continue}
  const prefix=Number(match[1]);if(prefixes.has(prefix))errors.push(`${file}: mükerrer migration numarası`);prefixes.add(prefix);
  if(prefix!==index)errors.push(`${file}: sıra ${String(index).padStart(4,"0")} olmalı`);
  const sql=await readFile(resolve(root,"drizzle",file),"utf8");if(!sql.trim())errors.push(`${file}: boş migration`);
  if(/\bDROP\s+(?:TABLE|COLUMN)\b/iu.test(sql)&&!/FILO_DESTRUCTIVE_MIGRATION_APPROVED/u.test(sql))errors.push(`${file}: yıkıcı işlem için FILO_DESTRUCTIVE_MIGRATION_APPROVED açıklaması gerekli`);
}
const tags=(journal.entries??[]).map(entry=>`${entry.tag}.sql`);
if(JSON.stringify(tags)!==JSON.stringify(files))errors.push("drizzle/meta/_journal.json SQL migration sırasıyla eşleşmiyor");
const supabaseDirectory=resolve(root,"supabase/migrations");
const supabaseFiles=(await readdir(supabaseDirectory)).filter(name=>name.endsWith(".sql")).sort();
for(const file of supabaseFiles){
  if(!/^\d{14}_[a-z0-9_]+\.sql$/u.test(file))errors.push(`${file}: Supabase migration adı YYYYMMDDHHMMSS_name.sql biçiminde değil`);
  const sql=await readFile(resolve(supabaseDirectory,file),"utf8");
  if(!/\bBEGIN;[\s\S]*\bCOMMIT;/iu.test(sql))errors.push(`${file}: transaction sınırı eksik`);
  if(/GRANT\s+(?:ALL|[^;]*(?:INSERT|UPDATE|DELETE))[^;]*TO\s+(?:anon|authenticated)/iu.test(sql))errors.push(`${file}: tarayıcı rollerine doğrudan yazma yetkisi verilemez`);
  if(/\b(?:AUTOINCREMENT|PRAGMA)\b|\bWITHOUT\s+ROWID\b|\bINSERT\s+OR\s+(?:REPLACE|IGNORE)\b|\bSELECT\s+RAISE\s*\(/iu.test(sql))errors.push(`${file}: PostgreSQL ile uyumsuz SQLite sözdizimi içeriyor`);
}
const combinedSupabase=(await Promise.all(supabaseFiles.map(file=>readFile(resolve(supabaseDirectory,file),"utf8")))).join("\n");
const tenantTables=new Set();
for(const match of combinedSupabase.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\);/giu)){
  if(/"?tenant_id"?\s+/iu.test(match[2]))tenantTables.add(match[1]);
}
const rlsTables=new Set([...combinedSupabase.matchAll(/ALTER TABLE\s+(?:public\.)?"?([a-z0-9_]+)"?\s+ENABLE ROW LEVEL SECURITY/giu)].map(match=>match[1]));
for(const table of tenantTables)if(!rlsTables.has(table))errors.push(`${table}: tenant tablosunda RLS etkin değil`);
for(const marker of ["ENABLE ROW LEVEL SECURITY","filo-private", "configure_operations_tick", "vault.create_secret", "REVOKE ALL ON public.\"module_records\" FROM anon, authenticated"])if(!combinedSupabase.includes(marker))errors.push(`Supabase güvenlik işareti eksik: ${marker}`);
console.log(JSON.stringify({format:"FILO_MIGRATION_LINT_V2",status:errors.length?"BLOCKED":"PASSED",migrations:files.length,supabaseMigrations:supabaseFiles.length,errors},null,2));
if(errors.length)process.exitCode=1;
