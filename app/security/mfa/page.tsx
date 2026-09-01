"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { enrollTotp, getMfaStatus, removeMfaFactor, supabaseAuthEnabled, verifyTotp } from "../../supabase-browser";
import styles from "./mfa.module.css";

type Factor={id:string;friendly_name?:string;status:string};

export default function MfaPage(){
  const [level,setLevel]=useState("-");const [factors,setFactors]=useState<Factor[]>([]);const [enrollment,setEnrollment]=useState<{id:string;totp:{qr_code:string;secret:string}}|null>(null);const [code,setCode]=useState("");const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  const refresh=async()=>{if(!supabaseAuthEnabled)return;const status=await getMfaStatus();setLevel(status.currentLevel||"aal1");setFactors(status.totp as Factor[])};
  useEffect(()=>{if(!supabaseAuthEnabled)return;let active=true;void getMfaStatus().then(status=>{if(active){setLevel(status.currentLevel||"aal1");setFactors(status.totp as Factor[])}}).catch(error=>{if(active)setMessage(error instanceof Error?error.message:"MFA durumu alınamadı")});return()=>{active=false}},[]);
  const enroll=async()=>{setBusy(true);setMessage("");try{setEnrollment(await enrollTotp());setMessage("Kodu doğrulayana kadar MFA etkin sayılmaz.")}catch(error){setMessage(error instanceof Error?error.message:"MFA başlatılamadı")}finally{setBusy(false)}};
  const verify=async()=>{if(!enrollment||!/^[0-9]{6}$/.test(code)){setMessage("6 haneli doğrulama kodunu girin.");return}setBusy(true);try{await verifyTotp(enrollment.id,code);setEnrollment(null);setCode("");await refresh();setMessage("MFA doğrulandı; kritik işlemler için AAL2 oturumu etkin.")}catch(error){setMessage(error instanceof Error?error.message:"Kod doğrulanamadı")}finally{setBusy(false)}};
  const remove=async(id:string)=>{setBusy(true);try{await removeMfaFactor(id);await refresh();setMessage("MFA faktörü kaldırıldı.")}catch(error){setMessage(error instanceof Error?error.message:"Faktör kaldırılamadı")}finally{setBusy(false)}};
  return <main className={styles.shell}><section className={styles.card}><header><span>HESAP GÜVENLİĞİ · V1.28.20</span><h1>Çok faktörlü doğrulama</h1><p>Üretimde üye, sağlayıcı, güvenlik, veri geçişi ve yayın işlemleri yalnız Supabase AAL2 oturumuyla çalışır.</p></header>{!supabaseAuthEnabled?<div className={styles.warning}>Supabase Auth yapılandırılmadığı için MFA etkinleştirilemez. Canlı Vercel ortam değişkenlerini tamamlayın.</div>:<><div className={styles.status}><b>Oturum seviyesi</b><strong className={level==="aal2"?styles.ok:styles.pending}>{level.toUpperCase()}</strong></div>{factors.map(factor=><div className={styles.factor} key={factor.id}><p><b>{factor.friendly_name||"Authenticator"}</b><small>{factor.status}</small></p><button disabled={busy} onClick={()=>void remove(factor.id)}>Kaldır</button></div>)}{!enrollment&&<button className={styles.primary} disabled={busy} onClick={()=>void enroll()}>Authenticator uygulaması ekle</button>}{enrollment&&<div className={styles.enroll}><Image unoptimized width={210} height={210} src={enrollment.totp.qr_code} alt="Authenticator QR kodu"/><p>QR kodunu authenticator uygulamanızla tarayın. Elle kurulum anahtarı:</p><code>{enrollment.totp.secret}</code><label>6 haneli kod<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))}/></label><button className={styles.primary} disabled={busy} onClick={()=>void verify()}>Kodu doğrula</button></div>}</>}{message&&<div className={styles.message}>{message}</div>}<Link href="/">Platforma dön</Link></section></main>;
}
