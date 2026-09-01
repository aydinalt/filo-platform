import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source=await readFile(new URL("../app/ui-i18n.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const localizedModule=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const translate=localizedModule.translateUiText;

test("complete English locale covers public, operational, legal and readiness surfaces",()=>{
  const samples=new Map([
    ["Giriş yap","Sign in"],
    ["Araç / Sürücü","Vehicle / Driver"],
    ["Yeni müşteri","New customer"],
    ["Ticari Süreç Akışı","Commercial Workflow"],
    ["Sürücü uygulaması","Driver app"],
    ["Zimmet & teslim","Custody & handover"],
    ["Bildirim operasyonları","Notification operations"],
    ["Kullanıcı ve rol özeti","User and role summary"],
    ["Hukuk & KVKK merkezi","Legal & privacy center"],
    ["Güvenlik denetimini çalıştır","Run security check"],
    ["Üretim kanıtı","Production evidence"],
    ["Fiziksel takip cihazını doğrula","Validate physical tracker"],
    ["Sistem dili","System language"],
    ["Destek talebi oluştur","Create support request"],
  ]);
  for(const [turkish,english] of samples)assert.equal(translate(turkish),english);
});

test("English locale translates dynamic counts, time and sorting microcopy",()=>{
  assert.equal(translate("12 kayıt görüntüleniyor"),"12 records displayed");
  assert.equal(translate("7 araç"),"7 vehicles");
  assert.equal(translate("3 gün önce"),"3 days ago");
  assert.equal(translate("son değişikliğe göre sıralı"),"sorted by last change");
});

test("locale runtime covers dynamic content and accessible attributes",()=>{
  assert.match(source,/MutationObserver/);
  assert.match(source,/childList:true,characterData:true,attributes:true/);
  assert.match(source,/\["placeholder","title","aria-label"\]/);
  assert.match(source,/localizeElement\(root,"tr"\)/);
});
